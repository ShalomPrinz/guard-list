1. **Implement**
Read the prompt file passed as argument. If it contains a "Depends on" section, verify those dependencies are already implemented — if not, inform the user and ask whether to implement them now or stop and handle them manually. Then implement everything described in the prompt file (passed as argument).

2. **Report**
When implementation is complete, write an `.md` file named `verify-$ARGUMENTS` (in the same directory as the prompt file) with the following content:
- The **User Raw Description** section copied verbatim from the prompt file (the exact user requirements as written)
- Files created or modified
- What was built, in 2–3 sentences
- Any deliberate decisions or deviations from the prompt

Then, Tell the user (in your response, not in the file) about any instructions or requirements you decided to defer or ignore.

3. **Update Documents**
Update project memory by following the instructions in `@.claude/commands/update-docs.md`. The scope is limited to what you just implemented — do not review the entire conversation history.
