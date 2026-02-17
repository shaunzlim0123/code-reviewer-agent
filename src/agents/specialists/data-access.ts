import type { Finding } from "../../types.js";
import {
  applyHardRules,
  createFinding,
  limitFindings,
  type SpecialistInput,
} from "./common.js";

function checkBuiltInDataAccess(input: SpecialistInput): Finding[] {
  const findings: Finding[] = [];

  for (const routedFile of input.routedFiles) {
    const path = routedFile.file.path;
    if (routedFile.classification.kind === "dal" || routedFile.classification.kind === "config") {
      continue;
    }

    for (const line of routedFile.file.addedLines) {
      if (/config\.MysqlCli|gorm\.|sql\.Open\(|db\.Query\(|db\.Exec\(|RedisCli|redis\.NewClient/.test(line.content)) {
        findings.push(
          createFinding({
            ruleId: "data-access-outside-dal",
            severity: "warning",
            file: path,
            line: line.lineNumber,
            title: "Direct data-access usage outside DAL/config layer",
            explanation:
              "Direct database/cache access in non-DAL files increases coupling and makes review harder. Keep data access behind DAL/repository boundaries.",
            suggestion: "Move this access into DAL/repository and call it from service/handler.",
            category: "data-access",
            agent: "data-access-agent",
            evidence: line.content.trim(),
          })
        );
      }
    }
  }

  return findings;
}

export function runDataAccessAgent(input: SpecialistInput): Finding[] {
  const findings = [
    ...checkBuiltInDataAccess(input),
    ...applyHardRules(input),
  ];

  return limitFindings(findings, input.policy, "data-access");
}
