import * as core from "@actions/core";
import * as fs from "fs";
import * as yaml from "yaml";
import type { LearnedRule, LearnedRulesStore, Rule, SentinelConfig } from "./types.js";

interface RawConfig {
  rules?: Array<{
    id: string;
    description: string;
    scope: string;
    pattern: string;
    severity?: string;
  }>;
  ignore?: string[];
  settings?: {
    max_inline_comments?: number;
    model?: string;
    context_budget?: number;
  };
}

const DEFAULT_CONFIG: SentinelConfig = {
  rules: [],
  ignore: [],
  settings: {
    maxInlineComments: 3,
    model: "claude-sonnet-4-5-20250929",
    contextBudget: 50000,
  },
};

function isValidSeverity(s: string): s is Rule["severity"] {
  return ["critical", "warning", "info"].includes(s);
}

/**
 * Load and validate the .code-sentinel.yml config file.
 * Falls back to defaults if the file doesn't exist.
 */
export function loadConfig(configPath: string): SentinelConfig {
  if (!fs.existsSync(configPath)) {
    core.info(`No config file found at ${configPath}, using defaults`);
    return DEFAULT_CONFIG;
  }

  const raw = yaml.parse(fs.readFileSync(configPath, "utf-8")) as RawConfig;

  const rules: Rule[] = (raw.rules ?? []).map((r) => ({
    id: r.id,
    description: r.description,
    scope: r.scope,
    pattern: r.pattern,
    severity: r.severity && isValidSeverity(r.severity) ? r.severity : "warning",
    source: "seed" as const,
  }));

  return {
    rules,
    ignore: raw.ignore ?? [],
    settings: {
      maxInlineComments:
        raw.settings?.max_inline_comments ?? DEFAULT_CONFIG.settings.maxInlineComments,
      model: raw.settings?.model ?? DEFAULT_CONFIG.settings.model,
      contextBudget:
        raw.settings?.context_budget ?? DEFAULT_CONFIG.settings.contextBudget,
    },
  };
}

/**
 * Load learned rules from JSON file, if it exists.
 */
export function loadLearnedRules(learnedPath: string): LearnedRule[] {
  if (!fs.existsSync(learnedPath)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(learnedPath, "utf-8")) as LearnedRulesStore;
    return data.rules ?? [];
  } catch (err) {
    core.warning(`Failed to parse learned rules at ${learnedPath}: ${err}`);
    return [];
  }
}

/**
 * Save learned rules back to the JSON file.
 */
export function saveLearnedRules(
  learnedPath: string,
  rules: LearnedRule[]
): void {
  const store: LearnedRulesStore = {
    version: 1,
    rules,
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(learnedPath, JSON.stringify(store, null, 2));
}
