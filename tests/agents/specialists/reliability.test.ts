import { describe, expect, it } from "vitest";
import { runReliabilityAgent } from "../../../src/agents/specialists/reliability.js";
import { makePolicy, makeRoutedFile } from "../../helpers.js";

describe("runReliabilityAgent", () => {
  it("flags panic usage in runtime files", () => {
    const findings = runReliabilityAgent({
      specialist: "reliability",
      routedFiles: [makeRoutedFile("src/service/foo.go", "service", ['panic("boom")'])],
      fileContentByPath: new Map(),
      policy: makePolicy(),
    });

    expect(findings.some((f) => f.ruleId === "reliability-panic-in-runtime")).toBe(true);
  });

  it("does not flag panic usage in test files", () => {
    const findings = runReliabilityAgent({
      specialist: "reliability",
      routedFiles: [makeRoutedFile("src/service/foo_test.go", "test", ['panic("boom")'])],
      fileContentByPath: new Map(),
      policy: makePolicy(),
    });

    expect(findings).toHaveLength(0);
  });
});
