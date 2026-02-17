import { describe, expect, it } from "vitest";
import { runDataAccessAgent } from "../../../src/agents/specialists/data-access.js";
import { makePolicy, makeRoutedFile } from "../../helpers.js";

describe("runDataAccessAgent", () => {
  it("flags direct DB usage outside DAL", () => {
    const findings = runDataAccessAgent({
      specialist: "data-access",
      routedFiles: [makeRoutedFile("src/service/foo.go", "service", ["config.MysqlCli.WithContext(ctx).Find(&rows)"])],
      fileContentByPath: new Map(),
      policy: makePolicy(),
    });

    expect(findings.some((f) => f.ruleId === "data-access-outside-dal")).toBe(true);
  });

  it("does not flag direct DB usage in DAL", () => {
    const findings = runDataAccessAgent({
      specialist: "data-access",
      routedFiles: [makeRoutedFile("src/dal/foo.go", "dal", ["config.MysqlCli.WithContext(ctx).Find(&rows)"])],
      fileContentByPath: new Map(),
      policy: makePolicy(),
    });

    expect(findings).toHaveLength(0);
  });
});
