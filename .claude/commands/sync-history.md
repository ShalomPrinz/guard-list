Read every file in docs/migrations/ that matches the pattern NNN\*.md (excluding HISTORY.md).
For each file, extract:

- Migration number from the filename or ## heading
- Migration name from the ## heading after the dash
- One-line summary from the first sentence of the Context paragraph

Append any migrations not already in the table to docs/migrations/HISTORY.md, in this format:
| NNN | Name | Summary |

Sort all rows numerically after appending. Then delete every individual migration file that was just summarized.

Do not touch HISTORY.md's header row. Do not delete files that were already in HISTORY.md before this run. Run tsc --noEmit after to confirm nothing imported those deleted files.
