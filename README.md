# Code Sentinel

A semantic code review agent that detects pattern violations linters miss. Runs as a GitHub Action, powered by Claude.

Unlike traditional linters that check syntax and style, Code Sentinel understands **intent** — it checks whether your code follows the semantic conventions your team actually cares about, like "all service functions must log errors with structured context" or "API handlers must validate request bodies with a typed schema."

## How It Works

Code Sentinel runs a **3-pass analysis pipeline** on every pull request:

1. **Rule Matching** — Checks changed files against your natural-language rules (defined in `.code-sentinel.yml`), scoped by glob patterns so rules only apply where they're relevant.
2. **Cross-File Consistency** — Resolves imports from changed files and compares them against existing codebase patterns to catch deviations (e.g., a new handler missing error logging that all sibling handlers include).
3. **Ranking & Deduplication** — Merges related findings, deduplicates, and ranks by severity to surface only the most important issues.

The result is posted as a PR review with inline comments on the most critical findings.

### Self-Learning

When a PR is merged, Code Sentinel can **mine conventions** from the diff and review comments, automatically extracting new semantic rules. These learned rules are stored in `.code-sentinel-learned.json` and are applied to future reviews — so your review coverage grows organically as your team's patterns evolve.

## Quick Start

### 1. Add the workflow

Create `.github/workflows/code-sentinel.yml`:

```yaml
name: Code Sentinel
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
      - uses: <your-org>/code-sentinel@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 2. Add your rules

Create `.code-sentinel.yml` in your repo root:

```yaml
rules:
  - id: "require-error-logging"
    description: "All service functions must log errors with structured context"
    scope: "src/services/**"
    pattern: "catch blocks must include logger.error() with request context, not bare catch or console.log"
    severity: "critical"

  - id: "require-schema-validation"
    description: "All API endpoints must use typed schemas for request validation"
    scope: "src/api/**"
    pattern: "route handlers must validate request body with a typed schema (Zod, Pydantic, etc), not raw body access"
    severity: "warning"

ignore:
  - "**/*.test.ts"
  - "**/generated/**"
  - "**/*.d.ts"

settings:
  max_inline_comments: 3
  model: "claude-sonnet-4-5-20250929"
  context_budget: 50000
```

### 3. Add your API key

Add `ANTHROPIC_API_KEY` to your repository secrets (Settings → Secrets and variables → Actions).

## Configuration

### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `anthropic-api-key` | Yes | — | Anthropic API key for Claude |
| `github-token` | No | `${{ github.token }}` | GitHub token for API access |
| `model` | No | `claude-sonnet-4-5-20250929` | Claude model to use |
| `config-path` | No | `.code-sentinel.yml` | Path to config file |
| `max-inline-comments` | No | `3` | Max inline comments per review |
| `learned-rules-path` | No | `.code-sentinel-learned.json` | Path to learned rules file |

### Rule Definition

Each rule has:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (kebab-case) |
| `description` | Human-readable description of the convention |
| `scope` | Glob pattern for which files the rule applies to |
| `pattern` | Natural language description of what to check — this is what Claude evaluates |
| `severity` | `critical`, `warning`, or `info` |

Rules are **natural language**, not regex. Write them the way you'd explain the convention to a new team member:

```yaml
# Good — describes intent
pattern: "async functions that access the database must wrap queries in a try/catch and log failures with the request ID"

# Less useful — too vague
pattern: "handle errors properly"
```

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `max_inline_comments` | `3` | Maximum inline review comments posted on the PR |
| `model` | `claude-sonnet-4-5-20250929` | Claude model used for analysis |
| `context_budget` | `50000` | Token budget for file context (controls how many imported files are included) |

## Review Output

Code Sentinel posts a PR review that includes:

- A **summary table** with finding counts by severity
- **Detailed findings** with file/line references, explanations, and fix suggestions
- **Inline comments** on the diff for the top N most critical findings
- The review event is set to `REQUEST_CHANGES` if any critical findings exist, `COMMENT` for warnings/info, or `APPROVE` if clean

### Action Outputs

| Output | Description |
|--------|-------------|
| `findings-count` | Number of findings detected |
| `review-event` | Review type posted (`APPROVE`, `COMMENT`, or `REQUEST_CHANGES`) |
| `tokens-used` | Total tokens consumed (input + output) |

## Supported Languages

Import resolution and context gathering works for:

- TypeScript / JavaScript
- Python
- Go

Rules themselves are language-agnostic — you can write rules for any file type, scoped by glob patterns.

## Development

```bash
npm install
npm run build       # Build with tsup
npm test            # Run tests with vitest
npm run typecheck   # Type check with tsc
```

## Architecture

```
src/
├── index.ts              # Action entry point, orchestrates the pipeline
├── config.ts             # YAML config + learned rules loading/saving
├── diff-parser.ts        # Unified diff → structured hunks + changed lines
├── context-resolver.ts   # Fetches file contents, resolves imports for context
├── rule-engine.ts        # Matches rules to files by glob scope
├── prompts.ts            # LLM prompt templates for each analysis pass
├── analyzer.ts           # 3-pass analysis pipeline (Claude API calls)
├── reviewer.ts           # Formats findings → GitHub PR review + inline comments
├── history-miner.ts      # Extracts conventions from merged PRs (self-learning)
└── types.ts              # Shared type definitions
```

## License

MIT
