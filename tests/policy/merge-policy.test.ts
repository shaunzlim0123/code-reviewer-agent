import { describe, expect, it } from "vitest";
import { mergePolicy } from "../../src/policy/merge-policy.js";
import type { PolicySnapshot, ReviewPilotConfig, Rule } from "../../src/types.js";
import { makeDefaultAgents } from "../helpers.js";

function makeConfig(): ReviewPilotConfig {
  return {
    rules: [],
    softRules: [
      {
        id: "dup-soft",
        description: "from config",
        scope: "src/**",
        pattern: "config-pattern",
        severity: "warning",
        source: "seed",
      },
      {
        id: "config-only",
        description: "config only",
        scope: "src/services/**",
        pattern: "service-pattern",
        severity: "info",
        source: "seed",
      },
    ],
    hardRules: [
      {
        id: "dup-hard",
        description: "hard from config",
        scope: "src/**",
        severity: "critical",
        source: "seed",
        category: "any",
        mode: "forbid_regex",
        pattern: "secret",
        target: "added_lines",
        newCodeOnly: true,
      },
    ],
    ignore: ["**/*.snap", "**/*.snap"],
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
    agents: makeDefaultAgents(),
  };
}

describe("mergePolicy", () => {
  it("applies precedence snapshot -> learned -> config with config winning", () => {
    const config = makeConfig();

    const learnedRules: Rule[] = [
      {
        id: "dup-soft",
        description: "from learned",
        scope: "src/**",
        pattern: "learned-pattern",
        severity: "critical",
        source: "learned",
      },
    ];

    const snapshot: PolicySnapshot = {
      version: 1,
      generatedAt: "2026-01-01T00:00:00Z",
      softRules: [
        {
          id: "dup-soft",
          description: "from snapshot",
          scope: "src/**",
          pattern: "snapshot-pattern",
          severity: "info",
          source: "policy",
        },
      ],
      hardRules: [
        {
          id: "dup-hard",
          description: "hard from snapshot",
          scope: "src/**",
          severity: "warning",
          source: "policy",
          category: "any",
          mode: "forbid_regex",
          pattern: "password",
          target: "added_lines",
          newCodeOnly: true,
        },
      ],
    };

    const merged = mergePolicy(config, learnedRules, snapshot);

    const soft = merged.softRules.find((r) => r.id === "dup-soft");
    expect(soft?.description).toBe("from config");
    expect(merged.softRules.some((r) => r.id === "config-only")).toBe(true);

    const hard = merged.hardRules.find((r) => r.id === "dup-hard");
    expect(hard?.description).toBe("hard from config");

    expect(merged.ignore).toEqual(["**/*.snap"]);
  });

  it("overrides enforcement mode when mode override is provided", () => {
    const config = makeConfig();
    const merged = mergePolicy(config, [], null, "enforce");
    expect(merged.enforcement.mode).toBe("enforce");
    expect(merged.enforcement.blockOn).toEqual(["critical"]);
  });
});
