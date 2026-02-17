import type { Finding } from "../../types.js";
import {
  applyHardRules,
  createFinding,
  getAddedLinesText,
  limitFindings,
  type SpecialistInput,
} from "./common.js";

function checkBuiltInLogging(input: SpecialistInput): Finding[] {
  const findings: Finding[] = [];

  for (const routedFile of input.routedFiles) {
    const path = routedFile.file.path;
    const lower = path.toLowerCase();
    const isTest = lower.includes("/test/") || lower.includes("/tests/") || lower.endsWith(".test.ts") || lower.endsWith("_test.go");

    if (isTest) continue;

    const addedText = getAddedLinesText(routedFile);

    for (const line of routedFile.file.addedLines) {
      if (/\blog\.V1\./.test(line.content)) {
        findings.push(
          createFinding({
            ruleId: "logging-legacy-v1",
            severity: "warning",
            file: path,
            line: line.lineNumber,
            title: "Legacy logging API used in new code",
            explanation:
              "New code should not introduce legacy logging APIs. Use the structured logging convention required by the repository.",
            suggestion: "Replace legacy logger usage with the preferred structured logging API.",
            category: "logging-error",
            agent: "logging-error-agent",
            evidence: line.content.trim(),
          })
        );
      }

      if (/\bconsole\.(log|error|warn)\(/.test(line.content)) {
        findings.push(
          createFinding({
            ruleId: "logging-console-usage",
            severity: "warning",
            file: path,
            line: line.lineNumber,
            title: "Console logging in application code",
            explanation:
              "Application code should use structured logging for observability and consistent error context.",
            suggestion: "Replace console logging with the project logging abstraction.",
            category: "logging-error",
            agent: "logging-error-agent",
            evidence: line.content.trim(),
          })
        );
      }
    }

    if (/\bcatch\s*\(/.test(addedText) && !/\blog(?:ger)?\.|\bthrow\b|\.Error\(|\.error\(/.test(addedText)) {
      const line = routedFile.file.addedLines.find((l) => /\bcatch\s*\(/.test(l.content))?.lineNumber ?? 1;
      findings.push(
        createFinding({
          ruleId: "logging-catch-no-log",
          severity: "warning",
          file: path,
          line,
          title: "Catch block appears to miss error logging/propagation",
          explanation:
            "New catch blocks should either log with context or rethrow to avoid silent failures.",
          suggestion: "Add structured error logging and/or rethrow after handling.",
          category: "logging-error",
          agent: "logging-error-agent",
        })
      );
    }
  }

  return findings;
}

export function runLoggingErrorAgent(input: SpecialistInput): Finding[] {
  const findings = [
    ...checkBuiltInLogging(input),
    ...applyHardRules(input),
  ];

  return limitFindings(findings, input.policy, "logging-error");
}
