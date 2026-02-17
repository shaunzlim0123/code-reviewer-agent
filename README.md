# Review Pilot

![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-vitest-6E9F18)
![Version](https://img.shields.io/badge/version-1.0.0-blue)

A multi-agent semantic code review GitHub Action that catches architecture, security, and reliability issues before human review.

## Table of Contents
- [What This Project Does](#what-this-project-does)
- [Why This Project Is Useful](#why-this-project-is-useful)
- [How to Get Started](#how-to-get-started)
- [Where to Get Help](#where-to-get-help)
- [Who Maintains and Contributes](#who-maintains-and-contributes)

## What This Project Does
Review Pilot runs on pull requests and posts a structured review comment with inline findings.

Current workflow in `src/index.ts`:
1. Load runtime policy from `.review-pilot.yml`, learned rules, and optional `reviewer_policy.json` snapshot.
2. Parse changed files from the PR diff.
3. Route each file to specialist analyzers.
4. Run specialists and synthesize findings.
5. Post a GitHub review (`APPROVE`, `COMMENT`, or `REQUEST_CHANGES`).
6. On merged PRs, mine conventions into `.review-pilot-learned.json`.

## Why This Project Is Useful
### Key Features
- Multi-agent analysis with focused specialists:
  - `security`
  - `logging-error`
  - `architecture-boundary`
  - `api-contract`
  - `data-access`
  - `reliability`
- Policy-driven behavior with hard and soft rules.
- Allowlist support for scoped exceptions.
- Configurable `warn` vs `enforce` mode.
- Convention mining from merged PRs.

### Benefits
- Reduces review load by pre-filtering high-signal issues.
- Encodes team conventions into repeatable checks.
- Keeps feedback actionable with file/line findings.

## How to Get Started
### Prerequisites
- Node.js `>=20`
- A repository with GitHub Actions enabled
- `ANTHROPIC_API_KEY` secret configured in your repository

### Install as a GitHub Action
Create `.github/workflows/review-pilot.yml`:

```yaml
name: Review Pilot
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: <owner>/review-pilot@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: warn
          config-path: .review-pilot.yml
```

For local action development in the same repo:

```yaml
- uses: ./
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Configure Rules
Start from `.review-pilot.yml` in this repo. You can use legacy `rules` or new `soft_rules` + `hard_rules`.

Example:

```yaml
soft_rules:
  - id: require-error-logging
    description: Services must log errors with context
    scope: src/services/**
    pattern: catch blocks should log errors with request context
    severity: warning

hard_rules:
  - id: forbid-hardcoded-token
    description: Hardcoded tokens are not allowed
    scope: src/**
    category: security
    mode: forbid_regex
    target: added_lines
    pattern: '(?i)(token|secret|api[_-]?key)\s*[:=]\s*"[^"]+"'
    severity: critical
    new_code_only: true

enforcement:
  mode: warn
  block_on: [critical]

settings:
  max_inline_comments: 3
  model: claude-sonnet-4-5-20250929
  context_budget: 50000
```

### Action Inputs
From `action.yml`:

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `github-token` | No | `${{ github.token }}` | GitHub token for API calls |
| `anthropic-api-key` | Yes | - | Anthropic key for convention mining |
| `model` | No | `claude-sonnet-4-5-20250929` | Model used for mining |
| `config-path` | No | `.review-pilot.yml` | Project config path |
| `policy-path` | No | `reviewer_policy.json` | Optional policy snapshot path |
| `mode` | No | `warn` | `warn` or `enforce` |
| `max-inline-comments` | No | `3` | Max inline comments |
| `learned-rules-path` | No | `.review-pilot-learned.json` | Learned rules store |
| `agent-max-turns` | No | `12` | Reserved compatibility input |

### Action Outputs

| Output | Description |
| --- | --- |
| `findings-count` | Total findings |
| `critical-count` | Critical findings |
| `warning-count` | Warning findings |
| `review-event` | Posted event (`APPROVE`/`COMMENT`/`REQUEST_CHANGES`) |
| `policy-version` | Policy schema version |
| `tokens-used` | Token usage (currently static analyzers return `0`) |

### Local Development
```bash
npm install
npm run typecheck
npm test
npm run build
```

### Project Layout
```text
src/
  index.ts                       # Action entrypoint
  config.ts                      # Config + learned/snapshot loading
  diff-parser.ts                 # PR diff parsing
  context-resolver.ts            # Changed/imported file context building
  reviewer.ts                    # Review formatting + GitHub posting
  types.ts                       # Shared types
  policy/
    load-policy.ts
    merge-policy.ts
  agents/
    convention-miner.ts
    diff-router.ts
    orchestrator.ts
    review-synthesizer.ts
    specialists/
      security.ts
      logging-error.ts
      architecture-boundary.ts
      api-contract.ts
      data-access.ts
      reliability.ts
```

## Where to Get Help
- Read the implementation plan: [`PLAN.md`](PLAN.md)
- Review action contract: [`action.yml`](action.yml)
- Start from example config: [`.review-pilot.yml`](.review-pilot.yml)
- Check behavior with tests in [`tests/`](tests)

If something is unclear or broken, open an issue in this repository with:
- your workflow file
- your `.review-pilot.yml`
- the failing action logs

## Who Maintains and Contributes
### Maintainer
- `shaunlim` (see `author` in [`action.yml`](action.yml))

### Contributing
Contributions are welcome. Keep changes focused and test-backed.

Recommended flow:
1. Create a feature branch.
2. Add/modify tests under [`tests/`](tests).
3. Run:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
4. Open a pull request with a clear summary, scope, and validation output.

For major design changes, align with [`PLAN.md`](PLAN.md) in the same PR.
