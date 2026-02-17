import type { Finding } from "../../types.js";
import {
  applyHardRules,
  createFinding,
  limitFindings,
  type SpecialistInput,
} from "./common.js";

function checkBuiltInReliability(input: SpecialistInput): Finding[] {
  const findings: Finding[] = [];

  for (const routedFile of input.routedFiles) {
    const path = routedFile.file.path;
    const lower = path.toLowerCase();
    const isTest = lower.includes("/test/") || lower.includes("/tests/") || lower.endsWith(".test.ts") || lower.endsWith("_test.go");

    if (isTest) continue;

    for (const line of routedFile.file.addedLines) {
      if (/\bpanic\(/.test(line.content)) {
        findings.push(
          createFinding({
            ruleId: "reliability-panic-in-runtime",
            severity: "warning",
            file: path,
            line: line.lineNumber,
            title: "panic introduced in runtime path",
            explanation:
              "panic should be avoided in request/runtime paths; prefer returning errors and structured logging.",
            suggestion: "Return an error and let caller handle it with standard error flow.",
            category: "reliability",
            agent: "reliability-agent",
            evidence: line.content.trim(),
          })
        );
      }

      if (/context\.Background\(|context\.TODO\(/.test(line.content) && /\/biz\/|\/handler\/|\/service\//.test(lower)) {
        findings.push(
          createFinding({
            ruleId: "reliability-background-context",
            severity: "info",
            file: path,
            line: line.lineNumber,
            title: "Background/TODO context used in request/business path",
            explanation:
              "Business/request paths should propagate caller context for cancellation, deadlines, and tracing.",
            suggestion: "Thread context from the caller instead of creating a new background context.",
            category: "reliability",
            agent: "reliability-agent",
            evidence: line.content.trim(),
          })
        );
      }

      if (/panic\("implement me"\)|TODO|FIXME/.test(line.content)) {
        findings.push(
          createFinding({
            ruleId: "reliability-todo-runtime",
            severity: "info",
            file: path,
            line: line.lineNumber,
            title: "Runtime code contains TODO/FIXME placeholder",
            explanation:
              "Placeholders in production paths can cause incomplete behavior and regressions.",
              category: "reliability",
            agent: "reliability-agent",
            evidence: line.content.trim(),
          })
        );
      }
    }
  }

  return findings;
}

export function runReliabilityAgent(input: SpecialistInput): Finding[] {
  const findings = [
    ...checkBuiltInReliability(input),
    ...applyHardRules(input),
  ];

  return limitFindings(findings, input.policy, "reliability");
}
