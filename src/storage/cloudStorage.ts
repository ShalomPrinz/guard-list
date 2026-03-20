/**
 * Browser-side client for the /api/kv edge function.
 * Never imports @upstash/redis — all KV access goes through the edge function.
 *
 * Key scheme:
 *   groups:{groupId}                       → Group
 *   stationConfigs:{stationId}             → StationConfig
 *   schedules:{groupId}:{scheduleId}       → Schedule
 *   citations:{citationId}                 → Citation
 *   statistics:{participantName}           → ParticipantStats
 *   prefs:global                           → { theme: 'dark' | 'light' }
 *
 * All functions catch all errors silently — they never throw.
 */

export const isKvAvailable: boolean = true;

async function callKv(body: unknown): Promise<unknown> {
  const res = await fetch("/api/kv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`KV HTTP ${res.status}`);
  return res.json();
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const data = (await callKv({ action: "get", key })) as { value: T | null };
    return data.value;
  } catch (e) {
    console.error("[kv] get failed:", e);
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await callKv({ action: "set", key, value });
  } catch (e) {
    console.error("[kv] set failed:", e);
  }
}

export async function kvDel(key: string): Promise<void> {
  try {
    await callKv({ action: "del", key });
  } catch (e) {
    console.error("[kv] del failed:", e);
  }
}

export async function kvList(prefix: string): Promise<string[]> {
  try {
    const data = (await callKv({ action: "list", prefix })) as {
      keys: string[];
    };
    return data.keys;
  } catch (e) {
    console.error("[kv] list failed:", e);
    return [];
  }
}
