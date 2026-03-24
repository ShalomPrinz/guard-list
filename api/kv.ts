import { Redis } from "@upstash/redis";

export const config = { runtime: "edge" };

const kv = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// SECURITY: In-memory rate limiter keyed by client IP.
// WARNING: Vercel Edge Functions are stateless across invocations — this Map resets on every
// cold start and is NOT shared across concurrent instances. It provides a baseline against
// naive single-source abuse but gives no protection against distributed attacks.
// Production-grade alternative: Upstash Redis INCR + EXPIRE per IP key (atomic, shared).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 60; // requests per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  // SECURITY: Evict expired entries to prevent unbounded growth in warm instances.
  if (rateLimitMap.size > 10_000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

// SECURITY: Username must not contain ':' (namespace separator) or Redis glob chars.
// Allows any Unicode letter/number/space so existing Hebrew usernames remain valid.
function isValidUsername(username: string): boolean {
  if (!username || username.length < 2 || username.length > 64) return false;
  // Disallow characters that could escape the KV namespace or inject glob patterns.
  return !/[:*?[\]^]/.test(username);
}

// SECURITY: Raw-action keys (device registration only) must start with the literal prefix
// "device:" followed by safe non-colon characters. This structurally prevents any rawGet/rawSet
// key from overlapping with user-namespaced keys ({username}:{namespace}:{id}).
const RAW_KEY_RE = /^device:[a-zA-Z0-9_\-.]{1,128}$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // SECURITY: Origin check — reject requests from origins other than the app domain.
  // Set ALLOWED_ORIGIN env var to the production URL (e.g. https://yourapp.vercel.app).
  // Falls back to VERCEL_URL which Vercel injects automatically.
  const allowedOrigin =
    process.env.ALLOWED_ORIGIN ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  const origin = req.headers.get("Origin");
  if (allowedOrigin && origin !== allowedOrigin) {
    return json({ error: "Forbidden" }, 403);
  }

  // SECURITY: Rate limit by client IP to prevent DoS and Upstash quota exhaustion.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return json({ error: "Too many requests" }, 429);
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

  try {
    // SECURITY: rawGet/rawSet are a restricted escape hatch for device-registration keys only.
    // Keys must match a safe ASCII pattern and cannot use username namespacing.
    if (action === "rawGet") {
      const key = body.key as string;
      if (!key || !RAW_KEY_RE.test(key)) return json({ error: "Invalid key" }, 400);
      const value = await kv.get(key);
      return json({ value: value ?? null });
    }
    if (action === "rawSet") {
      const key = body.key as string;
      if (!key || !RAW_KEY_RE.test(key)) return json({ error: "Invalid key" }, 400);
      await kv.set(key, body.value);
      return json({ ok: true });
    }

    // SECURITY: All other actions require a valid username. The server enforces that every
    // key/prefix starts with the declared username — the client-supplied key is never trusted
    // as authoritative on its own. Note: the username itself is still client-declared (no auth
    // token); this prevents key-injection attacks but not deliberate username impersonation.
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    if (!isValidUsername(username)) {
      return json({ error: "Invalid username" }, 400);
    }
    const expectedPrefix = `${username}:`;

    if (action === "get") {
      const key = body.key as string;
      // SECURITY: Reject any key that escapes the caller's declared username namespace.
      if (!key || !key.startsWith(expectedPrefix)) {
        console.warn("[kv] namespace violation", { ip, username, key });
        return json({ error: "Key namespace violation" }, 403);
      }
      const value = await kv.get(key);
      return json({ value: value ?? null });
    }
    if (action === "set") {
      const key = body.key as string;
      // SECURITY: Reject any key that escapes the caller's declared username namespace.
      if (!key || !key.startsWith(expectedPrefix)) {
        console.warn("[kv] namespace violation", { ip, username, key });
        return json({ error: "Key namespace violation" }, 403);
      }
      await kv.set(key, body.value);
      return json({ ok: true });
    }
    if (action === "del") {
      const key = body.key as string;
      // SECURITY: Reject any key that escapes the caller's declared username namespace.
      if (!key || !key.startsWith(expectedPrefix)) {
        console.warn("[kv] namespace violation", { ip, username, key });
        return json({ error: "Key namespace violation" }, 403);
      }
      await kv.del(key);
      return json({ ok: true });
    }
    if (action === "list") {
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
      const keys = await kv.keys(prefix + "*");
      return json({ keys });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (_e) {
    // SECURITY: Return a generic message — never leak internal Upstash error details to the client.
    return json({ error: "Internal server error" }, 500);
  }
}
