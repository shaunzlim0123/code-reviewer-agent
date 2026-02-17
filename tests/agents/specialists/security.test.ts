import { describe, expect, it } from "vitest";
import { runSecurityAgent } from "../../../src/agents/specialists/security.js";
import { makePolicy, makeRoutedFile } from "../../helpers.js";

describe("runSecurityAgent", () => {
  it("detects hardcoded secret patterns in added lines", () => {
    const routed = [makeRoutedFile("src/service/foo.ts", "service", ['const token = "abcdefghi123";'])];
    const findings = runSecurityAgent({
      specialist: "security",
      routedFiles: routed,
      fileContentByPath: new Map(),
      policy: makePolicy(),
    });

    expect(findings.some((f) => f.ruleId === "security-hardcoded-secret-assignment")).toBe(true);
  });

  it("does not flag safe non-secret assignment", () => {
    const routed = [makeRoutedFile("src/service/foo.ts", "service", ["const token = getToken();"])];
    const findings = runSecurityAgent({
      specialist: "security",
      routedFiles: routed,
      fileContentByPath: new Map(),
      policy: makePolicy(),
    });

    expect(findings).toHaveLength(0);
  });
});
