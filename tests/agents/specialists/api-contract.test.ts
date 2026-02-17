import { describe, expect, it } from "vitest";
import { runApiContractAgent } from "../../../src/agents/specialists/api-contract.js";
import { makeFileContent, makePolicy, makeRoutedFile } from "../../helpers.js";

describe("runApiContractAgent", () => {
  it("flags endpoint-like handler without validation", () => {
    const routed = makeRoutedFile("src/handler/list_session.go", "handler", ["func ListSession() {}"]);
    const content = `// @router /manage/list_session [GET]\nfunc ListSession(ctx context.Context, c *app.RequestContext) {\n  c.JSON(200, map[string]string{\"ok\":\"1\"})\n}`;

    const findings = runApiContractAgent({
      specialist: "api-contract",
      routedFiles: [routed],
      fileContentByPath: new Map([[routed.file.path, makeFileContent(routed.file.path, content, "go")]]),
      policy: makePolicy(),
    });

    expect(findings.some((f) => f.ruleId === "api-missing-request-validation")).toBe(true);
  });

  it("does not flag handler when validation call exists", () => {
    const routed = makeRoutedFile("src/handler/list_session.go", "handler", ["func ListSession() {}"]);
    const content = `// @router /manage/list_session [GET]\nfunc ListSession(ctx context.Context, c *app.RequestContext) {\n  err := binding.BindAndValidate(c, &req)\n  _ = err\n}`;

    const findings = runApiContractAgent({
      specialist: "api-contract",
      routedFiles: [routed],
      fileContentByPath: new Map([[routed.file.path, makeFileContent(routed.file.path, content, "go")]]),
      policy: makePolicy(),
    });

    expect(findings).toHaveLength(0);
  });
});
