# Node.js Permission Reference

## Detection Indicators
- `package.json` - npm package manifest
- `package-lock.json` - npm lock file
- `yarn.lock` - Yarn lock file
- `pnpm-lock.yaml` - pnpm lock file
- `bun.lockb` - Bun lock file

## Permission Template

```json
{
  "allow": [
    "Bash(npm *)",
    "Bash(npx *)",
    "Bash(node *)",
    "Bash(yarn *)",
    "Bash(pnpm *)",
    "Bash(bun *)"
  ]
}
```

## Common Commands

### Package Management
- `npm install` - Install dependencies
- `npm run <script>` - Run package.json scripts
- `npm test` - Run tests
- `npm build` - Build project
- `npx <command>` - Run package binaries

### Yarn
- `yarn install` - Install dependencies
- `yarn add <package>` - Add dependency
- `yarn run <script>` - Run scripts

### pnpm
- `pnpm install` - Install dependencies
- `pnpm add <package>` - Add dependency
- `pnpm run <script>` - Run scripts

### Bun
- `bun install` - Install dependencies
- `bun add <package>` - Add dependency
- `bun run <script>` - Run scripts
- `bun test` - Run tests
- `bun <file.ts/js>` - Run a script

## Security Notes
- Review `package.json` changes before committing
- Use lock files for reproducible builds
- Run `npm audit` regularly for vulnerabilities
- Be aware of Bun's native execution capabilities
