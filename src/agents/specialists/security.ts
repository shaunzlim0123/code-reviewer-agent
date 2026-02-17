import type { Finding } from "../../types.js";
import { applyHardRules, createFinding, limitFindings, type SpecialistInput } from "./common.js";

const SECRET_PATTERNS: Array<{ id: string; regex: RegExp; title: string }> = [
  {
    id: "security-hardcoded-secret-assignment",
    regex: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{8,}["']/i,
    title: "Possible hardcoded secret in code",
  },
  {
    id: "security-long-hex-literal",
    regex: /\b[a-fA-F0-9]{32,}\b/,
    title: "Long hex literal detected",
  },
  {
    id: "security-aws-access-key",
    regex: /\bAKIA[0-9A-Z]{16}\b/,
    title: "AWS-style access key detected",
  },
  {
    id: "security-private-key-material",
    regex: /-----BEGIN\s+(?:RSA|EC|OPENSSH|PRIVATE)\s+KEY-----/,
    title: "Private key material detected",
  },
];

function checkBuiltInSecurity(input: SpecialistInput): Finding[] {
  const findings: Finding[] = [];

  for (const routedFile of input.routedFiles) {
    const path = routedFile.file.path;

    if (routedFile.classification.kind === "generated") {
      findings.push(
        createFinding({
          ruleId: "security-generated-file-edit",
          severity: "critical",
          file: path,
          line: 1,
          title: "Generated file modified",
          explanation:
            "This file appears generated and should not be manually edited. Regenerate from source definitions instead.",
          category: "security",
          agent: "security-agent",
        })
      );
    }

    for (const line of routedFile.file.addedLines) {
      for (const pattern of SECRET_PATTERNS) {
        if (!pattern.regex.test(line.content)) continue;

        findings.push(
          createFinding({
            ruleId: pattern.id,
            severity: "critical",
            file: path,
            line: line.lineNumber,
            title: pattern.title,
            explanation:
              "Sensitive values should be loaded from secure runtime config/secrets management, not committed in code.",
            suggestion: "Move the secret to configuration or secret manager and reference it at runtime.",
            category: "security",
            agent: "security-agent",
            evidence: line.content.trim(),
          })
        );
      }
    }
  }

  return findings;
}

export function runSecurityAgent(input: SpecialistInput): Finding[] {
  const findings = [
    ...checkBuiltInSecurity(input),
    ...applyHardRules(input),
  ];

  return limitFindings(findings, input.policy, "security");
}
