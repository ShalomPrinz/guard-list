1. **Implement**
Read the prompt file passed as argument. Implement everything described in it.

2. **Report**
When implementation is complete, write a file named `verify-$ARGUMENTS.md` (in the same directory as the prompt file) with the following content:
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
