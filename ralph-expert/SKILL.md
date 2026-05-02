---
name: ralph-expert
description: Build and launch well-structured Ralph Loop commands from a user's task description. Use when the user says "ralph this", "loop this until done", "set up a ralph", "run this iteratively", invokes `/ralph-expert`, or hands over a vague goal that needs to become an iterative loop with clear completion criteria and a max-iteration safety net. Requires the `ralph-loop` plugin to be installed.
---

# Ralph Expert

Build and launch well-structured Ralph Loop commands from user intent.

The user's request: $ARGUMENTS

> **Dependency:** This skill calls `ralph-loop:ralph-loop` to actually launch the loop. Install it first via `/plugin install ralph-loop@claude-plugins-official` (from the `anthropics/claude-plugins-official` marketplace).

## Workflow

When invoked with user input (e.g., `/ralph-expert I want to organize my photos`):

### 1. Extract the Task Prompt

Parse the user's input to identify:
- **Core task**: What they want to accomplish
- **Completion conditions**: Any explicit success criteria mentioned
- **Iteration limit**: Any max-iterations mentioned
- **Scope**: Personal task (default) — work within the user's local environment

If the input is just a raw idea with no structure, that's fine — the job is to turn it into a good ralph-loop prompt.

### 2. Assess Prompt Quality

Check for these qualities of a good ralph-loop prompt:

- **Clear completion criteria** — How does Claude know when it's done?
- **Incremental goals** — Can the task be broken into phases?
- **Self-correction signals** — Are there testable/verifiable checkpoints?
- **Safety net** — Is there a max-iterations limit?

### 3. Ask for Missing Pieces

Use AskUserQuestion to fill in gaps. The most common missing piece is the **completion condition**.

#### Completion Condition

If the user did NOT specify a completion condition, generate 3 task-specific completion conditions and present them as options. Always include an option for the user to specify their own.

Example for "organize my photos":
- Option 1: `ALL PHOTOS ORGANIZED` — "All photos are sorted into folders by date/type and duplicates removed"
- Option 2: `ORGANIZATION COMPLETE` — "Photo library is reorganized with a summary report generated"
- Option 3: `PHOTOS SORTED` — "All photos moved into categorized directories with no unsorted files remaining"
- Other: Let the user type their own

The completion conditions you suggest should be:
- Short uppercase phrases (1-3 words) suitable for `<promise>` tags
- Accompanied by a description of what "done" means for that condition
- Specific to the task at hand

#### Max Iterations

If not specified, suggest a reasonable default based on task complexity:
- Simple tasks (single script, small scope): 10-15
- Medium tasks (multi-file, some testing): 20-30
- Complex tasks (multi-phase, extensive testing): 40-50

Present as options with a recommended default.

#### Prompt Structure

If the user's prompt is too vague, suggest a structured version. A good ralph-loop prompt for personal tasks includes:

```
<task description>

Environment: <where to work — current directory, specific path, etc.>

Steps:
1. <first phase>
2. <second phase>
...

When complete:
- <criterion 1>
- <criterion 2>
- Output: <promise>COMPLETION_PHRASE</promise>
```

### 4. Build the Final Prompt

Compose the full prompt incorporating:
- The user's original intent (expanded into clear instructions)
- Incremental phases if applicable
- Verification steps (run scripts, check file counts, etc.)
- The completion promise instruction: `Output: <promise>PHRASE</promise>`
- A "if stuck" clause suggesting what to do after ~80% of max iterations

### 5. Preview and Confirm

Show the user the full prompt text and settings (max iterations, completion promise). Ask the user to confirm or request changes before launching.

### 6. Launch

Once confirmed, launch the ralph-loop using a prompt file to avoid shell parsing errors with multi-line prompts containing backticks, `$()`, or other shell metacharacters:

1. **Write the prompt to a file**: Use the Write tool to save the full prompt text to `.claude/ralph-prompt.txt` **relative to the current working directory** (NOT `~/.claude/`). For example, if CWD is `/path/to/your/project`, write to `/path/to/your/project/.claude/ralph-prompt.txt`.
2. **Invoke the skill**: Use the Skill tool with `skill: "ralph-loop:ralph-loop"` and pass args using `$(cat ...)` to load the file contents into the shell arguments:
   ```
   args: "\"$(cat .claude/ralph-prompt.txt)\" --max-iterations N --completion-promise 'PHRASE'"
   ```

**Important**: Always use `"$(cat .claude/ralph-prompt.txt)"` instead of passing the prompt inline. The `cat` output is not re-expanded by bash, so backticks and `$()` in the prompt are safe. The double quotes keep the entire file content as a single argument.

## Key Rules

- **Personal scope**: Frame prompts around the user's local machine and files, not abstract project structures. Use paths like `~/`, reference "your computer", "your files", etc.
- **Always include --max-iterations**: Never launch without a safety net. If the user insists on unlimited, warn them but comply.
- **Always include --completion-promise**: Strongly recommend one. If the user declines, warn about infinite loops.
- **Don't over-engineer the prompt**: Keep it actionable. Claude in the loop is smart — give it clear goals, not micromanaged steps.
- **Validate before launch**: Always show the final command and get confirmation.
