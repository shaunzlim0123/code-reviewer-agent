import type { Finding } from "../../types.js";
import {
  applyHardRules,
  createFinding,
  limitFindings,
  type SpecialistInput,
} from "./common.js";

function hasValidationCall(content: string): boolean {
  return /BindAndValidate\(|schema\.parse\(|z\.object\(|Joi\.|validator\.|pydantic|validate\(/.test(content);
}

function looksLikeEndpoint(content: string): boolean {
  return /@router\s+|\.GET\(|\.POST\(|\.PUT\(|\.DELETE\(|func\s+[A-Z][A-Za-z0-9_]*\s*\(.*RequestContext/.test(content);
}

function checkBuiltInApiContract(input: SpecialistInput): Finding[] {
  const findings: Finding[] = [];

  for (const routedFile of input.routedFiles) {
    if (routedFile.classification.kind !== "handler") continue;

    const path = routedFile.file.path;
    const content = input.fileContentByPath.get(path)?.content ?? "";

    if (!looksLikeEndpoint(content)) continue;

    if (!hasValidationCall(content)) {
      const line = routedFile.file.addedLines[0]?.lineNumber ?? 1;
      findings.push(
        createFinding({
          ruleId: "api-missing-request-validation",
          severity: "warning",
          file: path,
          line,
          title: "Request validation pattern not detected",
          explanation:
            "Handler-like endpoint code should validate incoming request payloads using the project standard validation flow.",
          suggestion: "Add request binding/validation before executing business logic.",
          category: "api-contract",
          agent: "api-contract-agent",
        })
      );
    }
  }

  return findings;
}

export function runApiContractAgent(input: SpecialistInput): Finding[] {
  const findings = [
    ...checkBuiltInApiContract(input),
    ...applyHardRules(input),
  ];

  return limitFindings(findings, input.policy, "api-contract");
}
