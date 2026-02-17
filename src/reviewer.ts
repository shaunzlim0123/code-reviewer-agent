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

export function lineToDiffPosition(
  changedFiles: ChangedFile[],
  filePath: string,
  lineNumber: number
): number | undefined {
  const file = changedFiles.find((f) => f.path === filePath);
  if (!file) return undefined;

  let position = 0;
  for (const hunk of file.hunks) {
    position++;
    let currentLine = hunk.newStart;

    for (const line of hunk.content.split("\n")) {
      position++;
      if (line.startsWith("-")) {
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

function formatInlineComment(finding: Finding): string {
  let body = `${SEVERITY_EMOJI[finding.severity]} **${finding.title}**\n\n${finding.explanation}`;
  if (finding.suggestion) {
    body += `\n\n**Suggestion:** ${finding.suggestion}`;
  }
  body += `\n\n<sub>Rule: \`${finding.ruleId}\`${finding.agent ? ` | Agent: \`${finding.agent}\`` : ""}</sub>`;
  return body;
}

function formatSummaryBody(result: AnalysisResult): string {
  const { findings, summary, tokenUsage } = result;

  const critical = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");

  let body = `${BOT_SIGNATURE}\n## Review Pilot\n\n`;
  body += `${summary}\n\n`;

  if (findings.length === 0) {
    body += "✅ **No semantic issues found.** The changes look consistent with the policy.\n";
  } else {
    body += "### Findings\n\n";
    body += "| Severity | Count |\n|----------|-------|\n";
    if (critical.length > 0) body += `| ${SEVERITY_EMOJI.critical} Critical | ${critical.length} |\n`;
    if (warnings.length > 0) body += `| ${SEVERITY_EMOJI.warning} Warning | ${warnings.length} |\n`;
    if (infos.length > 0) body += `| ${SEVERITY_EMOJI.info} Info | ${infos.length} |\n`;

    body += "\n### Details\n\n";
    for (const finding of findings) {
      body += `#### ${SEVERITY_EMOJI[finding.severity]} ${finding.title}\n`;
      body += `📍 \`${finding.file}:${finding.line}\` | Rule: \`${finding.ruleId}\``;
      if (finding.category) body += ` | Category: \`${finding.category}\``;
      if (finding.agent) body += ` | Agent: \`${finding.agent}\``;
      body += "\n\n";
      body += `${finding.explanation}\n`;
      if (finding.suggestion) {
        body += `\n> **Suggestion:** ${finding.suggestion}\n`;
      }
      body += "\n---\n\n";
    }
  }

  body += `<sub>Passes: ${result.passCount} | Tokens: ${tokenUsage.inputTokens} in / ${tokenUsage.outputTokens} out</sub>`;
  return body;
}

function chooseReviewEvent(
  findings: Finding[],
  opts?: { mode?: "warn" | "enforce"; blockOn?: Severity[] }
): ReviewOutput["event"] {
  if (findings.length === 0) return "APPROVE";

  const mode = opts?.mode ?? "enforce";
  const blockOn = opts?.blockOn ?? ["critical"];

  if (mode === "warn") return "COMMENT";

  const shouldBlock = findings.some((f) => blockOn.includes(f.severity));
  return shouldBlock ? "REQUEST_CHANGES" : "COMMENT";
}

export function buildReviewOutput(
  result: AnalysisResult,
  changedFiles: ChangedFile[],
  maxInlineComments: number,
  opts?: { mode?: "warn" | "enforce"; blockOn?: Severity[] }
): ReviewOutput {
  const body = formatSummaryBody(result);

  const inlineFindings = result.findings.slice(0, maxInlineComments);
  const comments: InlineComment[] = [];

  for (const finding of inlineFindings) {
    const position = lineToDiffPosition(changedFiles, finding.file, finding.line);
    if (position === undefined) continue;

    comments.push({
      path: finding.file,
      line: position,
      body: formatInlineComment(finding),
    });
  }

  return {
    body,
    comments,
    event: chooseReviewEvent(result.findings, opts),
  };
}

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

export async function postReview(
  octokit: Octokit,
  metadata: RepoMetadata,
  review: ReviewOutput
): Promise<void> {
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

  core.info(`Posting review with ${review.comments.length} inline comments`);

  await octokit.rest.pulls.createReview({
    owner: metadata.owner,
    repo: metadata.repo,
    pull_number: metadata.pullNumber,
    commit_id: metadata.headSha,
    body: review.body,
    event: review.event,
    comments: review.comments.map((comment) => ({
      path: comment.path,
      position: comment.line,
      body: comment.body,
    })),
  });

  core.info(`Review posted successfully (event: ${review.event})`);
}
