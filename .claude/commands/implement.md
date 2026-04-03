1. **Implement**
Read the prompt file passed as argument. If it contains a "Depends on" section, verify those dependencies are already implemented — if not, inform the user and ask whether to implement them now or stop and handle them manually. Then implement everything described in the prompt file.

2. **Verify**
Derive a verification checklist from what you just implemented:
- The happy path through any UI flow touched
- Edge cases directly related to what was built
- Any regression risk from `docs/ERRORS.md` relevant to the modified files

Do not write checklist items you can trivially confirm from the code alone — prefer items that require tracing behavior, state, or integration across files.

Work through each item. Report ✅ or ❌ with one line per item. Fix any ❌ and re-run the affected checks before reporting done.

If you notice any missing tests, write them and report about writing them.

3. **User Requirements Audit**
Re-read the **User Raw Description** from the prompt file. For each distinct requirement or expectation the user expressed:
- State the requirement in one line
- Report ✅ if fully satisfied or ❌ if missing, partial, or implemented differently than intended
- For any ❌, explain the gap and fix it before reporting done

This is the final implementation gate — do not declare done until every user requirement is explicitly accounted for.

4. **Update Documents**
Run `/update-docs`. Scope is limited to what was just implemented — do not review the entire conversation history.

Tell the user (in your response, not in any file) about any instructions or requirements you decided to defer or ignore.

5. **Commit Message**
Suggest a git commit message matching the style in `CLAUDE.md`. Base it on the code changes just verified — focus on big architecture changes and main implemented ideas.
Print it as a copyable code block — do not run git yourself:
```
git commit -m "<commit_message>"
```
