import type {
  EnforcementSettings,
  HardRule,
  PolicyBundle,
  PolicySnapshot,
  ReviewPilotConfig,
  Rule,
} from "../types.js";

function mergeRulesById(...ruleSets: Rule[][]): Rule[] {
  const map = new Map<string, Rule>();
  for (const set of ruleSets) {
    for (const rule of set) map.set(rule.id, rule);
  }
  return [...map.values()];
}

function mergeHardRulesById(...ruleSets: HardRule[][]): HardRule[] {
  const map = new Map<string, HardRule>();
  for (const set of ruleSets) {
    for (const rule of set) map.set(rule.id, rule);
  }
  return [...map.values()];
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)];
}

function mergeEnforcement(
  base: EnforcementSettings,
  overrideMode?: "warn" | "enforce"
): EnforcementSettings {
  if (!overrideMode) return base;
  return {
    ...base,
    mode: overrideMode,
  };
}

export function mergePolicy(
  config: ReviewPilotConfig,
  learnedRules: Rule[],
  snapshot: PolicySnapshot | null,
  overrideMode?: "warn" | "enforce"
): PolicyBundle {
  const softRules = mergeRulesById(
    snapshot?.softRules ?? [],
    learnedRules,
    config.softRules
  );

  const hardRules = mergeHardRulesById(
    snapshot?.hardRules ?? [],
    config.hardRules
  );

  return {
    softRules,
    hardRules,
    allowlist: config.allowlist,
    ignore: uniqueStrings(config.ignore),
    settings: config.settings,
    enforcement: mergeEnforcement(config.enforcement, overrideMode),
    agents: config.agents,
  };
}
