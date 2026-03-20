import { Redis } from "@upstash/redis";

export const config = { runtime: "edge" };

const kv = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { action } = body;

  try {
    if (action === "get") {
      const value = await kv.get(body.key as string);
      return json({ value: value ?? null });
    }
    if (action === "set") {
      await kv.set(body.key as string, body.value);
      return json({ ok: true });
    }
    if (action === "del") {
      await kv.del(body.key as string);
      return json({ ok: true });
    }
    if (action === "list") {
      const keys = await kv.keys((body.prefix as string) + "*");
      return json({ keys });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return json({ error: message }, 500);
  }
}
