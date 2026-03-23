Read the prompt file passed as argument. Implement everything described in it.

When implementation is complete, derive a verification checklist from what you just built:
- The happy path through any UI flow you touched
- Any edge case directly related to the Deliverables
- Any regression risk from `docs/ERRORS.md` relevant to the files you modified

Work through each item. Report ✅ or ❌ with one line per item. Fix any ❌ before reporting done.

When all items pass, suggest a git commit message matching the style in `CLAUDE.md`.
Print it as a copyable code block — do not run git yourself. The format to print is:
```
git commit -m "<commit_message>"
```