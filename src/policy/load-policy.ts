import { loadConfig, loadLearnedRules, loadPolicySnapshot } from "../config.js";
import { mergePolicy } from "./merge-policy.js";
import type { PolicyBundle, Rule } from "../types.js";

export interface LoadPolicyInput {
  configPath: string;
  learnedRulesPath: string;
  policyPath: string;
  mode?: "warn" | "enforce";
}

export function loadPolicy(input: LoadPolicyInput): PolicyBundle {
  const config = loadConfig(input.configPath);
  const learned = loadLearnedRules(input.learnedRulesPath);
  const learnedAsRules: Rule[] = learned
    .filter((rule) => rule.confidence >= 0.5)
    .map((rule) => ({
      id: rule.id,
      description: rule.description,
      scope: rule.scope,
      pattern: rule.pattern,
      severity: rule.severity,
      source: "learned" as const,
    }));

  const snapshot = loadPolicySnapshot(input.policyPath);
  return mergePolicy(config, learnedAsRules, snapshot, input.mode);
}
