# Go Permission Reference

## Detection Indicators
- `go.mod` - Go module file
- `go.sum` - Go checksum file

## Permission Template

```json
{
  "allow": [
    "Bash(go *)"
  ]
}
```

## Common Commands

### Building and Running
- `go build` - Build project
- `go run` - Build and run
- `go test` - Run tests
- `go fmt` - Format code
- `go vet` - Examine code

### Dependencies
- `go get <package>` - Download package
- `go mod tidy` - Clean up dependencies
- `go mod download` - Download dependencies

## Security Notes
- Review `go.mod` changes
- Use `go mod verify` to check dependencies
