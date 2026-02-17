import { minimatch } from "minimatch";
import type { ChangedFile, LearnedRule, Rule } from "./types.js";

/**
 * Merge seed rules with learned rules. Seed rules take priority when IDs conflict.
 * Learned rules with low confidence (< 0.5) are excluded.
 */
export function mergeRules(seedRules: Rule[], learnedRules: LearnedRule[]): Rule[] {
  const seedIds = new Set(seedRules.map((r) => r.id));

  const filteredLearned = learnedRules
    .filter((lr) => lr.confidence >= 0.5)
    .filter((lr) => !seedIds.has(lr.id))
    .map(
      (lr): Rule => ({
        id: lr.id,
        description: lr.description,
        scope: lr.scope,
        pattern: lr.pattern,
        severity: lr.severity,
        source: "learned",
      })
    );

  return [...seedRules, ...filteredLearned];
}

/**
 * Match rules against changed files.
 * Returns a map of file path → applicable rules based on scope glob matching.
 */
export function matchRulesToFiles(
  rules: Rule[],
  changedFiles: ChangedFile[]
): Map<string, Rule[]> {
  const fileRules = new Map<string, Rule[]>();

  for (const file of changedFiles) {
    const applicable = rules.filter((rule) =>
      minimatch(file.path, rule.scope)
    );

    if (applicable.length > 0) {
      fileRules.set(file.path, applicable);
    }
  }

  return fileRules;
}

/**
 * Get all unique rules that apply to at least one changed file.
 */
export function getActiveRules(
  rules: Rule[],
  changedFiles: ChangedFile[]
): Rule[] {
  const activeIds = new Set<string>();
  const activeRules: Rule[] = [];

  const fileRules = matchRulesToFiles(rules, changedFiles);
  for (const ruleList of fileRules.values()) {
    for (const rule of ruleList) {
      if (!activeIds.has(rule.id)) {
        activeIds.add(rule.id);
        activeRules.push(rule);
      }
    }
  }

  return activeRules;
}
