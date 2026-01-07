# Git Permission Reference

## Detection Indicators
- `.git/config` - Git repository configuration

## Permission Template

```json
{
  "allow": [
    "Bash(git status)",
    "Bash(git diff *)",
    "Bash(git log *)",
    "Bash(git branch *)",
    "Bash(git checkout *)",
    "Bash(git add *)",
    "Bash(git commit *)",
    "Bash(git pull *)",
    "Bash(git fetch *)"
  ],
  "ask": [
    "Bash(git push *)",
    "Bash(git reset --hard *)",
    "Bash(git rebase *)"
  ]
}
```

## Common Commands

### Reading Repository State
- `git status` - Show working tree status
- `git diff` - Show changes
- `git log` - Show commit history
- `git branch` - List branches

### Making Changes
- `git add` - Stage changes
- `git commit` - Commit changes
- `git checkout` - Switch branches

### Synchronization
- `git pull` - Fetch and merge
- `git fetch` - Fetch remote changes
- `git push` - Push to remote (requires confirmation)

## Security Notes
- `git push` asks for confirmation to prevent accidental pushes
- `git reset --hard` is destructive (requires confirmation)
- `git rebase` can rewrite history (requires confirmation)
