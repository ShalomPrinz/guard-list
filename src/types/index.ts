// ─── Group ───────────────────────────────────────────────────────────────────

export interface Member {
  id: string;
  name: string;
  availability: 'base' | 'home';
  role?: 'commander' | 'warrior'; // optional — storage helper defaults to 'warrior' on read
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
  createdFromShortList?: boolean; // true if generated via short-list wizard
  stations: ScheduleStation[];
  unevenDistributionMode: 'equal-duration' | 'equal-endtime';
  quote?: string;
  quoteAuthor?: string;
  customWhatsAppText?: string;
}

// ─── Citations ────────────────────────────────────────────────────────────────

export interface Citation {
  id: string;
  text: string;
  author: string; // stored as formatted string, e.g. "י. ישראלי"
  usedInListIds: string[]; // schedule ids where this citation was used
  createdByUsername?: string; // undefined = legacy, treated as owned by current user
}

export interface GuestCitationSubmission {
  id: string
  text: string
  author: string
  submittedAt: number // ms timestamp
}

// ─── Citation Sharing ─────────────────────────────────────────────────────────

export interface SharingGroup {
  groupId: string
  members: string[] // all current member usernames including self
  joinedAt: number
}

export interface GroupInvitation {
  groupId: string
  fromUsername: string
  sentAt: number
}

// ─── Error Reporting ──────────────────────────────────────────────────────────

export interface AppErrorReport {
  message: string;
  stack: string;
  componentStack: string;
  url: string;
  timestamp: string; // ISO string
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

// ─── Short-List Wizard Session ────────────────────────────────────────────

export interface ShortListWizardSession {
  groupId: string;
  stations: StationConfig[];
  startHour: number;
  startMinute: number;
  minutesPerWarrior: number;
  numberOfWarriors: number;
  name?: string;
}

// ─── Wizard Session ───────────────────────────────────────────────────────────

export type RoundingAlgorithm = 'round-up-10' | 'round-up-5' | 'round-nearest';
export type UnevenMode = 'equal-duration' | 'equal-endtime';
export type ContinueEndTimeMode = 'planned' | 'actual';
export type TimeInputMode = 'end-time' | 'fixed-duration';

export interface TimeConfig {
  startTime: string;           // "HH:MM"
  endTime?: string;            // "HH:MM" — optional
  fixedDurationMinutes?: number;
  roundingAlgorithm: RoundingAlgorithm;
  unevenMode: UnevenMode;
  timeInputMode?: TimeInputMode;
}

export interface WizardParticipant {
  name: string;
}

export interface WizardStation {
  config: StationConfig;
  participants: WizardParticipant[];  // ordered list; empty until Step 3
  startTime: string;   // "HH:MM" — set by Step1 (default) or ContinueRound (per-station actual end)
  startDate: string;   // "YYYY-MM-DD" — updated by Step2 when user changes the global start time
  roundingAlgorithm?: RoundingAlgorithm; // per-station override; absent means use global default
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
  quote?: string;
  quoteAuthor?: string;
  citationMode?: 'random' | 'collection' | 'manual';
  citationId?: string; // ID of the DB citation selected (random or collection modes)
  autoFormatAuthor?: boolean; // default true — auto-format author name on blur in manual mode
  saveToCollection?: boolean; // default true — save manual citation to collection on create
  stationDurationModes?: Record<string, 'endingHour' | 'constantDuration'>; // per-station mode; defaults to 'endingHour'
  stationConstantDurations?: Record<string, number>; // minutes per warrior for stations in 'constantDuration' mode
}
