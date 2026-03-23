Review everything that happened in this conversation. Then do the following:

Read the current contents of `docs/CONVENTIONS.md` and `docs/ERRORS.md`.

For each file, decide:

1. **New entries:** Does this session introduce a new convention, pattern, rule, mistake, or failure mode not already covered? Add it in the right section with a specific title, the concrete rule, and file/component references where relevant.

2. **Updates to existing entries:** Does anything in this session contradict, refine, or supersede an existing entry? If a rule changed, a pattern was replaced, or an old mistake is no longer possible because the code changed — update or remove that entry. Do not keep stale rules that no longer reflect the codebase.

3. **Removals:** If an entry refers to a feature, component, or pattern that no longer exists in the codebase, remove it. Dead entries erode trust in the whole document.

After deciding, edit `docs/CONVENTIONS.md` and `docs/ERRORS.md` in-place using your file editing tools. Do not print the file contents or a diff — just make the changes directly.

If nothing changed in either file, say "No updates needed" and stop.

Be specific in every entry — reference actual file paths, component names, and function names. Do not add anything vague or generic. These files go into Claude Code context on almost every prompt and must stay lean and accurate.