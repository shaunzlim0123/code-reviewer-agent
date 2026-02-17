import { describe, it, expect } from "vitest";
import { mergeRules, matchRulesToFiles, getActiveRules } from "../src/rule-engine.js";
import type { ChangedFile, LearnedRule, Rule } from "../src/types.js";

const seedRules: Rule[] = [
  {
    id: "require-auth",
    description: "Endpoints must check auth",
    scope: "src/api/**",
    pattern: "Must include auth check",
    severity: "critical",
    source: "seed",
  },
  {
    id: "require-logging",
    description: "Services must log errors",
    scope: "src/services/**",
    pattern: "Must log errors with context",
    severity: "warning",
    source: "seed",
  },
];

const learnedRules: LearnedRule[] = [
  {
    id: "require-cleanup",
    description: "Must close DB connections",
    scope: "src/services/**",
    pattern: "Database connections should be closed in finally block",
    severity: "warning",
    source: "learned",
    learnedFrom: { prNumber: 42, mergedAt: "2025-01-01T00:00:00Z" },
    confidence: 0.8,
  },
  {
    id: "require-auth", // duplicate ID — should be dropped
    description: "Different auth rule",
    scope: "src/**",
    pattern: "Different pattern",
    severity: "info",
    source: "learned",
    learnedFrom: { prNumber: 43, mergedAt: "2025-01-02T00:00:00Z" },
    confidence: 0.9,
  },
  {
    id: "low-confidence-rule",
    description: "Some pattern",
    scope: "src/**",
    pattern: "Maybe check this",
    severity: "info",
    source: "learned",
    learnedFrom: { prNumber: 44, mergedAt: "2025-01-03T00:00:00Z" },
    confidence: 0.3, // below threshold, should be dropped
  },
];

describe("mergeRules", () => {
  it("merges seed and learned rules", () => {
    const merged = mergeRules(seedRules, learnedRules);
    expect(merged).toHaveLength(3); // 2 seed + 1 learned (deduplicated, filtered)
  });

  it("keeps seed rules when IDs conflict", () => {
    const merged = mergeRules(seedRules, learnedRules);
    const authRule = merged.find((r) => r.id === "require-auth");
    expect(authRule?.source).toBe("seed");
    expect(authRule?.severity).toBe("critical");
  });

  it("filters out low-confidence learned rules", () => {
    const merged = mergeRules(seedRules, learnedRules);
    expect(merged.find((r) => r.id === "low-confidence-rule")).toBeUndefined();
  });
});

describe("matchRulesToFiles", () => {
  const changedFiles: ChangedFile[] = [
    {
      path: "src/api/users.ts",
      status: "modified",
      hunks: [],
      addedLines: [],
      removedLines: [],
      patch: "",
    },
    {
      path: "src/services/auth.ts",
      status: "modified",
      hunks: [],
      addedLines: [],
      removedLines: [],
      patch: "",
    },
    {
      path: "README.md",
      status: "modified",
      hunks: [],
      addedLines: [],
      removedLines: [],
      patch: "",
    },
  ];

  it("matches rules to files by scope glob", () => {
    const fileRules = matchRulesToFiles(seedRules, changedFiles);
    expect(fileRules.get("src/api/users.ts")).toHaveLength(1);
    expect(fileRules.get("src/api/users.ts")![0].id).toBe("require-auth");
    expect(fileRules.get("src/services/auth.ts")).toHaveLength(1);
    expect(fileRules.get("src/services/auth.ts")![0].id).toBe("require-logging");
  });

  it("excludes files that don't match any rule scope", () => {
    const fileRules = matchRulesToFiles(seedRules, changedFiles);
    expect(fileRules.has("README.md")).toBe(false);
  });
});

describe("getActiveRules", () => {
  const changedFiles: ChangedFile[] = [
    {
      path: "src/api/users.ts",
      status: "modified",
      hunks: [],
      addedLines: [],
      removedLines: [],
      patch: "",
    },
  ];

  it("returns only rules that match at least one changed file", () => {
    const active = getActiveRules(seedRules, changedFiles);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("require-auth");
  });
});
