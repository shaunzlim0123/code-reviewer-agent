import * as core from "@actions/core";
import * as github from "@actions/github";
import { parsePRFiles } from "./diff-parser.js";
import { buildReviewContext } from "./context-resolver.js";
import { loadPolicy } from "./policy/load-policy.js";
import { routeDiff } from "./agents/diff-router.js";
import { runOrchestrator } from "./agents/orchestrator.js";
import { buildReviewOutput, postReview } from "./reviewer.js";
import { mineConventionsFromMergedPR } from "./agents/convention-miner.js";

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput("anthropic-api-key", { required: true });
    const model = core.getInput("model") || "claude-sonnet-4-5-20250929";
    const configPath = core.getInput("config-path") || ".review-pilot.yml";
    const learnedRulesPath = core.getInput("learned-rules-path") || ".review-pilot-learned.json";
    const policyPath = core.getInput("policy-path") || "reviewer_policy.json";
    const inputMode = core.getInput("mode");
    const mode = inputMode === "enforce" ? "enforce" : inputMode === "warn" ? "warn" : undefined;

    const maxInlineCommentsInput = parseInt(core.getInput("max-inline-comments") || "3", 10);
    const token = core.getInput("github-token") || process.env.GITHUB_TOKEN;

    if (!token) {
      core.setFailed("GitHub token is required. Set GITHUB_TOKEN or pass github-token input.");
      return;
    }

    const octokit = github.getOctokit(token);
    const context = github.context;

    const eventName = context.eventName;
    const action = context.payload.action;

    if (eventName === "pull_request" && action === "closed") {
      if (context.payload.pull_request?.merged) {
        core.info("PR merged — running convention miner");
        await mineConventionsFromMergedPR(octokit, context, apiKey, model, learnedRulesPath);
      } else {
        core.info("PR closed without merge; skipping convention miner");
      }
      return;
    }

    if (
      eventName !== "pull_request" ||
      (action !== "opened" && action !== "synchronize" && action !== "reopened")
    ) {
      core.info(`Unsupported event: ${eventName}.${action}, skipping`);
      return;
    }

    const pr = context.payload.pull_request;
    if (!pr) {
      core.setFailed("No pull request found in event payload");
      return;
    }

    const pullNumber = pr.number;
    const headSha = pr.head.sha;

    core.info(`Reviewing PR #${pullNumber} (${headSha})`);

    const policy = loadPolicy({
      configPath,
      learnedRulesPath,
      policyPath,
      mode,
    });

    const { data: prFiles } = await octokit.rest.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: pullNumber,
    });

    const changedFiles = parsePRFiles(prFiles, policy.ignore);
    if (changedFiles.length === 0) {
      core.info("No reviewable files changed, skipping");
      return;
    }

    const reviewContext = await buildReviewContext(
      octokit,
      context,
      changedFiles,
      headSha,
      policy.settings.contextBudget
    );

    const routing = routeDiff(changedFiles);

    const result = runOrchestrator({
      routing,
      policy,
      changedFileContents: reviewContext.changedFiles,
    });

    const maxInlineComments = Number.isFinite(maxInlineCommentsInput)
      ? maxInlineCommentsInput
      : policy.enforcement.maxComments;

    const review = buildReviewOutput(result, changedFiles, maxInlineComments, {
      mode: policy.enforcement.mode,
      blockOn: policy.enforcement.blockOn,
    });

    await postReview(octokit, reviewContext.repoMetadata, review);

    const criticalCount = result.findings.filter((f) => f.severity === "critical").length;
    const warningCount = result.findings.filter((f) => f.severity === "warning").length;

    core.setOutput("findings-count", String(result.findings.length));
    core.setOutput("critical-count", String(criticalCount));
    core.setOutput("warning-count", String(warningCount));
    core.setOutput("review-event", review.event);
    core.setOutput("policy-version", "1");
    core.setOutput("tokens-used", String(result.tokenUsage.inputTokens + result.tokenUsage.outputTokens));
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
      return;
    }
    core.setFailed("An unexpected error occurred");
  }
}

run();
