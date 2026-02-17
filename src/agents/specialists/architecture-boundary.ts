import type { Finding } from "../../types.js";
import {
  applyHardRules,
  createFinding,
  limitFindings,
  type SpecialistInput,
} from "./common.js";

const IMPORT_LINE_REGEX = /^\s*import\s+.*$/gm;

function checkBuiltInArchitecture(input: SpecialistInput): Finding[] {
  const findings: Finding[] = [];

  for (const routedFile of input.routedFiles) {
    const path = routedFile.file.path;
    const content = input.fileContentByPath.get(path)?.content ?? "";
    const imports = content.match(IMPORT_LINE_REGEX) ?? [];

    if (routedFile.classification.kind === "handler") {
      for (const line of imports) {
        if (/\/dal\b|\/repository\b|config\.MysqlCli|gorm\./.test(line)) {
          findings.push(
            createFinding({
              ruleId: "arch-handler-direct-data-access",
              severity: "warning",
              file: path,
              line: 1,
              title: "Handler appears to depend directly on DAL/DB concerns",
              explanation:
                "Handlers should stay thin and delegate business/data access through service boundaries.",
              suggestion: "Move DAL/DB operations behind a service layer and call that service from the handler.",
              category: "architecture-boundary",
              agent: "architecture-boundary-agent",
              evidence: line.trim(),
            })
          );
        }
      }
    }

    if (routedFile.classification.kind === "model") {
      for (const line of imports) {
        if (/\/service\b|\/handler\b/.test(line)) {
          findings.push(
            createFinding({
              ruleId: "arch-model-upward-dependency",
              severity: "warning",
              file: path,
              line: 1,
              title: "Model layer imports service/handler layer",
              explanation:
                "Model/data structures should not depend on higher-level application layers.",
              category: "architecture-boundary",
              agent: "architecture-boundary-agent",
              evidence: line.trim(),
            })
          );
        }
      }
    }
  }

  return findings;
}

export function runArchitectureBoundaryAgent(input: SpecialistInput): Finding[] {
  const findings = [
    ...checkBuiltInArchitecture(input),
    ...applyHardRules(input),
  ];

  return limitFindings(findings, input.policy, "architecture-boundary");
}
