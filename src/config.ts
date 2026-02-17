import * as core from "@actions/core";
import * as fs from "fs";
import * as yaml from "yaml";
import type {
  AgentSettings,
  HardRule,
  LearnedRule,
  LearnedRulesStore,
  PolicySnapshot,
  ReviewPilotConfig,
  Rule,
  RuleSource,
  Severity,
  SpecialistName,
} from "./types.js";

interface RawRule {
  id: string;
  description: string;
  scope: string;
  pattern: string;
  severity?: string;
}

interface RawHardRule {
  id: string;
  description: string;
  scope: string;
  pattern: string;
  severity?: string;
  category?: string;
  mode?: string;
  target?: string;
  message?: string;
  new_code_only?: boolean;
}

interface RawConfig {
  rules?: RawRule[];
  soft_rules?: RawRule[];
  hard_rules?: RawHardRule[];
  ignore?: string[];
  allowlist?: Array<{ path: string; rule_ids?: string[]; reason?: string }>;
  settings?: {
    max_inline_comments?: number;
    model?: string;
    context_budget?: number;
  };
  enforcement?: {
    mode?: string;
    block_on?: string[];
    new_code_only?: boolean;
    max_comments?: number;
  };
  agents?: {
    specialists?: Partial<Record<SpecialistName, Partial<{ enabled: boolean; max_findings: number }>>>;
  };
}

const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  specialists: {
    "security": { enabled: true, maxFindings: 50 },
    "logging-error": { enabled: true, maxFindings: 50 },
    "architecture-boundary": { enabled: true, maxFindings: 50 },
    "api-contract": { enabled: true, maxFindings: 50 },
    "data-access": { enabled: true, maxFindings: 50 },
    "reliability": { enabled: true, maxFindings: 50 },
  },
};

const DEFAULT_CONFIG: ReviewPilotConfig = {
  rules: [],
  softRules: [],
  hardRules: [],
  ignore: [],
  allowlist: [],
  settings: {
    maxInlineComments: 3,
    model: "claude-sonnet-4-5-20250929",
    contextBudget: 50000,
  },
  enforcement: {
    mode: "warn",
    blockOn: ["critical"],
    newCodeOnly: true,
    maxComments: 3,
  },
  agents: DEFAULT_AGENT_SETTINGS,
};

function isValidSeverity(s: string): s is Severity {
  return s === "critical" || s === "warning" || s === "info";
}

function toSeverity(s: string | undefined, fallback: Severity = "warning"): Severity {
  if (s && isValidSeverity(s)) return s;
  return fallback;
}

function isSpecialistName(s: string): s is SpecialistName {
  return (
    s === "security" ||
    s === "logging-error" ||
    s === "architecture-boundary" ||
    s === "api-contract" ||
    s === "data-access" ||
    s === "reliability"
  );
}

function toRule(raw: RawRule, source: RuleSource): Rule {
  return {
    id: raw.id,
    description: raw.description,
    scope: raw.scope,
    pattern: raw.pattern,
    severity: toSeverity(raw.severity),
    source,
  };
}

function toHardRule(raw: RawHardRule, source: RuleSource): HardRule {
  const category = raw.category && isSpecialistName(raw.category)
    ? raw.category
    : raw.category === "any"
      ? "any"
      : "any";

  const mode = raw.mode === "require_regex" ? "require_regex" : "forbid_regex";
  const target = raw.target === "file_content" ? "file_content" : "added_lines";

  return {
    id: raw.id,
    description: raw.description,
    scope: raw.scope,
    pattern: raw.pattern,
    severity: toSeverity(raw.severity, "critical"),
    source,
    category,
    mode,
    target,
    message: raw.message,
    newCodeOnly: raw.new_code_only ?? true,
  };
}

function normalizeAgentSettings(raw?: RawConfig["agents"]): AgentSettings {
  const merged: AgentSettings = {
    specialists: {
      ...DEFAULT_AGENT_SETTINGS.specialists,
    },
  };

  const rawSpecialists = raw?.specialists;
  if (!rawSpecialists) return merged;

  for (const [k, v] of Object.entries(rawSpecialists)) {
    if (!isSpecialistName(k) || !v) continue;
    merged.specialists[k] = {
      enabled: v.enabled ?? merged.specialists[k].enabled,
      maxFindings: v.max_findings ?? merged.specialists[k].maxFindings,
    };
  }

  return merged;
}

export function loadConfig(configPath: string): ReviewPilotConfig {
  if (!fs.existsSync(configPath)) {
    core.info(`No config file found at ${configPath}, using defaults`);
    return DEFAULT_CONFIG;
  }

  const raw = yaml.parse(fs.readFileSync(configPath, "utf-8")) as RawConfig;

  const legacyRules = (raw.rules ?? []).map((r) => toRule(r, "seed"));
  const softRulesFromNewKey = (raw.soft_rules ?? []).map((r) => toRule(r, "seed"));
  const softRules = softRulesFromNewKey.length > 0 ? softRulesFromNewKey : legacyRules;

  const hardRules = (raw.hard_rules ?? []).map((r) => toHardRule(r, "seed"));

  const maxInlineComments =
    raw.settings?.max_inline_comments ?? DEFAULT_CONFIG.settings.maxInlineComments;

  return {
    rules: softRules,
    softRules,
    hardRules,
    ignore: raw.ignore ?? [],
    allowlist: (raw.allowlist ?? []).map((a) => ({
      path: a.path,
      ruleIds: a.rule_ids,
      reason: a.reason,
    })),
    settings: {
      maxInlineComments,
      model: raw.settings?.model ?? DEFAULT_CONFIG.settings.model,
      contextBudget: raw.settings?.context_budget ?? DEFAULT_CONFIG.settings.contextBudget,
    },
    enforcement: {
      mode: raw.enforcement?.mode === "enforce" ? "enforce" : "warn",
      blockOn: (raw.enforcement?.block_on ?? DEFAULT_CONFIG.enforcement.blockOn)
        .filter((s): s is Severity => typeof s === "string" && isValidSeverity(s)),
      newCodeOnly: raw.enforcement?.new_code_only ?? DEFAULT_CONFIG.enforcement.newCodeOnly,
      maxComments: raw.enforcement?.max_comments ?? maxInlineComments,
    },
    agents: normalizeAgentSettings(raw.agents),
  };
}

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

export function saveLearnedRules(learnedPath: string, rules: LearnedRule[]): void {
  const store: LearnedRulesStore = {
    version: 1,
    rules,
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(learnedPath, JSON.stringify(store, null, 2));
}

export function loadPolicySnapshot(policyPath: string): PolicySnapshot | null {
  if (!fs.existsSync(policyPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath, "utf-8")) as PolicySnapshot;
    if (!Array.isArray(parsed.softRules) || !Array.isArray(parsed.hardRules)) {
      return null;
    }
    return parsed;
  } catch (err) {
    core.warning(`Failed to parse policy snapshot at ${policyPath}: ${err}`);
    return null;
  }
}

export function savePolicySnapshot(policyPath: string, snapshot: PolicySnapshot): void {
  fs.writeFileSync(policyPath, JSON.stringify(snapshot, null, 2));
}
