import { describe, expect, it } from "vitest";
import { runSecurityAgent } from "../../../src/agents/specialists/security.js";
import { makePolicy, makeRoutedFile } from "../../helpers.js";

describe("runSecurityAgent generated guard", () => {
  it("flags generated files even without secret literals", () => {
    const findings = runSecurityAgent({
      specialist: "security",
      routedFiles: [makeRoutedFile("biz/model/data_copilot_api.go", "generated", [])],
      fileContentByPath: new Map(),
      policy: makePolicy(),
    });

    expect(findings.some((f) => f.ruleId === "security-generated-file-edit")).toBe(true);
  });
});
