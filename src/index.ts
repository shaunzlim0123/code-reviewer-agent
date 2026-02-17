import * as core from "@actions/core";
import * as github from "@actions/github";
import { parsePRFiles } from "./diff-parser.js";
import { buildReviewContext } from "./context-resolver.js";
import { loadConfig, loadLearnedRules } from "./config.js";
import { mergeRules } from "./rule-engine.js";
import { analyze } from "./analyzer.js";
import { buildReviewOutput, postReview } from "./reviewer.js";
import { mineFromMergedPR } from "./history-miner.js";

async function run(): Promise<void> {
  try {
    // ── Read inputs ──────────────────────────────────────────────
    const apiKey = core.getInput("anthropic-api-key", { required: true });
    const model = core.getInput("model") || "claude-sonnet-4-5-20250929";
    const configPath = core.getInput("config-path") || ".code-sentinel.yml";
    const maxInlineComments = parseInt(core.getInput("max-inline-comments") || "3", 10);
    const learnedRulesPath = core.getInput("learned-rules-path") || ".code-sentinel-learned.json";

    const token = core.getInput("github-token") || process.env.GITHUB_TOKEN;
    if (!token) {
      core.setFailed("GitHub token is required. Set GITHUB_TOKEN or pass github-token input.");
      return;
    }

    const octokit = github.getOctokit(token);
    const context = github.context;

    // ── Route based on event ─────────────────────────────────────
    const eventName = context.eventName;
    const action = context.payload.action;

    if (eventName === "pull_request" && action === "closed") {
      // PR was closed — mine conventions if it was merged
      if (context.payload.pull_request?.merged) {
        core.info("PR merged — mining conventions...");
        await mineFromMergedPR(octokit, context, apiKey, model, learnedRulesPath);
      } else {
        core.info("PR closed without merge, nothing to do");
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

    // ── Review Pipeline ──────────────────────────────────────────
    const pr = context.payload.pull_request;
    if (!pr) {
      core.setFailed("No pull request found in event payload");
      return;
    }

    const pullNumber = pr.number;
    const headSha = pr.head.sha;
    core.info(`Reviewing PR #${pullNumber} (${headSha})`);

    // Step 1: Load config and rules
    const config = loadConfig(configPath);
    const learnedRules = loadLearnedRules(learnedRulesPath);
    const rules = mergeRules(config.rules, learnedRules);
    core.info(`Loaded ${config.rules.length} seed rules + ${learnedRules.length} learned rules`);

    // Step 2: Fetch and parse PR files
    const { data: prFiles } = await octokit.rest.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: pullNumber,
    });

    const changedFiles = parsePRFiles(prFiles, config.ignore);
    if (changedFiles.length === 0) {
      core.info("No reviewable files changed, skipping");
      return;
    }
    core.info(`Parsed ${changedFiles.length} changed files`);

    // Step 3: Build context (fetch file contents + imports)
    const reviewContext = await buildReviewContext(
      octokit,
      context,
      changedFiles,
      headSha,
      config.settings.contextBudget
    );
    core.info(
      `Context: ${reviewContext.changedFiles.length} changed + ${reviewContext.importedFiles.length} imported files (~${reviewContext.totalTokenEstimate} tokens)`
    );

    // Step 4: Run semantic analysis
    const result = await analyze(
      apiKey,
      config.settings.model || model,
      rules,
      changedFiles,
      reviewContext,
      maxInlineComments + 5 // fetch a few extra so ranking has room
    );
    core.info(`Analysis complete: ${result.findings.length} findings`);

    // Step 5: Post review
    const review = buildReviewOutput(result, changedFiles, maxInlineComments);
    await postReview(octokit, reviewContext.repoMetadata, review, changedFiles);

    // Step 6: Set outputs
    core.setOutput("findings-count", result.findings.length.toString());
    core.setOutput("review-event", review.event);
    core.setOutput("tokens-used", (result.tokenUsage.inputTokens + result.tokenUsage.outputTokens).toString());
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unexpected error occurred");
    }
  }
}

run();
