Read the verify file passed as argument.

Using that summary, derive a verification checklist:
- The happy path through any UI flow touched
- Edge cases directly related to what was built
- Any regression risk from `docs/ERRORS.md` relevant to the modified files

Do not write checklist items you can trivially confirm from the code alone — prefer items that require tracing behavior, state, or integration across files.

Work through each item. Report ✅ or ❌ with one line per item. Fix any ❌ and re-run the affected checks before reporting done.

If you notice any missing tests, write them and report about writing them.

---

**User Requirements Audit**

After completing all checklist items, re-read the **User Raw Description** from the verify file. For each distinct requirement or expectation the user expressed:
- State the requirement in one line
- Report ✅ if it is fully satisfied or ❌ if it is missing, partial, or implemented differently than the user intended
- For any ❌, explain the gap and fix it before reporting done

This is the final gate — do not declare done until every user requirement is explicitly accounted for.

---

**Commit Message Suggestion**
Finally, suggest a git commit message matching the style in `CLAUDE.md`. You should generate the message content based on the code changes you just verified: focus on big architecture changes and on the main implemented ideas.
Print it as a copyable code block — do not run git yourself. The format to print is:
```
git commit -m "<commit_message>"
```
