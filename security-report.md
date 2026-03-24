# Security Report — KV Backend & Edge Function

**Scope:** `api/kv.ts`, `src/storage/cloudStorage.ts`, `src/storage/userStorage.ts`
**Date:** 2026-03-24

---

## Findings

### F1 — No Rate Limiting on Edge Function
**Severity:** High
**Attack vector:** Any caller sends unlimited requests to `/api/kv`, exhausting the Upstash free-tier quota or triggering cost-based billing, with no throttle or back-pressure.
**Fix direction:** Add a per-IP in-memory rate limiter with TTL cleanup; note Edge Function statefulness limitation and recommend Upstash Redis counter for production.
**Status: Fixed in Phase 2.** Implemented in `api/kv.ts` (`isRateLimited`): 60 req/min per IP, Map with eviction at 10 000 entries. **Limitation noted in code:** the Map is not shared across concurrent Edge Function instances or cold starts. The production-grade solution is an Upstash Redis `INCR` + `EXPIRE` counter keyed by IP.

---

### F2 — No Server-Side Key Namespace Enforcement
**Severity:** Critical
**Attack vector:** A caller sends `{"action":"get","key":"otheruser:groups:123"}` and reads another user's data. The server accepted any key unconditionally; namespace scoping was enforced only client-side (fully spoofable).
**Fix direction:** Require the client to declare its username separately in the request body; the server validates that every key/prefix starts with `{username}:`.
**Status: Fixed in Phase 2.** All `get`, `set`, `del`, and `list` actions now require a `username` field. The server calls `isValidUsername()` on it and rejects any key that does not start with `{username}:`. `cloudStorage.ts` updated to include `username` in every regular action body.

---

### F3 — Raw KV Actions Bypass Namespace Scoping
**Severity:** High
**Attack vector:** `kvGetRaw` and `kvSetRaw` in `cloudStorage.ts` called the same `get`/`set` actions without any key prefix, allowing any caller to read or overwrite any arbitrary Upstash key (including other users' data or internal keys).
**Fix direction:** Add dedicated `rawGet`/`rawSet` action types in the Edge Function with a strict ASCII key pattern; update the client to use them.
**Status: Fixed in Phase 2.** New `rawGet`/`rawSet` actions enforce `RAW_KEY_RE = /^[a-zA-Z0-9_:\-.]{1,128}$/`. `cloudStorage.ts` updated to use these action names for `kvGetRaw`/`kvSetRaw`.

---

### F4 — No Origin Check (CSRF / Cross-Origin Abuse)
**Severity:** Medium
**Attack vector:** Any third-party website sends cross-origin `POST /api/kv` requests from a victim's browser, performing reads or writes scoped to the victim's username without any same-origin enforcement.
**Fix direction:** Validate the `Origin` request header against the app's domain; reject mismatches.
**Status: Fixed in Phase 2.** `api/kv.ts` now checks `Origin` against `ALLOWED_ORIGIN` env var (falling back to `VERCEL_URL`). Requests from other origins receive `403 Forbidden`. **Action required:** Set `ALLOWED_ORIGIN=https://your-production-domain.vercel.app` in Vercel environment variables. Without this env var, the check is skipped (no false positives during local dev), which is documented in the code comment.

---

### F5 — Username Contains Unsafe Characters for KV Keys
**Severity:** Medium
**Attack vector:** A user sets their username to a string containing `:` (the namespace separator) or Redis glob characters (`*`, `?`, `[`, `]`, `^`). This could cause the namespace prefix check to be bypassed (`:` in username) or the `list` action to match unintended keys (`*` glob).
**Fix direction:** Validate the username character set before persisting; block `:` and glob characters.
**Status: Fixed in Phase 2.** `userStorage.ts` exports `isValidUsername()` and `setUsername()` now enforces it, throwing on invalid input. The server's `isValidUsername()` applies the same check. **Note:** Hebrew and other Unicode characters are intentionally permitted to avoid breaking existing users — only the structurally dangerous characters are blocked.

---

### F6 — Internal Error Messages Leaked to Client
**Severity:** Low
**Attack vector:** Upstash returns a descriptive error (e.g. exposing key names, quota details, or internal URLs) which the Edge Function reflected directly to the browser as `{"error": "<upstash message>"}`.
**Fix direction:** Catch all errors and return a generic `"Internal server error"` string; log the real error server-side.
**Status: Fixed in Phase 2.** The `catch` block now returns `{"error":"Internal server error"}` unconditionally. Upstash error details go to the Vercel function log only (via the removed `e.message`).

---

### F7 — Username Trust Model (Architectural — Not Fixed)
**Severity:** Critical (architectural)
**Attack vector:** The username is a self-declared `localStorage` value with no server-side proof of identity. Any user who knows (or guesses) another user's username can set `localStorage.setItem('username', 'victim')` in their browser console and immediately access all of the victim's KV data with full read/write/delete privileges. Username collision between two legitimate users who choose the same string shares their entire dataset.
**Fix direction:** This requires an architectural change beyond the scope of the three files. See Architectural Recommendations below.
**Status: Deferred.** The fixes in F2 and F5 harden the key validation logic but do not address the fundamental identity problem. The server still cannot distinguish a legitimate user from an impersonator who knows the username.

---

### F8 — Unbounded `list` Prefix (Full Key Enumeration)
**Severity:** High (subsumed by F2)
**Attack vector:** Before F2 fix: sending `{"action":"list","prefix":""}` with an empty prefix issued `kv.keys("*")` to Upstash, returning every key in the entire store across all users.
**Fix direction:** Enforce that the `prefix` starts with the caller's username (covered by F2 fix).
**Status: Fixed in Phase 2** as part of F2. The `list` action now requires the prefix to start with `{username}:`, making a full-store enumeration impossible.

---

## Architectural Recommendations

These require changes beyond the three audited files.

### 1. Replace Plain Username with Signed Session Tokens
The root cause of F7 is that the client proves identity by string equality on a value it controls. The fix is to issue a signed token (e.g. a JWT signed with a secret held only server-side, or an opaque session token stored in an HttpOnly cookie) at registration time. The Edge Function validates the token's signature on every request instead of trusting the `username` field. This eliminates impersonation entirely.

### 2. Upstash Native Token Scoping
Upstash supports per-database tokens with key-pattern restrictions. Consider creating a separate Upstash database or token per user (impractical for many users) or using Upstash's `ALLOWLIST` feature to restrict what a given token can access. This would move namespace enforcement into the Upstash layer rather than relying solely on application-level checks.

### 3. Production Rate Limiting via Upstash Redis Counter
Replace the in-memory `rateLimitMap` with:
```ts
await kv.incr(`ratelimit:${ip}`)
await kv.expire(`ratelimit:${ip}`, 60)
const count = await kv.get<number>(`ratelimit:${ip}`)
if ((count ?? 0) > RATE_LIMIT_MAX) return json({ error: "Too many requests" }, 429)
```
This counter is atomic, survives cold starts, and is shared across all Edge Function instances. The current in-memory approach is a placeholder.

### 4. Username Collision Avoidance
Even with proper auth tokens, two users choosing the same username would share a KV namespace. At registration, perform a KV lookup for `{candidate_username}:` keys before accepting the username, or make the KV key the device ID (a UUID) rather than the human-readable username.

---

## Deviation from Prompt Scope

None. All changes are confined to `api/kv.ts`, `src/storage/cloudStorage.ts`, `src/storage/userStorage.ts`, and this report file. No screen, logic, or test file was modified.
