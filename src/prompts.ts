import type { FileContent, Rule } from "./types.js";

/**
 * Format file contents into a readable code block for the LLM.
 */
function formatFiles(files: FileContent[]): string {
  return files
    .map((f) => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
    .join("\n\n");
}

/**
 * Pass 1: Rule-based analysis.
 * For each rule, check if the changed code violates it.
 */
export function buildRuleMatchPrompt(
  rules: Rule[],
  changedFiles: FileContent[],
  importedFiles: FileContent[]
): string {
  const rulesText = rules
    .map(
      (r) =>
        `- **${r.id}** [${r.severity}]: ${r.description}\n  Check: ${r.pattern}\n  Applies to files matching: \`${r.scope}\``
    )
    .join("\n");

  return `You are a semantic code reviewer. Your job is to check if the changed code violates specific coding rules that linters cannot detect.

## Rules to Check
${rulesText}

## Changed Files (the PR diff — focus your review here)
${formatFiles(changedFiles)}

${importedFiles.length > 0 ? `## Imported Files (context only — do NOT review these, use them to understand patterns)\n${formatFiles(importedFiles)}` : ""}

## Instructions
1. For each rule, check if any changed file in its scope violates it.
2. Only report violations you are confident about — do NOT speculate or flag uncertain issues.
3. Reference exact line numbers from the changed files.
4. If a file is not in a rule's scope, skip that rule for that file.

Respond with a JSON array of findings. If no violations are found, return an empty array.

\`\`\`json
[
  {
    "ruleId": "the-rule-id",
    "severity": "critical|warning|info",
    "file": "path/to/file.ts",
    "line": 42,
    "title": "Short description of the violation",
    "explanation": "Why this is a problem and what pattern it breaks",
    "suggestion": "How to fix it (optional)"
  }
]
\`\`\`

Return ONLY the JSON array, no other text.`;
}

/**
 * Pass 2: Cross-file consistency analysis.
 * Detect implicit pattern deviations by comparing changed files against their imports.
 */
export function buildConsistencyPrompt(
  changedFiles: FileContent[],
  importedFiles: FileContent[]
): string {
  return `You are a semantic code reviewer focused on cross-file consistency. Your job is to find places where the changed code deviates from established patterns in the codebase — patterns that are NOT about style or formatting.

## Changed Files (the PR diff — focus your review here)
${formatFiles(changedFiles)}

${importedFiles.length > 0 ? `## Related Files (imported by the changed files — these represent the existing codebase patterns)\n${formatFiles(importedFiles)}` : "No imported files available for context."}

## What to Look For
Focus ONLY on semantic deviations, such as:
- Missing error handling that sibling functions always include
- Missing logging/tracing calls that other functions in the same module use
- Missing validation steps that similar functions perform
- Inconsistent function signatures (e.g., missing a context parameter that all others accept)
- Missing cleanup/teardown logic present in similar functions
- Breaking an implicit contract (e.g., all handlers return a specific response shape, but this one doesn't)

## What to IGNORE
- Code style, formatting, naming conventions
- Import ordering
- Comment presence or absence
- Type annotation style

Respond with a JSON array of findings. If no semantic deviations are found, return an empty array.

\`\`\`json
[
  {
    "ruleId": "consistency-check",
    "severity": "warning",
    "file": "path/to/file.ts",
    "line": 42,
    "title": "Short description of the deviation",
    "explanation": "What pattern exists in the codebase and how this code deviates from it",
    "suggestion": "How to align with the existing pattern"
  }
]
\`\`\`

Return ONLY the JSON array, no other text.`;
}

/**
 * Pass 3: Severity ranking and deduplication.
 * Given all findings, produce the final ranked and deduplicated list.
 */
export function buildRankingPrompt(
  findingsJson: string,
  maxFindings: number
): string {
  return `You are a code review prioritizer. Given these raw findings from a semantic code review, deduplicate and rank them.

## Raw Findings
${findingsJson}

## Instructions
1. Remove duplicate findings (same issue on the same line, even if worded differently).
2. Merge related findings about the same root cause into a single finding.
3. Rank by severity: critical > warning > info. Within the same severity, rank by impact.
4. Return the top ${maxFindings} most important findings.
5. Preserve the original line numbers and file paths exactly.
6. Rewrite titles and explanations to be concise and actionable.

Respond with a JSON object:

\`\`\`json
{
  "findings": [
    {
      "ruleId": "the-rule-id",
      "severity": "critical|warning|info",
      "file": "path/to/file.ts",
      "line": 42,
      "title": "Concise violation title",
      "explanation": "Clear explanation of the issue",
      "suggestion": "How to fix (optional)"
    }
  ],
  "summary": "A 2-3 sentence summary of the overall review findings"
}
\`\`\`

Return ONLY the JSON object, no other text.`;
}
