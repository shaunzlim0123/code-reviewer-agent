import type { AnalysisResult, Finding, Severity } from "../types.js";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function dedupeFindings(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.ruleId}|${finding.file}|${finding.line}|${finding.title}`;
    if (!map.has(key)) {
      map.set(key, finding);
      continue;
    }

    const existing = map.get(key)!;
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity]) {
      map.set(key, finding);
    }
  }
  return [...map.values()];
}

function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severityDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDelta !== 0) return severityDelta;

    const fileCmp = a.file.localeCompare(b.file);
    if (fileCmp !== 0) return fileCmp;

    return a.line - b.line;
  });
}

function buildSummary(findings: Finding[]): string {
  if (findings.length === 0) {
    return "No semantic issues found by the multi-agent review pipeline.";
  }

  const critical = findings.filter((f) => f.severity === "critical").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;

  return `Multi-agent review found ${findings.length} issue(s): ${critical} critical, ${warning} warning, ${info} info.`;
}

export function synthesizeFindings(input: {
  specialistFindings: Finding[];
  passCount?: number;
}): AnalysisResult {
  const deduped = dedupeFindings(input.specialistFindings);
  const ranked = rankFindings(deduped);

  return {
    findings: ranked,
    summary: buildSummary(ranked),
    passCount: input.passCount ?? 1,
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
    },
  };
}
