1. **Implement**
Read the prompt file passed as argument. If it contains a "Depends on" section, verify those dependencies are already implemented — if not, inform the user and ask whether to implement them now or stop and handle them manually. Then implement everything described in the prompt file (passed as argument).

2. **Report**
When implementation is complete, write a file named `verify-$ARGUMENTS.md` (in the same directory as the prompt file) with the following content:
- The **User Raw Description** section copied verbatim from the prompt file (the exact user requirements as written)
- Files created or modified
- What was built, in 2–3 sentences
- Any deliberate decisions or deviations from the prompt

Then, Tell the user (in your response, not in the file) about any instructions or requirements you decided to defer or ignore.

3. **Update Documents**
Update project memory by following the instructions in `@.claude/commands/update-docs.md`. The scope is limited to what you just implemented — do not review the entire conversation history.

4. **Commit Message Suggestion**
Finally, suggest a git commit message matching the style in `CLAUDE.md`.
Print it as a copyable code block — do not run git yourself. The format to print is:
```
git commit -m "<commit_message>"
```
