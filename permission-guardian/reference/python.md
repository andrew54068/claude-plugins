# Python Permission Reference

## Detection Indicators
- `requirements.txt` - pip requirements
- `setup.py` - setuptools configuration
- `pyproject.toml` - Modern Python project config
- `Pipfile` - Pipenv configuration
- `poetry.lock` - Poetry lock file
- `uv.lock` - uv lock file

## Permission Template

```json
{
  "allow": [
    "Bash(python *)",
    "Bash(python3 *)",
    "Bash(pip *)",
    "Bash(pip3 *)",
    "Bash(pytest *)",
    "Bash(poetry *)",
    "Bash(pipenv *)",
    "Bash(uv *)"
  ]
}
```

## Common Commands

### Package Management
- `pip install -r requirements.txt` - Install dependencies
- `pip install <package>` - Install package
- `pip list` - List installed packages
- `poetry install` - Install with Poetry
- `pipenv install` - Install with Pipenv
- `uv sync` - Sync Python dependencies
- `uv pip install <package>` - Install package with uv

### Running Python
- `python script.py` - Run Python script
- `python -m module` - Run module
- `pytest` - Run tests

## Security Notes
- Pin versions in `requirements.txt`
- Use virtual environments
- Review dependency changes carefully
