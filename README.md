# Guard Duty Scheduler App

A mobile-first web application for managing **guard duty / shift rotation lists** for military or team groups.

## Purpose

Enable creation and management of guard duty rotations with full control over participant order, shift times, multi-station assignments, and continuity between rounds — with the primary output being a WhatsApp-shareable text message of the schedule.

## Documentation Index

| File | Description |
|------|-------------|
| [features.md](docs/features.md) | All functional features and their requirements |
| [screens.md](docs/screens.md) | Screen flow, UI/UX, and navigation |
| [data-model.md](docs/data-model.md) | Data structures and persistence |
| [business-logic.md](docs/business-logic.md) | Scheduling algorithms and calculation rules |

## Core User Flow

```
Home Screen
  → Select / Create Group
    → [Step 1] Stations Setup (number, type, names)
    → [Step 2] Time Selection (start, end, duration, rounding)
    → [Step 3] Participant Ordering (drag & drop / random)
    → [Step 4] Review & Edit (reassign, rename, add/remove)
    → [Step 5] Publish (share via WhatsApp)
```

## Key Design Principles

- **Primary output is the WhatsApp text share** — the app is a scheduling tool, not a live dashboard
- Single saved group assumed per typical use case (multi-group supported)
- All schedule data persists across sessions via localStorage
- Full mobile support required
- Dark mode support
- No live "who is guarding now" real-time UI needed
