import type { ScheduledParticipant, Schedule } from "../types";
import { parseTimeToMinutes, minutesToTime } from "./scheduling";

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function addDaysToDate(dateStr: string, days: number): string {
  if (days === 0) return dateStr;
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().split("T")[0];
}

// ─── Array shuffle ────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle — returns a new array. */
export function shuffleArray<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Schedule builder ─────────────────────────────────────────────────────────

/**
 * Build the timed list of ScheduledParticipants for a single time-based station.
 * Participants are expected to already be in their final order.
 * startTime is "HH:MM"; absMinutes are accumulated to handle midnight crossover.
 */
export function buildStationSchedule(
  participants: ReadonlyArray<{
    name: string;
    durationMinutes: number;
    locked: boolean;
  }>,
  startTime: string,
  startDate: string,
): ScheduledParticipant[] {
  // absMinutes starts from the given time-of-day and accumulates across midnight
  let absMinutes = parseTimeToMinutes(startTime);

  return participants.map((p) => {
    const dayOffset = Math.floor(absMinutes / 1440);
    const pStartTime = minutesToTime(absMinutes % 1440);
    const endAbs = absMinutes + p.durationMinutes;
    const pEndTime = minutesToTime(endAbs % 1440);
    absMinutes = endAbs;

    return {
      name: p.name,
      startTime: pStartTime,
      endTime: pEndTime,
      date: addDaysToDate(startDate, dayOffset),
      durationMinutes: p.durationMinutes,
      locked: p.locked,
    };
  });
}

// ─── WhatsApp formatter ───────────────────────────────────────────────────────

export function formatScheduleForWhatsApp(schedule: Schedule): string {
  const lines: string[] = [];
  lines.push(`🔒 ${schedule.name}`);

  for (const station of schedule.stations) {
    lines.push("");
    lines.push(`📍 ${station.stationName}`);
    for (const p of station.participants) {
      lines.push(`${p.startTime} ${p.name}`);
    }
  }

  if (schedule.quote) {
    lines.push("");
    lines.push(
      `"${schedule.quote}"${schedule.quoteAuthor ? ` (${schedule.quoteAuthor})` : ""}`,
    );
  }

  return lines.join("\n");
}
