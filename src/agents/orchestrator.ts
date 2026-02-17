import type { AnalysisResult, FileContent, PolicyBundle, SpecialistName } from "../types.js";
import type { DiffRoutingResult } from "../types.js";
import { synthesizeFindings } from "./review-synthesizer.js";
import { runSecurityAgent } from "./specialists/security.js";
import { runLoggingErrorAgent } from "./specialists/logging-error.js";
import { runArchitectureBoundaryAgent } from "./specialists/architecture-boundary.js";
import { runApiContractAgent } from "./specialists/api-contract.js";
import { runDataAccessAgent } from "./specialists/data-access.js";
import { runReliabilityAgent } from "./specialists/reliability.js";

const SPECIALIST_ORDER: SpecialistName[] = [
  "security",
  "logging-error",
  "architecture-boundary",
  "api-contract",
  "data-access",
  "reliability",
];

export function runOrchestrator(input: {
  routing: DiffRoutingResult;
  policy: PolicyBundle;
  changedFileContents: FileContent[];
}): AnalysisResult {
  const fileContentByPath = new Map(input.changedFileContents.map((f) => [f.path, f]));

  const specialistFindings = [] as ReturnType<typeof synthesizeFindings>["findings"];

  for (const specialist of SPECIALIST_ORDER) {
    const settings = input.policy.agents.specialists[specialist];
    if (!settings.enabled) continue;

    const specialistInput = {
      specialist,
      routedFiles: input.routing.bySpecialist[specialist],
      fileContentByPath,
      policy: input.policy,
    };

    switch (specialist) {
      case "security":
        specialistFindings.push(...runSecurityAgent(specialistInput));
        break;
      case "logging-error":
        specialistFindings.push(...runLoggingErrorAgent(specialistInput));
        break;
      case "architecture-boundary":
        specialistFindings.push(...runArchitectureBoundaryAgent(specialistInput));
        break;
      case "api-contract":
        specialistFindings.push(...runApiContractAgent(specialistInput));
        break;
      case "data-access":
        specialistFindings.push(...runDataAccessAgent(specialistInput));
        break;
      case "reliability":
        specialistFindings.push(...runReliabilityAgent(specialistInput));
        break;
    }
  }

  return synthesizeFindings({
    specialistFindings,
    passCount: SPECIALIST_ORDER.length,
  });
}
