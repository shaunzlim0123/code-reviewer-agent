import { describe, expect, it } from "vitest";
import { runLoggingErrorAgent } from "../../../src/agents/specialists/logging-error.js";
import { makePolicy, makeRoutedFile } from "../../helpers.js";

describe("runLoggingErrorAgent", () => {
  it("detects legacy logger usage", () => {
    const findings = runLoggingErrorAgent({
      specialist: "logging-error",
      routedFiles: [makeRoutedFile("src/service/foo.go", "service", ["log.V1.CtxError(ctx, \"oops\")"])],
      fileContentByPath: new Map(),
      policy: makePolicy(),
    });

    expect(findings.some((f) => f.ruleId === "logging-legacy-v1")).toBe(true);
  });

  it("does not flag preferred logging in test files", () => {
    const findings = runLoggingErrorAgent({
      specialist: "logging-error",
      routedFiles: [makeRoutedFile("tests/foo.test.ts", "test", ["console.log('test only')"])],
      fileContentByPath: new Map(),
      policy: makePolicy(),
    });

    expect(findings).toHaveLength(0);
  });
});
