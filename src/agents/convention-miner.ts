import Anthropic from "@anthropic-ai/sdk";
import * as core from "@actions/core";
import type { Context } from "@actions/github/lib/context.js";
import type { GitHub } from "@actions/github/lib/utils.js";
import { loadLearnedRules, saveLearnedRules } from "../config.js";
import type { LearnedRule } from "../types.js";

type Octokit = InstanceType<typeof GitHub>;

const EXTRACTION_PROMPT = `You are a coding convention extractor. Given a merged pull request diff and review comments, extract implicit semantic coding conventions.

Focus on high-signal conventions only:
- security/compliance checks
- error logging patterns
- architecture boundaries
- API validation and response contracts
- data-access separation

## PR Diff
{diff}

## Review Comments
{comments}

Return JSON array only. Schema:
[
  {
    "id": "kebab-case-id",
    "description": "convention description",
    "scope": "glob/pattern/**",
    "pattern": "natural language review rule",
    "severity": "critical|warning|info",
    "confidence": 0.0
  }
]

If no clear conventions, return []`;

export async function mineConventionsFromMergedPR(
  octokit: Octokit,
  context: Context,
  apiKey: string,
  model: string,
  learnedRulesPath: string
): Promise<void> {
  const pr = context.payload.pull_request;
  if (!pr || !pr.merged) {
    core.info("PR is not merged; skipping convention mining");
    return;
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pullNumber = pr.number;

  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const diff = files
    .filter((f) => f.patch)
    .map((f) => `### ${f.filename}\n\
\
${f.patch ?? ""}`)
    .join("\n\n");

  const { data: comments } = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const commentText = comments.length > 0
    ? comments.map((c) => `- ${c.path}:${c.line ?? "?"} ${c.body}`).join("\n")
    : "No review comments.";

  const prompt = EXTRACTION_PROMPT
    .replace("{diff}", diff)
    .replace("{comments}", commentText);

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) return;

  let extracted: Array<{
    id: string;
    description: string;
    scope: string;
    pattern: string;
    severity: "critical" | "warning" | "info";
    confidence: number;
  }> = [];

  try {
    const fenced = textBlock.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    extracted = JSON.parse((fenced?.[1] ?? textBlock.text).trim());
  } catch (err) {
    core.warning(`Convention mining parse failure: ${err}`);
    return;
  }

  if (extracted.length === 0) return;

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
      source: "learned",
      learnedFrom: {
        prNumber: pullNumber,
        mergedAt: pr.merged_at ?? new Date().toISOString(),
      },
      confidence: e.confidence,
    }));

  if (newRules.length === 0) return;

  saveLearnedRules(learnedRulesPath, [...existing, ...newRules]);
  core.info(`Convention miner added ${newRules.length} learned rule(s)`);
}
