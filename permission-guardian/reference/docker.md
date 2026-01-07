# Docker Permission Reference

## Detection Indicators
- `Dockerfile` - Docker image definition
- `docker-compose.yml` - Docker Compose configuration
- `docker-compose.yaml` - Docker Compose configuration (alternate)
- `.dockerignore` - Docker ignore file

## Permission Template

```json
{
  "allow": [
    "Bash(docker *)",
    "Bash(docker-compose *)"
  ],
  "ask": [
    "Bash(docker push *)",
    "Bash(docker system prune *)"
  ]
}
```

## Common Commands

### Container Management
- `docker build` - Build image
- `docker run` - Run container
- `docker ps` - List containers
- `docker logs` - View logs
- `docker exec` - Execute in container

### Docker Compose
- `docker-compose up` - Start services
- `docker-compose down` - Stop services
- `docker-compose logs` - View logs
- `docker-compose build` - Build images

## Security Notes
- Review Dockerfile changes for security issues
- Use specific image tags, not `latest`
- Be cautious with `docker push` (asks for confirmation)
- `docker system prune` can delete data (asks for confirmation)
