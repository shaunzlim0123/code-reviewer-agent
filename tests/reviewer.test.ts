import { describe, it, expect } from "vitest";
import { lineToDiffPosition, buildReviewOutput } from "../src/reviewer.js";
import type { AnalysisResult, ChangedFile } from "../src/types.js";

const changedFiles: ChangedFile[] = [
  {
    path: "src/api/users.ts",
    status: "modified",
    hunks: [
      {
        header: "@@ -5,4 +5,6 @@",
        oldStart: 5,
        oldLines: 4,
        newStart: 5,
        newLines: 6,
        content: ` context line
-removed
+added line 1
+added line 2
+added line 3
 context end`,
      },
    ],
    addedLines: [
      { type: "add", lineNumber: 6, content: "added line 1" },
      { type: "add", lineNumber: 7, content: "added line 2" },
      { type: "add", lineNumber: 8, content: "added line 3" },
    ],
    removedLines: [{ type: "delete", lineNumber: 6, content: "removed" }],
    patch: "",
  },
];

describe("lineToDiffPosition", () => {
  it("maps a new file line to its diff position", () => {
    // Line 6 in new file = position in diff after the hunk header
    const pos = lineToDiffPosition(changedFiles, "src/api/users.ts", 6);
    expect(pos).toBeDefined();
    expect(typeof pos).toBe("number");
  });

  it("returns undefined for files not in the diff", () => {
    const pos = lineToDiffPosition(changedFiles, "src/other.ts", 1);
    expect(pos).toBeUndefined();
  });

  it("returns undefined for lines not in any hunk", () => {
    const pos = lineToDiffPosition(changedFiles, "src/api/users.ts", 1);
    expect(pos).toBeUndefined();
  });
});

describe("buildReviewOutput", () => {
  it("returns APPROVE when no findings", () => {
    const result: AnalysisResult = {
      findings: [],
      summary: "All clear",
      passCount: 3,
      tokenUsage: { inputTokens: 100, outputTokens: 50 },
    };

    const review = buildReviewOutput(result, changedFiles, 3);
    expect(review.event).toBe("APPROVE");
    expect(review.body).toContain("No semantic issues found");
    expect(review.comments).toHaveLength(0);
  });

  it("returns REQUEST_CHANGES when critical findings exist", () => {
    const result: AnalysisResult = {
      findings: [
        {
          ruleId: "require-auth",
          severity: "critical",
          file: "src/api/users.ts",
          line: 6,
          title: "Missing auth check",
          explanation: "Endpoint has no authentication",
        },
      ],
      summary: "Found critical issues",
      passCount: 3,
      tokenUsage: { inputTokens: 200, outputTokens: 100 },
    };

    const review = buildReviewOutput(result, changedFiles, 3);
    expect(review.event).toBe("REQUEST_CHANGES");
    expect(review.body).toContain("Critical");
  });

  it("returns COMMENT when only warnings exist", () => {
    const result: AnalysisResult = {
      findings: [
        {
          ruleId: "require-logging",
          severity: "warning",
          file: "src/api/users.ts",
          line: 6,
          title: "Missing error logging",
          explanation: "Error is caught but not logged",
        },
      ],
      summary: "Minor issues found",
      passCount: 3,
      tokenUsage: { inputTokens: 150, outputTokens: 75 },
    };

    const review = buildReviewOutput(result, changedFiles, 3);
    expect(review.event).toBe("COMMENT");
  });

  it("limits inline comments to maxInlineComments", () => {
    const result: AnalysisResult = {
      findings: [
        { ruleId: "r1", severity: "critical", file: "src/api/users.ts", line: 6, title: "Issue 1", explanation: "..." },
        { ruleId: "r2", severity: "critical", file: "src/api/users.ts", line: 7, title: "Issue 2", explanation: "..." },
        { ruleId: "r3", severity: "warning", file: "src/api/users.ts", line: 8, title: "Issue 3", explanation: "..." },
        { ruleId: "r4", severity: "info", file: "src/api/users.ts", line: 6, title: "Issue 4", explanation: "..." },
      ],
      summary: "Multiple issues",
      passCount: 3,
      tokenUsage: { inputTokens: 300, outputTokens: 150 },
    };

    const review = buildReviewOutput(result, changedFiles, 2);
    // At most 2 inline comments, but only for lines that resolve to diff positions
    expect(review.comments.length).toBeLessThanOrEqual(2);
    // Summary should still mention all 4 findings
    expect(review.body).toContain("Issue 1");
    expect(review.body).toContain("Issue 4");
  });
});
