Read every file in docs/migrations/ that matches the pattern NNN*.md (excluding HISTORY.md).

For each file, extract:
- Migration number from the filename (e.g. 016 from 016-vercel-kv-persistence.md)
- Migration name from the ## heading after the dash (e.g. "Vercel KV Persistence")
- One-line summary from the **Goal** line (the single sentence after "**Goal:**")

Append any migrations not already in the table to docs/migrations/HISTORY.md, in this format:
| NNN | Name | Summary |

Sort all rows numerically after appending. Do not touch HISTORY.md's header row.
Do not delete or modify files that were already summarized in HISTORY.md before this run.

Then delete every individual migration file that was just newly appended in this run.

Run tsc --noEmit after to confirm nothing in the codebase imported those deleted files.