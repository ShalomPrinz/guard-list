Read the current contents of `docs/CONVENTIONS.md`, `docs/ERRORS.md`, and `docs/LOGIC.md`.

You will be given context about what was just implemented — either from the current conversation or from a prompt file passed as argument. Use that as the scope. Do not review the entire conversation history.

File responsibilities:
- `docs/CONVENTIONS.md` — how to write the code: patterns, rules, style decisions, TypeScript conventions, testing rules.
- `docs/ERRORS.md` — mistakes that happened: bugs, wrong approaches, things to never repeat. Each entry is a numbered error with root cause and rule.
- `docs/LOGIC.md` — what the app does: algorithms, screen behavior, feature rules, data flow, KV/storage contracts.

For each file, decide:

1. **New entries:** Does this session introduce a new convention, pattern, rule, mistake, failure mode, algorithm, or screen behavior not already covered? Add it to the right file in the right section with a specific title, the concrete rule, and file/component references where relevant.

2. **Updates to existing entries:** Does anything in this session contradict, refine, or supersede an existing entry? If a rule changed, a pattern was replaced, or an old mistake is no longer possible because the code changed — update or remove that entry. Do not keep stale rules that no longer reflect the codebase.

3. **Removals:** If an entry refers to a feature, component, or pattern that no longer exists in the codebase, remove it. Dead entries erode trust in the whole document.

After deciding, edit the files in-place using your file editing tools. Do not print the file contents or a diff — just make the changes directly.

If nothing changed in any file, say "No updates needed" and stop.

Be specific in every entry — reference actual file paths, component names, and function names. Do not add anything vague or generic. These files go into Claude Code context on almost every prompt and must stay lean and accurate.