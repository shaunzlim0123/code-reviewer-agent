import * as core from "@actions/core";
import type { GitHub } from "@actions/github/lib/utils.js";
import type {
  AnalysisResult,
  ChangedFile,
  Finding,
  InlineComment,
  RepoMetadata,
  ReviewOutput,
  Severity,
} from "./types.js";

type Octokit = InstanceType<typeof GitHub>;

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: "🔴",
  warning: "🟡",
  info: "🔵",
};

const BOT_SIGNATURE = "<!-- review-pilot-review -->";

/**
 * Map a file line number to a diff position for the GitHub Review API.
 * Returns undefined if the line isn't in the diff.
 */
export function lineToDiffPosition(
  changedFiles: ChangedFile[],
  filePath: string,
  lineNumber: number
): number | undefined {
  const file = changedFiles.find((f) => f.path === filePath);
  if (!file) return undefined;

  // GitHub diff positions are 1-indexed offsets from the start of the diff
  let position = 0;
  for (const hunk of file.hunks) {
    position++; // the @@ header counts as position 1 of the hunk
    let currentLine = hunk.newStart;

    for (const line of hunk.content.split("\n")) {
      position++;
      if (line.startsWith("-")) {
        // Deleted line — doesn't affect new file line numbering
        continue;
      }
      if (currentLine === lineNumber) {
        return position;
      }
      currentLine++;
    }
  }

  return undefined;
}

/**
 * Format a finding into a markdown inline comment body.
 */
function formatInlineComment(finding: Finding): string {
  let body = `${SEVERITY_EMOJI[finding.severity]} **${finding.title}**\n\n${finding.explanation}`;
  if (finding.suggestion) {
    body += `\n\n**Suggestion:** ${finding.suggestion}`;
  }
  body += `\n\n<sub>Rule: \`${finding.ruleId}\`</sub>`;
  return body;
}

/**
 * Build the summary review body with severity-tiered breakdown.
 */
function formatSummaryBody(result: AnalysisResult): string {
  const { findings, summary, tokenUsage } = result;

  const critical = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");

  let body = `${BOT_SIGNATURE}\n## Review Pilot\n\n`;
  body += `${summary}\n\n`;

  if (findings.length === 0) {
    body += `✅ **No semantic issues found.** The changes look consistent with the codebase.\n`;
  } else {
    body += `### Findings\n\n`;
    body += `| Severity | Count |\n|----------|-------|\n`;
    if (critical.length > 0) body += `| ${SEVERITY_EMOJI.critical} Critical | ${critical.length} |\n`;
    if (warnings.length > 0) body += `| ${SEVERITY_EMOJI.warning} Warning | ${warnings.length} |\n`;
    if (infos.length > 0) body += `| ${SEVERITY_EMOJI.info} Info | ${infos.length} |\n`;

    body += `\n### Details\n\n`;
    for (const finding of findings) {
      body += `#### ${SEVERITY_EMOJI[finding.severity]} ${finding.title}\n`;
      body += `📍 \`${finding.file}:${finding.line}\` | Rule: \`${finding.ruleId}\`\n\n`;
      body += `${finding.explanation}\n`;
      if (finding.suggestion) {
        body += `\n> **Suggestion:** ${finding.suggestion}\n`;
      }
      body += `\n---\n\n`;
    }
  }

  body += `<sub>Analyzed with ${result.passCount} passes | Tokens: ${tokenUsage.inputTokens} in / ${tokenUsage.outputTokens} out</sub>`;
  return body;
}

/**
 * Build the complete ReviewOutput with summary and top-N inline comments.
 */
export function buildReviewOutput(
  result: AnalysisResult,
  changedFiles: ChangedFile[],
  maxInlineComments: number
): ReviewOutput {
  const body = formatSummaryBody(result);

  // Select top findings for inline comments (already ranked by severity)
  const inlineFindings = result.findings.slice(0, maxInlineComments);
  const comments: InlineComment[] = [];

  for (const finding of inlineFindings) {
    const position = lineToDiffPosition(changedFiles, finding.file, finding.line);
    if (position !== undefined) {
      comments.push({
        path: finding.file,
        line: position,
        body: formatInlineComment(finding),
      });
    }
  }

  // Determine review event based on severity
  const hasCritical = result.findings.some((f) => f.severity === "critical");
  const event = result.findings.length === 0
    ? "APPROVE" as const
    : hasCritical
      ? "REQUEST_CHANGES" as const
      : "COMMENT" as const;

  return { body, comments, event };
}

/**
 * Check if Review Pilot has already posted a review on this PR.
 * Used for idempotency to avoid duplicate reviews on re-runs.
 */
async function hasExistingReview(
  octokit: Octokit,
  metadata: RepoMetadata
): Promise<number | null> {
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner: metadata.owner,
    repo: metadata.repo,
    pull_number: metadata.pullNumber,
  });

  for (const review of reviews) {
    if (review.body?.includes(BOT_SIGNATURE)) {
      return review.id;
    }
  }
  return null;
}

/**
 * Post or update the review on the PR via GitHub API.
 */
export async function postReview(
  octokit: Octokit,
  metadata: RepoMetadata,
  review: ReviewOutput,
  changedFiles: ChangedFile[]
): Promise<void> {
  // Check for existing review to avoid duplicates
  const existingReviewId = await hasExistingReview(octokit, metadata);

  if (existingReviewId) {
    core.info(`Dismissing existing Review Pilot review #${existingReviewId}`);
    try {
      await octokit.rest.pulls.dismissReview({
        owner: metadata.owner,
        repo: metadata.repo,
        pull_number: metadata.pullNumber,
        review_id: existingReviewId,
        message: "Superseded by updated Review Pilot review",
      });
    } catch {
      core.warning("Could not dismiss previous review (may lack permissions)");
    }
  }

  // Post new review
  core.info(`Posting review with ${review.comments.length} inline comments`);

  await octokit.rest.pulls.createReview({
    owner: metadata.owner,
    repo: metadata.repo,
    pull_number: metadata.pullNumber,
    commit_id: metadata.headSha,
    body: review.body,
    event: review.event,
    comments: review.comments.map((c) => ({
      path: c.path,
      position: c.line,
      body: c.body,
    })),
  });

  core.info(`Review posted successfully (event: ${review.event})`);
}
