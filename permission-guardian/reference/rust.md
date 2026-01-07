# Rust Permission Reference

## Detection Indicators
- `Cargo.toml` - Cargo package manifest
- `Cargo.lock` - Cargo lock file

## Permission Template

```json
{
  "allow": [
    "Bash(cargo *)",
    "Bash(rustc *)",
    "Bash(rustup *)"
  ]
}
```

## Common Commands

### Package Management
- `cargo build` - Build project
- `cargo run` - Build and run
- `cargo test` - Run tests
- `cargo check` - Check without building
- `cargo clippy` - Run linter

### Dependencies
- `cargo add <crate>` - Add dependency
- `cargo update` - Update dependencies

## Security Notes
- Review `Cargo.toml` dependency changes
- Use `cargo audit` to check for vulnerabilities
