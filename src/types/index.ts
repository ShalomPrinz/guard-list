// ─── Group ───────────────────────────────────────────────────────────────────

export interface Member {
  id: string;
  name: string;
  availability: 'base' | 'home';
}

export interface Group {
  id: string;
  name: string;
  members: Member[];
  createdAt: string; // ISO date
}

// ─── Station Config ───────────────────────────────────────────────────────────

export interface StationConfig {
  id: string;
  name: string;
  type: 'time-based';
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface ScheduledParticipant {
  name: string;
  startTime: string;       // "HH:MM"
  endTime: string;         // "HH:MM"
  date: string;            // YYYY-MM-DD
  durationMinutes: number;
  locked: boolean;
  skipped: boolean;
}

export interface ScheduleStation {
  stationConfigId: string;
  stationName: string;
  stationType: 'time-based';
  participants: ScheduledParticipant[];
}

export interface Schedule {
  id: string;
  name: string;
  groupId: string;
  createdAt: string;       // ISO datetime
  date: string;            // YYYY-MM-DD
  parentScheduleId?: string;
  stations: ScheduleStation[];
  unevenDistributionMode: 'equal-duration' | 'equal-endtime';
  quote?: string;
  quoteAuthor?: string;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export interface ShiftRecord {
  scheduleId: string;
  scheduleName: string;
  stationName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface ParticipantStats {
  totalShifts: number;
  totalMinutes: number;
  history: ShiftRecord[];
}

export interface Statistics {
  participants: Record<string, ParticipantStats>;
}

// ─── Wizard Session ───────────────────────────────────────────────────────────

export type RoundingAlgorithm = 'round-up-10' | 'round-up-5' | 'round-nearest';
export type UnevenMode = 'equal-duration' | 'equal-endtime';
export type ContinueEndTimeMode = 'planned' | 'actual';

export interface TimeConfig {
  startTime: string;           // "HH:MM"
  endTime?: string;            // "HH:MM" — optional
  fixedDurationMinutes?: number;
  roundingAlgorithm: RoundingAlgorithm;
  unevenMode: UnevenMode;
}

export interface WizardParticipant {
  name: string;
  locked: boolean;
  skipped: boolean;
}

export interface WizardStation {
  config: StationConfig;
  participants: WizardParticipant[];  // ordered list; empty until Step 3
  /** Continue-round only: overrides the global timeConfig.startTime for this station. */
  startTimeOverride?: string;         // "HH:MM"
  /** Continue-round only: overrides session.date for this station. */
  startDateOverride?: string;         // "YYYY-MM-DD"
}

export interface WizardSession {
  mode: 'new' | 'continue';
  groupId: string;
  groupName: string;
  stations: WizardStation[];
  timeConfig: TimeConfig;
  parentScheduleId?: string;
  continueEndTimeMode?: ContinueEndTimeMode;
  scheduleName: string;
  date: string;                // YYYY-MM-DD
  /** Set after first "Create Schedule" — subsequent saves overwrite this schedule id. */
  createdScheduleId?: string;
}
