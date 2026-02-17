import { minimatch } from "minimatch";
import type {
  FileContent,
  Finding,
  HardRule,
  PolicyBundle,
  RoutedFile,
  Severity,
  SpecialistName,
} from "../../types.js";

export interface SpecialistInput {
  specialist: SpecialistName;
  routedFiles: RoutedFile[];
  fileContentByPath: Map<string, FileContent>;
  policy: PolicyBundle;
}

interface FindingParams {
  ruleId: string;
  severity: Severity;
  file: string;
  line: number;
  title: string;
  explanation: string;
  suggestion?: string;
  category: SpecialistName;
  agent: string;
  evidence?: string;
}

export function createFinding(params: FindingParams): Finding {
  return {
    ruleId: params.ruleId,
    severity: params.severity,
    file: params.file,
    line: params.line,
    title: params.title,
    explanation: params.explanation,
    suggestion: params.suggestion,
    category: params.category,
    agent: params.agent,
    evidence: params.evidence,
  };
}

export function isAllowlisted(path: string, ruleId: string, policy: PolicyBundle): boolean {
  return policy.allowlist.some((entry) => {
    if (!minimatch(path, entry.path)) return false;
    if (!entry.ruleIds || entry.ruleIds.length === 0) return true;
    return entry.ruleIds.includes(ruleId);
  });
}

function findLineByRegexInAddedLines(routedFile: RoutedFile, regex: RegExp): number {
  for (const line of routedFile.file.addedLines) {
    if (regex.test(line.content)) return line.lineNumber;
  }
  return routedFile.file.addedLines[0]?.lineNumber ?? 1;
}

function findLineByRegexInFile(content: string, regex: RegExp): number {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) return i + 1;
  }
  return 1;
}

function getTextTarget(rule: HardRule, routedFile: RoutedFile, fileContent?: string): string {
  if (rule.target === "file_content") {
    return fileContent ?? "";
  }
  return routedFile.file.addedLines.map((line) => line.content).join("\n");
}

function getLineTarget(rule: HardRule, routedFile: RoutedFile, fileContent?: string): number {
  let regex: RegExp;
  try {
    regex = new RegExp(rule.pattern, "m");
  } catch {
    return routedFile.file.addedLines[0]?.lineNumber ?? 1;
  }

  if (rule.target === "file_content") {
    return findLineByRegexInFile(fileContent ?? "", regex);
  }
  return findLineByRegexInAddedLines(routedFile, regex);
}

export function applyHardRules(input: SpecialistInput): Finding[] {
  const findings: Finding[] = [];
  const rules = input.policy.hardRules.filter(
    (rule) => rule.category === "any" || rule.category === input.specialist
  );

  for (const routedFile of input.routedFiles) {
    const filePath = routedFile.file.path;
    const fileContent = input.fileContentByPath.get(filePath)?.content;

    for (const rule of rules) {
      if (!minimatch(filePath, rule.scope)) continue;
      if (isAllowlisted(filePath, rule.id, input.policy)) continue;

      let regex: RegExp;
      try {
        regex = new RegExp(rule.pattern, "m");
      } catch {
        continue;
      }

      const targetText = getTextTarget(rule, routedFile, fileContent);
      const matched = regex.test(targetText);
      const violated = rule.mode === "forbid_regex" ? matched : !matched;

      if (!violated) continue;

      const line = getLineTarget(rule, routedFile, fileContent);
      findings.push(
        createFinding({
          ruleId: rule.id,
          severity: rule.severity,
          file: filePath,
          line,
          title: rule.description,
          explanation: rule.message ?? `Hard rule violated: ${rule.id}`,
          category: input.specialist,
          agent: `${input.specialist}-agent`,
          evidence: rule.pattern,
        })
      );
    }
  }

  return findings;
}

export function limitFindings(
  findings: Finding[],
  policy: PolicyBundle,
  specialist: SpecialistName
): Finding[] {
  const limit = policy.agents.specialists[specialist].maxFindings;
  return findings.slice(0, limit);
}

export function getAddedLinesText(routedFile: RoutedFile): string {
  return routedFile.file.addedLines.map((line) => line.content).join("\n");
}
