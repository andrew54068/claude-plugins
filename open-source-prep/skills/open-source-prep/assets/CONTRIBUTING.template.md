# Contributing to {{PROJECT_NAME}}

Thanks for your interest in contributing! This document explains how to get set up and how to
propose changes.

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies:
   ```bash
   {{SETUP_COMMANDS}}
   ```
3. Run the tests to confirm a clean baseline:
   ```bash
   {{TEST_COMMAND}}
   ```

## Making a change

1. Create a branch: `git checkout -b feat/short-description`.
2. Make your change, keeping commits focused and messages clear.
3. Add or update tests for your change.
4. Run the test suite and any linters/formatters:
   ```bash
   {{TEST_AND_LINT_COMMANDS}}
   ```
5. Push and open a pull request against `{{DEFAULT_BRANCH}}`.

## Pull request guidelines

- Describe **what** changed and **why**. Link any related issue.
- Keep PRs as small as reasonably possible — easier to review, faster to merge.
- Make sure CI passes.
- Be responsive to review feedback; maintainers are volunteers.

## Reporting bugs & requesting features

Open an issue using the appropriate template. For bugs, include steps to reproduce, what you
expected, and what actually happened. For security issues, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.

## Questions

{{WHERE_TO_ASK — e.g. Discussions tab, a chat link, or an email}}
