import Anthropic from "@anthropic-ai/sdk";
import * as core from "@actions/core";
import type {
  AnalysisResult,
  ChangedFile,
  Finding,
  ReviewContext,
  Rule,
} from "./types.js";
import { matchRulesToFiles } from "./rule-engine.js";
import {
  buildRuleMatchPrompt,
  buildConsistencyPrompt,
  buildRankingPrompt,
} from "./prompts.js";

/**
 * Send a prompt to Claude and extract the JSON response.
 * Strips markdown fences if the model wraps output in ```json blocks.
 */
async function callClaude(
  client: Anthropic,
  model: string,
  prompt: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock?.text ?? "[]";

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Extract JSON from a response that may be wrapped in markdown fences.
 */
function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Try to find raw JSON (array or object)
  const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) return jsonMatch[1];
  return text;
}

/**
 * Safely parse findings from Claude's JSON response.
 */
function parseFindings(text: string): Finding[] {
  try {
    const json = extractJSON(text);
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as Finding[];
    return [];
  } catch (err) {
    core.warning(`Failed to parse findings JSON: ${err}`);
    return [];
  }
}

/**
 * Run the multi-pass semantic analysis pipeline.
 *
 * Pass 1: Check user-defined rules against changed files
 * Pass 2: Detect cross-file consistency violations
 * Pass 3: Deduplicate and rank all findings
 */
export async function analyze(
  apiKey: string,
  model: string,
  rules: Rule[],
  changedFiles: ChangedFile[],
  reviewContext: ReviewContext,
  maxFindings: number
): Promise<AnalysisResult> {
  const client = new Anthropic({ apiKey });

  let totalInput = 0;
  let totalOutput = 0;
  const allFindings: Finding[] = [];

  // ── Pass 1: Rule-based analysis ──────────────────────────────
  const fileRules = matchRulesToFiles(rules, changedFiles);
  const applicableRules = [
    ...new Map(
      [...fileRules.values()].flat().map((r) => [r.id, r])
    ).values(),
  ];

  if (applicableRules.length > 0) {
    core.info(`Pass 1: Checking ${applicableRules.length} rules against ${changedFiles.length} files`);

    // Collect only files that have applicable rules
    const relevantFiles = reviewContext.changedFiles.filter((f) =>
      fileRules.has(f.path)
    );

    const prompt = buildRuleMatchPrompt(
      applicableRules,
      relevantFiles,
      reviewContext.importedFiles
    );

    const result = await callClaude(client, model, prompt);
    totalInput += result.inputTokens;
    totalOutput += result.outputTokens;

    const findings = parseFindings(result.text);
    core.info(`Pass 1: Found ${findings.length} potential violations`);
    allFindings.push(...findings);
  } else {
    core.info("Pass 1: No rules match the changed files, skipping");
  }

  // ── Pass 2: Cross-file consistency ───────────────────────────
  if (reviewContext.importedFiles.length > 0) {
    core.info(`Pass 2: Checking cross-file consistency with ${reviewContext.importedFiles.length} imported files`);

    const prompt = buildConsistencyPrompt(
      reviewContext.changedFiles,
      reviewContext.importedFiles
    );

    const result = await callClaude(client, model, prompt);
    totalInput += result.inputTokens;
    totalOutput += result.outputTokens;

    const findings = parseFindings(result.text);
    core.info(`Pass 2: Found ${findings.length} consistency deviations`);
    allFindings.push(...findings);
  } else {
    core.info("Pass 2: No imported files for context, skipping consistency check");
  }

  // ── Pass 3: Rank and deduplicate ─────────────────────────────
  if (allFindings.length === 0) {
    return {
      findings: [],
      summary: "No semantic issues found. The changes look consistent with the codebase patterns.",
      passCount: 3,
      tokenUsage: { inputTokens: totalInput, outputTokens: totalOutput },
    };
  }

  core.info(`Pass 3: Ranking and deduplicating ${allFindings.length} total findings`);

  const rankPrompt = buildRankingPrompt(
    JSON.stringify(allFindings, null, 2),
    maxFindings
  );

  const rankResult = await callClaude(client, model, rankPrompt);
  totalInput += rankResult.inputTokens;
  totalOutput += rankResult.outputTokens;

  try {
    const json = extractJSON(rankResult.text);
    const ranked = JSON.parse(json) as {
      findings: Finding[];
      summary: string;
    };

    return {
      findings: ranked.findings,
      summary: ranked.summary,
      passCount: 3,
      tokenUsage: { inputTokens: totalInput, outputTokens: totalOutput },
    };
  } catch (err) {
    core.warning(`Failed to parse ranking response, returning unranked findings: ${err}`);
    return {
      findings: allFindings.slice(0, maxFindings),
      summary: `Found ${allFindings.length} potential issues (ranking failed, showing first ${maxFindings}).`,
      passCount: 3,
      tokenUsage: { inputTokens: totalInput, outputTokens: totalOutput },
    };
  }
}
