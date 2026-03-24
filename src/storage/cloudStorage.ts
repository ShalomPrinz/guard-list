/**
 * Browser-side client for the /api/kv edge function.
 * Never imports @upstash/redis — all KV access goes through the edge function.
 *
 * Key scheme (all keys are automatically prefixed with the current username):
 *   {username}:groups:{groupId}                       → Group
 *   {username}:stationConfigs:{stationId}             → StationConfig
 *   {username}:schedules:{groupId}:{scheduleId}       → Schedule
 *   {username}:citations:{citationId}                 → Citation
 *   {username}:statistics:{participantName}           → ParticipantStats
 *   {username}:prefs:global                           → { theme: 'dark' | 'light' }
 *
 * All functions catch all errors silently — they never throw.
 * If no username is set, all helpers bail out silently without calling KV.
 */

import { getUsername } from './userStorage'

export const isKvAvailable: boolean = true;

function scopedKey(key: string): string | null {
  const username = getUsername()
  if (!username) return null
  return `${username}:${key}`
}

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
  const username = getUsername()
  const prefixed = scopedKey(key)
  if (!prefixed || !username) {
    console.warn("[kv] get skipped: no username set")
    return null
  }
  try {
    // SECURITY: Pass username separately so the server can enforce namespace ownership.
    const data = (await callKv({ action: "get", key: prefixed, username })) as { value: T | null };
    return data.value;
  } catch (e) {
    console.error("[kv] get failed:", e);
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const username = getUsername()
  const prefixed = scopedKey(key)
  if (!prefixed || !username) {
    console.warn("[kv] set skipped: no username set")
    return
  }
  try {
    // SECURITY: Pass username separately so the server can enforce namespace ownership.
    await callKv({ action: "set", key: prefixed, value, username });
  } catch (e) {
    console.error("[kv] set failed:", e);
  }
}

export async function kvDel(key: string): Promise<void> {
  const username = getUsername()
  const prefixed = scopedKey(key)
  if (!prefixed || !username) {
    console.warn("[kv] del skipped: no username set")
    return
  }
  try {
    // SECURITY: Pass username separately so the server can enforce namespace ownership.
    await callKv({ action: "del", key: prefixed, username });
  } catch (e) {
    console.error("[kv] del failed:", e);
  }
}

/**
 * Raw KV get — no username prefix. Used only for device registration checks.
 */
export async function kvGetRaw<T>(key: string): Promise<T | null> {
  try {
    // SECURITY: Use rawGet action which applies a strict key pattern check on the server.
    const data = (await callKv({ action: "rawGet", key })) as { value: T | null }
    return data.value
  } catch (e) {
    console.error("[kv] raw get failed:", e)
    return null
  }
}

/**
 * Raw KV set — no username prefix. Used only for device registration.
 */
export async function kvSetRaw(key: string, value: unknown): Promise<void> {
  try {
    // SECURITY: Use rawSet action which applies a strict key pattern check on the server.
    await callKv({ action: "rawSet", key, value })
  } catch (e) {
    console.error("[kv] raw set failed:", e)
  }
}

export async function kvList(prefix: string): Promise<string[]> {
  const username = getUsername()
  const prefixed = scopedKey(prefix)
  if (!prefixed || !username) {
    console.warn("[kv] list skipped: no username set")
    return []
  }
  try {
    // SECURITY: Pass username separately so the server can enforce namespace ownership.
    const data = (await callKv({ action: "list", prefix: prefixed, username })) as {
      keys: string[];
    };
    // Strip the username prefix from returned keys so callers see the original key format
    const userPrefix = `${username}:`
    return data.keys.map(k => k.startsWith(userPrefix) ? k.slice(userPrefix.length) : k);
  } catch (e) {
    console.error("[kv] list failed:", e);
    return [];
  }
}
