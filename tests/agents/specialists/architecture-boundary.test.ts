import { describe, expect, it } from "vitest";
import { runArchitectureBoundaryAgent } from "../../../src/agents/specialists/architecture-boundary.js";
import { makeFileContent, makePolicy, makeRoutedFile } from "../../helpers.js";

describe("runArchitectureBoundaryAgent", () => {
  it("flags handler direct DAL imports", () => {
    const routed = makeRoutedFile("src/handler/list.go", "handler", ["func List() {}"]);
    const contents = new Map([[routed.file.path, makeFileContent(routed.file.path, 'import dal "project/biz/dal"\nfunc List() {}', "go")]]);

    const findings = runArchitectureBoundaryAgent({
      specialist: "architecture-boundary",
      routedFiles: [routed],
      fileContentByPath: contents,
      policy: makePolicy(),
    });

    expect(findings.some((f) => f.ruleId === "arch-handler-direct-data-access")).toBe(true);
  });

  it("does not flag handler importing service only", () => {
    const routed = makeRoutedFile("src/handler/list.go", "handler", ["func List() {}"]);
    const contents = new Map([[routed.file.path, makeFileContent(routed.file.path, 'import svc "project/biz/service"\nfunc List() {}', "go")]]);

    const findings = runArchitectureBoundaryAgent({
      specialist: "architecture-boundary",
      routedFiles: [routed],
      fileContentByPath: contents,
      policy: makePolicy(),
    });

    expect(findings).toHaveLength(0);
  });
});
