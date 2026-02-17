import { describe, expect, it } from "vitest";
import { routeDiff } from "../../src/agents/diff-router.js";
import { makeChangedFile } from "../helpers.js";

describe("routeDiff", () => {
  it("routes generated files to generatedTouched and expected specialists", () => {
    const files = [makeChangedFile("biz/model/data_copilot_api.go")];
    const routed = routeDiff(files);

    expect(routed.generatedTouched).toHaveLength(1);
    expect(routed.bySpecialist["security"]).toHaveLength(1);
    expect(routed.bySpecialist["architecture-boundary"]).toHaveLength(1);
    expect(routed.bySpecialist["api-contract"]).toHaveLength(0);
  });

  it("routes handler and service files with different specialist coverage", () => {
    const files = [
      makeChangedFile("src/handler/list_session.go"),
      makeChangedFile("src/service/session.go"),
      makeChangedFile("src/service/session_test.go"),
    ];

    const routed = routeDiff(files);

    const handlerInApiContract = routed.bySpecialist["api-contract"].some(
      (r) => r.file.path === "src/handler/list_session.go"
    );
    const serviceInApiContract = routed.bySpecialist["api-contract"].some(
      (r) => r.file.path === "src/service/session.go"
    );
    const testInApiContract = routed.bySpecialist["api-contract"].some(
      (r) => r.file.path === "src/service/session_test.go"
    );

    expect(handlerInApiContract).toBe(true);
    expect(serviceInApiContract).toBe(false);
    expect(testInApiContract).toBe(false);

    const testInReliability = routed.bySpecialist["reliability"].some(
      (r) => r.file.path === "src/service/session_test.go"
    );
    expect(testInReliability).toBe(true);
  });
});
