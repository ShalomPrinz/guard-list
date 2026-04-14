import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const config = { runtime: "edge" };

const kv = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// SECURITY: Sliding-window rate limiter backed by Redis — shared across all Edge Function
// instances and cold-start resistant. 60 requests per minute per IP.
const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "ratelimit",
});

// Dedicated rate limiter for guest citation submissions — tighter limit to prevent spam.
const guestRatelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  prefix: "ratelimit:guest",
});

// SECURITY: Username must not contain ':' (namespace separator) or Redis glob chars.
// Allows any Unicode letter/number/space so existing Hebrew usernames remain valid.
function isValidUsername(username: string): boolean {
  if (!username || username.length < 2 || username.length > 64) return false;
  // Disallow characters that could escape the KV namespace or inject glob patterns.
  return !/[:*?[\]^]/.test(username);
}

// SECURITY: Raw-action keys (device registration only) must start with the literal prefix
// "device:" followed by 1–128 characters that are not ':' (the namespace separator) or Redis
// glob chars. Unicode letters and spaces are allowed so Hebrew usernames can register.
// This structurally prevents any rawGet/rawSet key from overlapping with user-namespaced
// keys ({username}:{namespace}:{id}).
const RAW_KEY_RE = /^device:[^:*?[\]^]{1,128}$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleGuestSubmit(
  body: Record<string, unknown>,
  ip: string
): Promise<Response> {
  const { success: guestOk } = await guestRatelimit.limit(ip);
  if (!guestOk) return json({ error: "Too many requests" }, 429);

  const targetUsername =
    typeof body.targetUsername === "string" ? body.targetUsername.trim().toLowerCase() : "";
  if (!isValidUsername(targetUsername)) return json({ error: "Invalid targetUsername" }, 400);

  const text = typeof body.text === "string" ? body.text : "";
  if (!text || text.length > 500) return json({ error: "Invalid text" }, 400);

  const author = typeof body.author === "string" ? body.author : "";
  if (!author || author.length > 120) return json({ error: "Invalid author" }, 400);

  const id = crypto.randomUUID();
  await kv.set(`${targetUsername}:guestCitations:${id}`, { id, text, author, submittedAt: Date.now() });
  return json({ ok: true, id });
}

// SECURITY: rawGet/rawSet are a restricted escape hatch for device-registration keys only.
// Keys must match a safe ASCII pattern and cannot use username namespacing.
async function handleRawGet(body: Record<string, unknown>): Promise<Response> {
  const key = body.key as string;
  if (!key || !RAW_KEY_RE.test(key)) return json({ error: "Invalid key" }, 400);
  const value = await kv.get(key);
  return json({ value: value ?? null });
}

async function handleRawSet(body: Record<string, unknown>): Promise<Response> {
  const key = body.key as string;
  // SECURITY: rawGet/rawSet are a restricted escape hatch for device-registration keys only.
  // Keys must match a safe ASCII pattern and cannot use username namespacing.
  if (!key || !RAW_KEY_RE.test(key)) return json({ error: "Invalid key" }, 400);
  await kv.set(key, body.value);
  return json({ ok: true });
}

async function handleGet(
  body: Record<string, unknown>,
  ip: string,
  username: string,
  expectedPrefix: string
): Promise<Response> {
  const key = body.key as string;
  // SECURITY: Reject any key that escapes the caller's declared username namespace.
  if (!key || !key.startsWith(expectedPrefix)) {
    console.warn("[kv] namespace violation", { ip, username, key });
    return json({ error: "Key namespace violation" }, 403);
  }
  const value = await kv.get(key);
  return json({ value: value ?? null });
}

async function handleSet(
  body: Record<string, unknown>,
  ip: string,
  username: string,
  expectedPrefix: string
): Promise<Response> {
  const key = body.key as string;
  // SECURITY: Reject any key that escapes the caller's declared username namespace.
  if (!key || !key.startsWith(expectedPrefix)) {
    console.warn("[kv] namespace violation", { ip, username, key });
    return json({ error: "Key namespace violation" }, 403);
  }
  await kv.set(key, body.value);
  return json({ ok: true });
}

async function handleDel(
  body: Record<string, unknown>,
  ip: string,
  username: string,
  expectedPrefix: string
): Promise<Response> {
  const key = body.key as string;
  // SECURITY: Reject any key that escapes the caller's declared username namespace.
  if (!key || !key.startsWith(expectedPrefix)) {
    console.warn("[kv] namespace violation", { ip, username, key });
    return json({ error: "Key namespace violation" }, 403);
  }
  await kv.del(key);
  return json({ ok: true });
}

async function handleList(
  body: Record<string, unknown>,
  ip: string,
  username: string,
  expectedPrefix: string
): Promise<Response> {
  const prefix = body.prefix as string;
  // SECURITY: Reject any prefix that escapes the caller's declared username namespace.
  if (!prefix || !prefix.startsWith(expectedPrefix)) {
    console.warn("[kv] namespace violation", { ip, username, key: prefix });
    return json({ error: "Key namespace violation" }, 403);
  }
  // SECURITY: Reject suffix glob characters to prevent broader-than-intended key scans.
  const suffix = prefix.slice(expectedPrefix.length);
  if (suffix && !/^[a-zA-Z0-9_\-/:]+$/.test(suffix)) {
    return json({ error: "Invalid prefix" }, 400);
  }
  const allKeys = await kv.keys(`${prefix}*`);
  return json({ keys: allKeys });
}

async function handleMget(
  body: Record<string, unknown>,
  ip: string,
  username: string,
  expectedPrefix: string
): Promise<Response> {
  const keys = body.keys;
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 100) {
    return json({ error: "keys must be an array of 1–100 elements" }, 400);
  }
  for (const k of keys) {
    if (typeof k !== "string" || !k || !k.startsWith(expectedPrefix)) {
      console.warn("[kv] namespace violation in mget", { ip, username, key: k });
      return json({ error: "Key namespace violation" }, 403);
    }
  }
  const values = await kv.mget(...keys);
  return json({ values });
}

async function handleCrossSet(
  body: Record<string, unknown>,
  username: string
): Promise<Response> {
  const targetUsername =
    typeof body.targetUsername === "string" ? body.targetUsername.trim().toLowerCase() : "";
  if (!isValidUsername(targetUsername)) {
    return json({ error: "Invalid targetUsername" }, 400);
  }
  if (username === targetUsername) {
    return json({ error: "Cannot cross-write to own namespace" }, 400);
  }
  const key = body.key as string;
  // SECURITY: Strict allowlist — only these sub-keys may be written cross-namespace.
  const ALLOWED_CROSS_KEYS = ["share:groupInvitation", "share:acceptNotification", "share:rejectionNotification"] as const;
  if (!ALLOWED_CROSS_KEYS.includes(key as (typeof ALLOWED_CROSS_KEYS)[number])) {
    return json({ error: "Key not allowed for cross-write" }, 403);
  }
  // Enforce one-open-invitation-at-a-time rule for groupInvitation key.
  if (key === "share:groupInvitation") {
    // Check if target user exists (has a registered device key).
    // Use kv.get() for exact-key lookup — kv.keys() pattern matching over HTTP
    // mishandles usernames that contain spaces or non-ASCII characters.
    const deviceValue = await kv.get(`device:${targetUsername}`);
    if (deviceValue === null) {
      return json({ error: "User not found" }, 404);
    }
    // Check if target is already a member of a sharing group.
    const existingGroupId = await kv.get(`${targetUsername}:share:groupId`);
    if (existingGroupId !== null) {
      return json({ error: "Target already in a group" }, 422);
    }
    const existing = await kv.get(`${targetUsername}:share:groupInvitation`);
    if (existing !== null) {
      return json({ error: "Target already has a pending invitation" }, 409);
    }
  }
  await kv.set(`${targetUsername}:${key}`, body.value);
  return json({ ok: true });
}

async function handleCrossRead(
  body: Record<string, unknown>,
  username: string
): Promise<Response> {
  const partnerUsername =
    typeof body.partnerUsername === "string" ? body.partnerUsername.trim().toLowerCase() : "";
  if (!isValidUsername(partnerUsername)) {
    return json({ error: "Invalid partnerUsername" }, 400);
  }
  // SECURITY: Group-based consent check — both users must be in the same sharing group.
  const callerGroupId = await kv.get(`${username}:share:groupId`);
  const targetGroupId = await kv.get(`${partnerUsername}:share:groupId`);
  if (!callerGroupId || !targetGroupId || callerGroupId !== targetGroupId) {
    return json({ error: "not in same group" }, 403);
  }
  try {
    const allKeys = await kv.keys(`${partnerUsername}:citations:*`);
    const citations = await Promise.all(allKeys.map((k) => kv.get(k)));
    const deleteLog = (await kv.get(`${partnerUsername}:share:deleteLog`)) as string[] | null;
    return json({ citations: citations.filter(Boolean), deleteLog: deleteLog ?? [] });
  } catch {
    return json({ error: "Internal server error" }, 500);
  }
}

async function handleGroupCreate(username: string): Promise<Response> {
  const existing = await kv.get(`${username}:share:groupId`);
  if (existing !== null) {
    return json({ error: "Already in a group" }, 400);
  }
  const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await kv.set(`group:${groupId}:members`, [username]);
  await kv.set(`${username}:share:groupId`, groupId);
  return json({ groupId });
}

async function handleGroupJoin(
  body: Record<string, unknown>,
  username: string
): Promise<Response> {
  const groupId = typeof body.groupId === "string" ? body.groupId : "";
  if (!groupId) return json({ error: "Missing groupId" }, 400);
  const existing = await kv.get(`${username}:share:groupId`);
  if (existing !== null) {
    return json({ error: "Already in a group" }, 400);
  }
  const membersRaw = await kv.get(`group:${groupId}:members`);
  if (membersRaw === null) return json({ error: "Group not found" }, 404);
  const members: string[] = membersRaw as string[];
  members.push(username);
  await kv.set(`group:${groupId}:members`, members);
  await kv.set(`${username}:share:groupId`, groupId);
  return json({ ok: true });
}

async function handleGroupLeave(
  body: Record<string, unknown>,
  username: string
): Promise<Response> {
  const groupId = typeof body.groupId === "string" ? body.groupId : "";
  if (!groupId) return json({ error: "Missing groupId" }, 400);
  const storedGroupId = await kv.get(`${username}:share:groupId`);
  if (storedGroupId !== groupId) {
    return json({ error: "Not in this group" }, 403);
  }
  const membersRaw = await kv.get(`group:${groupId}:members`);
  if (membersRaw !== null) {
    const updated = (membersRaw as string[]).filter(m => m !== username);
    await kv.set(`group:${groupId}:members`, updated);
  }
  await kv.del(`${username}:share:groupId`);
  return json({ ok: true });
}

async function handleCheckBackupSuspension(username: string): Promise<Response> {
  const val = await kv.get(`${username}:backupSuspendedUntil`)
  if (val === null || typeof val !== 'number' || val <= Date.now()) {
    return json({ suspended: false })
  }
  return json({ suspended: true, suspendedUntil: val })
}

async function handleClearUserData(username: string): Promise<Response> {
  // Delete all user-namespaced keys in bulk
  const allKeys = await kv.keys(`${username}:*`);
  if (allKeys.length > 0) {
    await Promise.all(allKeys.map(k => kv.del(k)));
  }
  // Write opt-out preference back so it survives a localStorage wipe
  await kv.set(`${username}:prefs:noBackup`, true);
  return json({ ok: true });
}

async function handleInvitationCancel(
  body: Record<string, unknown>,
  username: string
): Promise<Response> {
  const targetUsername =
    typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : ''
  if (!isValidUsername(targetUsername)) return json({ error: 'Invalid targetUsername' }, 400)
  if (username === targetUsername) return json({ error: 'Cannot cancel own invitation' }, 400)

  const existing = await kv.get(`${targetUsername}:share:groupInvitation`)
  if (existing === null) return json({ ok: true }) // already gone — idempotent

  const inv = existing as { fromUsername?: string }
  if (inv.fromUsername !== username) return json({ error: 'Not authorized' }, 403)

  await kv.del(`${targetUsername}:share:groupInvitation`)
  return json({ ok: true })
}

async function handleInvitationDecline(
  body: Record<string, unknown>,
  username: string
): Promise<Response> {
  // Invitee rejects their own pending invitation by deleting it.
  // Idempotent — if key is already gone, still returns ok: true.
  const existing = await kv.get(`${username}:share:groupInvitation`)
  if (existing === null) return json({ ok: true })

  await kv.del(`${username}:share:groupInvitation`)
  return json({ ok: true })
}

async function handleListGuestCitations(
  body: Record<string, unknown>,
  ip: string,
  username: string,
  expectedPrefix: string,
): Promise<Response> {
  const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(body.limit, 100)) : 5
  const prefix = `${expectedPrefix}guestCitations:`

  try {
    // Fetch all guest citation keys
    const allKeys = await kv.keys(`${prefix}*`)
    if (allKeys.length === 0) return json({ citations: [] })

    // Fetch all values via pipeline — a single HTTP request to Upstash.
    // We avoid kv.mget(...allKeys) spread because the SDK's mget signature requires a
    // non-empty tuple [string, ...string[]] and spreading a plain string[] from kv.keys()
    // is unreliable in Upstash SDK v1.x on Edge Runtime when the array is computed at runtime.
    const pipeline = kv.pipeline()
    for (const key of allKeys) {
      pipeline.get<{ id: string; text: string; author: string; submittedAt: number }>(key)
    }
    const values = (await pipeline.exec()) as ({ id: string; text: string; author: string; submittedAt: number } | null)[]

    // Filter out nulls and sort by submittedAt descending (newest first)
    const citations = values
      .filter((v): v is { id: string; text: string; author: string; submittedAt: number } => v !== null)
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, limit)

    return json({ citations })
  } catch (e) {
    // Root cause fix: log server-side errors so KV failures surface in Vercel logs
    // instead of being silently swallowed (causing kvListGuestCitationsLatest to return []).
    console.error('[kv] handleListGuestCitations error:', e)
    return json({ error: 'Internal server error' }, 500)
  }
}

async function handleGroupGetMembers(
  body: Record<string, unknown>,
  username: string
): Promise<Response> {
  const groupId = typeof body.groupId === "string" ? body.groupId : "";
  if (!groupId) return json({ error: "Missing groupId" }, 400);
  const storedGroupId = await kv.get(`${username}:share:groupId`);
  if (storedGroupId !== groupId) {
    return json({ error: "Not in this group" }, 403);
  }
  const membersRaw = await kv.get(`group:${groupId}:members`);
  if (membersRaw === null) return json({ error: "Group not found" }, 404);
  return json({ members: membersRaw as string[] });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // SECURITY: Reject non-JSON content types to prevent parser confusion attacks.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Unsupported Media Type" }, 415);
  }

  // SECURITY: Reject oversized bodies to prevent memory exhaustion on Edge Function.
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > 65_536) return json({ error: "Payload too large" }, 413);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { action } = body;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // guestSubmit: bypass origin check — guests visit from any URL (share links).
  if (action === "guestSubmit") {
    return handleGuestSubmit(body, ip);
  }

  // SECURITY: Origin check — reject requests from origins other than known app domains.
  // Accepts ALLOWED_ORIGIN (custom domain), VERCEL_PROJECT_PRODUCTION_URL (stable alias),
  // and VERCEL_URL (deployment-specific URL). If none are set, no restriction is applied (local dev).
  const allowedOrigins = new Set<string>()
  if (process.env.ALLOWED_ORIGIN) allowedOrigins.add(process.env.ALLOWED_ORIGIN)
  if (process.env.VERCEL_URL) allowedOrigins.add(`https://${process.env.VERCEL_URL}`)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) allowedOrigins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  const origin = req.headers.get("Origin");
  if (allowedOrigins.size > 0 && (!origin || !allowedOrigins.has(origin))) {
    return json({ error: "Forbidden" }, 403);
  }

  // SECURITY: Rate limit by client IP to prevent DoS and Upstash quota exhaustion.
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return json({ error: "Too many requests" }, 429);
  }

  try {
    if (action === "rawGet") return handleRawGet(body);
    if (action === "rawSet") return handleRawSet(body);

    // SECURITY: All other actions require a valid username. The server enforces that every
    // key/prefix starts with the declared username — the client-supplied key is never trusted
    // as authoritative on its own. Note: the username itself is still client-declared (no auth
    // token); this prevents key-injection attacks but not deliberate username impersonation.
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    if (!isValidUsername(username)) {
      return json({ error: "Invalid username" }, 400);
    }
    const expectedPrefix = `${username}:`;

    if (action === "get") return handleGet(body, ip, username, expectedPrefix);
    if (action === "set") return handleSet(body, ip, username, expectedPrefix);
    if (action === "del") return handleDel(body, ip, username, expectedPrefix);
    if (action === "list") return handleList(body, ip, username, expectedPrefix);
    if (action === "mget") return handleMget(body, ip, username, expectedPrefix);
    if (action === "listGuestCitations") return handleListGuestCitations(body, ip, username, expectedPrefix);
    if (action === "crossSet") return handleCrossSet(body, username);
    if (action === "crossRead") return handleCrossRead(body, username);
    if (action === "groupCreate") return handleGroupCreate(username);
    if (action === "groupJoin") return handleGroupJoin(body, username);
    if (action === "groupLeave") return handleGroupLeave(body, username);
    if (action === "groupGetMembers") return handleGroupGetMembers(body, username);
    if (action === "invitationCancel") return handleInvitationCancel(body, username);
    if (action === "invitationDecline") return handleInvitationDecline(body, username);
    if (action === "checkBackupSuspension") return handleCheckBackupSuspension(username);
    if (action === "clearUserData") return handleClearUserData(username);

    return json({ error: "Unknown action" }, 400);
  } catch (_e) {
    // SECURITY: Return a generic message — never leak internal Upstash error details to the client.
    return json({ error: "Internal server error" }, 500);
  }
}
