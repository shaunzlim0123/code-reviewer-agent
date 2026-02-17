import { describe, expect, it } from "vitest";
import { synthesizeFindings } from "../../src/agents/review-synthesizer.js";

describe("synthesizeFindings", () => {
  it("dedupes findings and keeps higher severity duplicate", () => {
    const result = synthesizeFindings({
      specialistFindings: [
        {
          ruleId: "r1",
          severity: "warning",
          file: "a.ts",
          line: 10,
          title: "same",
          explanation: "warn",
        },
        {
          ruleId: "r1",
          severity: "critical",
          file: "a.ts",
          line: 10,
          title: "same",
          explanation: "critical",
        },
      ],
      passCount: 6,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("critical");
    expect(result.passCount).toBe(6);
  });

  it("ranks by severity then file then line and builds summary counts", () => {
    const result = synthesizeFindings({
      specialistFindings: [
        {
          ruleId: "i",
          severity: "info",
          file: "b.ts",
          line: 2,
          title: "i",
          explanation: "i",
        },
        {
          ruleId: "c",
          severity: "critical",
          file: "z.ts",
          line: 9,
          title: "c",
          explanation: "c",
        },
        {
          ruleId: "w",
          severity: "warning",
          file: "a.ts",
          line: 1,
          title: "w",
          explanation: "w",
        },
      ],
    });

    expect(result.findings.map((f) => f.ruleId)).toEqual(["c", "w", "i"]);
    expect(result.summary).toContain("1 critical");
    expect(result.summary).toContain("1 warning");
    expect(result.summary).toContain("1 info");
  });
});
