import Anthropic from "@anthropic-ai/sdk";
import * as core from "@actions/core";
import type { Context } from "@actions/github/lib/context.js";
import type { GitHub } from "@actions/github/lib/utils.js";
import { loadLearnedRules, saveLearnedRules } from "./config.js";
import type { LearnedRule } from "./types.js";

type Octokit = InstanceType<typeof GitHub>;

const EXTRACTION_PROMPT = `You are a coding convention extractor. Given a merged pull request diff and any review comments, extract implicit coding conventions demonstrated in this PR.

Focus on SEMANTIC patterns (not style):
- Error handling conventions
- Logging/tracing patterns
- Validation requirements
- Authentication/authorization patterns
- Function signature conventions (e.g., always accepting a context parameter)
- Resource cleanup patterns
- Response format conventions

## PR Diff
{diff}

## Review Comments
{comments}

## Instructions
Extract 0-3 coding conventions. Only extract conventions you're highly confident about — it's better to extract nothing than to extract noise.

For each convention, provide:
- A unique id (kebab-case, descriptive)
- A description of the convention
- A glob scope for which files it applies to
- A natural language pattern describing what to check
- A severity (critical/warning/info)
- A confidence score (0.0-1.0) indicating how confident you are this is a real convention

Respond with a JSON array:

\`\`\`json
[
  {
    "id": "convention-name",
    "description": "What the convention is",
    "scope": "src/services/**",
    "pattern": "What to check for in code",
    "severity": "warning",
    "confidence": 0.8
  }
]
\`\`\`


Return ONLY the JSON array. If no clear conventions are found, return an empty array [].`;

/**
 * Mine conventions from a merged PR and append to learned rules.
 */
export async function mineFromMergedPR(
  octokit: Octokit,
  context: Context,
  apiKey: string,
  model: string,
  learnedRulesPath: string,
): Promise<void> {
  const pr = context.payload.pull_request;
  if (!pr || !pr.merged) {
    core.info("PR was not merged, skipping history mining");
    return;
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pullNumber = pr.number;

  core.info(`Mining conventions from merged PR #${pullNumber}`);

  // Fetch PR diff
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const diff = files
    .filter((f) => f.patch)
    .map((f) => `### ${f.filename}\n\`\`\`\n${f.patch}\n\`\`\``)
    .join("\n\n");

  // Fetch review comments
  const { data: comments } = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const commentText =
    comments.length > 0
      ? comments
          .map((c) => `- **${c.path}:${c.line ?? "?"}**: ${c.body}`)
          .join("\n")
      : "No review comments.";

  // Call Claude to extract conventions
  const prompt = EXTRACTION_PROMPT.replace("{diff}", diff).replace(
    "{comments}",
    commentText,
  );

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) {
    core.info("No text response from convention extraction");
    return;
  }

  // Parse extracted rules
  let extracted: Array<{
    id: string;
    description: string;
    scope: string;
    pattern: string;
    severity: "critical" | "warning" | "info";
    confidence: number;
  }>;

  try {
    const fenceMatch = textBlock.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const json = fenceMatch ? fenceMatch[1].trim() : textBlock.text;
    extracted = JSON.parse(json);
  } catch (err) {
    core.warning(`Failed to parse convention extraction response: ${err}`);
    return;
  }

  if (extracted.length === 0) {
    core.info("No conventions extracted from this PR");
    return;
  }

  // Load existing learned rules and merge
  const existing = loadLearnedRules(learnedRulesPath);
  const existingIds = new Set(existing.map((r) => r.id));

  const newRules: LearnedRule[] = extracted
    .filter((e) => !existingIds.has(e.id))
    .map((e) => ({
      id: e.id,
      description: e.description,
      scope: e.scope,
      pattern: e.pattern,
      severity: e.severity,
      source: "learned" as const,
      learnedFrom: {
        prNumber: pullNumber,
        mergedAt: pr.merged_at ?? new Date().toISOString(),
      },
      confidence: e.confidence,
    }));

  if (newRules.length === 0) {
    core.info("All extracted conventions already exist in learned rules");
    return;
  }

  const allRules = [...existing, ...newRules];
  saveLearnedRules(learnedRulesPath, allRules);
  core.info(
    `Added ${newRules.length} new learned rules (total: ${allRules.length})`,
  );
}
