Read the verify file passed as argument.

Using that summary, derive a verification checklist:
- The happy path through any UI flow touched
- Edge cases directly related to what was built
- Any regression risk from `docs/ERRORS.md` relevant to the modified files

Do not write checklist items you can trivially confirm from the code alone — prefer items that require tracing behavior, state, or integration across files.

Work through each item. Report ✅ or ❌ with one line per item. Fix any ❌ and re-run the affected checks before reporting done.

If you notice any missing tests, write them and report about writing them.
