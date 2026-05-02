---
description: Turn a task description into a well-structured Ralph Loop with completion criteria and max-iteration safety net
argument-hint: <task description, e.g. "organize my photos by date">
allowed-tools: Bash, Read, Write, Edit, Skill, AskUserQuestion
---

# /ralph-expert

The user's task: $ARGUMENTS

Follow the Ralph Expert workflow defined in the bundled `SKILL.md` (in this plugin's root). Apply it to the task above:

1. **Extract** the task — core goal, any explicit completion criteria, any iteration limit
2. **Assess** prompt quality — completion criteria? phases? safety net?
3. **Ask** for missing pieces via `AskUserQuestion` — usually the completion phrase and max iterations
4. **Build** the final prompt with phases, verification steps, and `<promise>PHRASE</promise>`
5. **Preview** the full prompt + settings, then ask the user to confirm
6. **Launch** by writing `.claude/ralph-prompt.txt` (relative to CWD) and invoking the `ralph-loop:ralph-loop` skill with `"$(cat .claude/ralph-prompt.txt)" --max-iterations N --completion-promise 'PHRASE'`

If the user's task above is empty, ask them what they want to ralph.

> **Heads up:** This command depends on the `ralph-loop` plugin (`anthropics/claude-plugins-official` marketplace). If `Skill ralph-loop:ralph-loop` is not available, tell the user to install it first.
