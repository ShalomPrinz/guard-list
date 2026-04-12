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
 *   {username}:share:groupId                          → string (groupId — managed server-side by group actions)
 *   {username}:share:groupInvitation                  → GroupInvitation — written via crossSet by inviting user
 *   {username}:share:acceptNotification               → { byUsername: string, groupId: string, at: number } — written via crossSet by accepting user
 *   {username}:share:deleteLog                        → string[] (citation IDs deleted while in a group)
 *   group:{groupId}:members                           → string[] (all member usernames — managed server-side)
 *
 * All functions catch all errors silently — they never throw.
 * If no username is set, all helpers bail out silently without calling KV.
 */

import type { Citation, GuestCitationSubmission } from '../types'
import { getUsername } from './userStorage'

export const isKvAvailable: boolean = true;

const KV_TIMEOUT_MS = 30_000

function scopedKey(key: string): string | null {
  const username = getUsername()
  if (!username) return null
  return `${username}:${key}`
}

async function callKv(body: unknown): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), KV_TIMEOUT_MS)
  try {
    const res = await fetch("/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`KV HTTP ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function callKvRaw(body: unknown): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), KV_TIMEOUT_MS)
  try {
    return await fetch("/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
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
  if (localStorage.getItem('noBackup')) return
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
  if (localStorage.getItem('noBackup')) return []
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

/**
 * Write a cross-user key into another user's namespace.
 * Allowed sub-keys: 'share:groupInvitation', 'share:acceptNotification', 'share:rejectionNotification'.
 * Returns 'already_pending' if the target already has an open groupInvitation.
 * Returns 'target_not_found' if the target user does not exist.
 * Returns 'target_in_group' if the target user is already in a sharing group.
 */
export async function kvCrossSet(
  targetUsername: string,
  key: 'share:groupInvitation' | 'share:acceptNotification' | 'share:rejectionNotification',
  value: unknown,
): Promise<'ok' | 'already_pending' | 'target_not_found' | 'target_in_group' | 'error'> {
  const username = getUsername()
  if (!username) return 'error'
  try {
    const res = await callKvRaw({ action: 'crossSet', username, targetUsername, key, value })
    if (res.status === 404) return 'target_not_found'
    if (res.status === 422) return 'target_in_group'
    if (res.status === 409) return 'already_pending'
    if (!res.ok) {
      const body = await res.text()
      console.error('[kv] crossSet failed: HTTP', res.status, body)
      return 'error'
    }
    return 'ok'
  } catch {
    return 'error'
  }
}

/**
 * Read a group member's full citations collection.
 * Only succeeds if caller and target are in the same sharing group (verified server-side).
 * Returns null on any error (including 403 meaning not in same group).
 */
export async function kvCrossReadGroupMember(
  partnerUsername: string,
): Promise<{ citations: Citation[]; deleteLog: string[] } | null> {
  const username = getUsername()
  if (!username) return null
  try {
    const data = (await callKv({ action: 'crossRead', username, partnerUsername })) as {
      citations: Citation[];
      deleteLog: string[];
    }
    return data
  } catch {
    return null
  }
}

/**
 * Create a new sharing group. Returns { groupId } on success, null on error.
 */
export async function kvGroupCreate(): Promise<{ groupId: string } | null> {
  const username = getUsername()
  if (!username) return null
  try {
    const data = (await callKv({ action: 'groupCreate', username })) as { groupId: string }
    return data
  } catch {
    return null
  }
}

/**
 * Join an existing sharing group. Returns 'ok' or 'error'.
 */
export async function kvGroupJoin(groupId: string): Promise<'ok' | 'error'> {
  const username = getUsername()
  if (!username) return 'error'
  try {
    await callKv({ action: 'groupJoin', username, groupId })
    return 'ok'
  } catch {
    return 'error'
  }
}

/**
 * Leave a sharing group. Returns 'ok' or 'error'.
 */
export async function kvGroupLeave(groupId: string): Promise<'ok' | 'error'> {
  const username = getUsername()
  if (!username) return 'error'
  try {
    await callKv({ action: 'groupLeave', username, groupId })
    return 'ok'
  } catch {
    return 'error'
  }
}

/**
 * Get all members of a sharing group. Returns null on error or if not authorized.
 */
export async function kvGroupGetMembers(groupId: string): Promise<string[] | null> {
  const username = getUsername()
  if (!username) return null
  try {
    const data = (await callKv({ action: 'groupGetMembers', username, groupId })) as { members: string[] }
    return data.members
  } catch {
    return null
  }
}

/**
 * Batch-get multiple keys in a single network request.
 * Keys must be unscoped (no username prefix) — the prefix is added automatically.
 * Returns an array of values in the same order as the input keys.
 * Returns all-null array on error or when no username is set.
 */
export async function kvMGet<T>(keys: string[]): Promise<(T | null)[]> {
  const username = getUsername()
  if (!username || keys.length === 0) return keys.map(() => null)
  const prefixed = keys.map(k => `${username}:${k}`)
  try {
    const data = (await callKv({ action: 'mget', keys: prefixed, username })) as { values: (T | null)[] }
    return data.values
  } catch (e) {
    console.error('[kv] mget failed:', e)
    return keys.map(() => null)
  }
}

/**
 * Fetch the latest guest citation submissions for the current user.
 * Server-side sorting by submittedAt descending (newest first) and limiting.
 * Returns [] on error or when no username is set.
 */
export async function kvListGuestCitationsLatest(limit: number = 5): Promise<GuestCitationSubmission[]> {
  const username = getUsername()
  if (!username) return []
  try {
    const data = (await callKv({ action: 'listGuestCitations', username, limit })) as { citations: GuestCitationSubmission[] }
    return data.citations ?? []
  } catch (e) {
    console.error('[kv] listGuestCitations failed:', e)
    return []
  }
}

/**
 * Cancel an outgoing group invitation by deleting the target's KV key.
 * Only succeeds if the caller is the one who sent the invitation (verified server-side).
 */
export async function kvInvitationCancel(targetUsername: string): Promise<void> {
  const username = getUsername()
  if (!username) return
  try {
    await callKv({ action: 'invitationCancel', username, targetUsername })
  } catch (e) {
    console.error('[kv] invitationCancel failed:', e)
  }
}

/**
 * Reject a pending group invitation by deleting the caller's own KV key.
 * Idempotent — succeeds even if the key is already gone.
 */
export async function kvInvitationDecline(): Promise<void> {
  const username = getUsername()
  if (!username) return
  try {
    await callKv({ action: 'invitationDecline', username })
  } catch (e) {
    console.error('[kv] invitationDecline failed:', e)
  }
}

/**
 * Delete a pending guest citation submission by id. Fire-and-forget.
 */
export async function kvDeleteGuestCitation(id: string): Promise<void> {
  await kvDel(`guestCitations:${id}`)
}

/**
 * Check whether the user has set the noBackup opt-out flag in KV.
 * Returns true if `{username}:prefs:noBackup` is set to true.
 */
export async function kvGetNoBackup(): Promise<boolean> {
  const val = await kvGet<boolean>('prefs:noBackup')
  return val === true
}

/**
 * Delete all user-namespaced KV keys and write the noBackup opt-out flag.
 * Server-side: deletes all `{username}:*` keys then sets `{username}:prefs:noBackup = true`.
 */
export async function kvClearUserData(): Promise<void> {
  const username = getUsername()
  if (!username) return
  try {
    await callKv({ action: 'clearUserData', username })
  } catch (e) {
    console.error('[kv] clearUserData failed:', e)
  }
}

/**
 * Check whether backup is currently suspended, using a server-side time comparison.
 * The server reads {username}:backupSuspendedUntil and compares it against Date.now()
 * server-side — the client never does any time arithmetic so Date.now() overrides cannot bypass it.
 * Returns the suspendedUntil timestamp if suspension is active, null otherwise.
 */
export async function kvGetBackupSuspension(): Promise<number | null> {
  const username = getUsername()
  if (!username) return null
  try {
    const data = (await callKv({ action: 'checkBackupSuspension', username })) as {
      suspended: boolean
      suspendedUntil?: number
    }
    if (!data.suspended) return null
    return data.suspendedUntil ?? null
  } catch (e) {
    console.error('[kv] checkBackupSuspension failed:', e)
    return null
  }
}

/**
 * Set the backup suspension timestamp in KV.
 * Must be called before noBackup is written to localStorage so kvSet's guard passes.
 */
export async function kvSetBackupSuspension(until: number): Promise<void> {
  await kvSet('backupSuspendedUntil', until)
}

/**
 * Clear the backup suspension timestamp from KV.
 */
export async function kvClearBackupSuspension(): Promise<void> {
  await kvDel('backupSuspendedUntil')
}
