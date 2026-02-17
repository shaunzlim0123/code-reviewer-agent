// ─── Diff Parsing ───────────────────────────────────────────────

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface ChangedLine {
  type: "add" | "delete" | "context";
  lineNumber: number;
  content: string;
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  hunks: DiffHunk[];
  addedLines: ChangedLine[];
  removedLines: ChangedLine[];
  patch: string;
}

// ─── Context Resolution ─────────────────────────────────────────

export interface FileContent {
  path: string;
  content: string;
  language: string;
}

export interface ReviewContext {
  changedFiles: FileContent[];
  importedFiles: FileContent[];
  repoMetadata: RepoMetadata;
  totalTokenEstimate: number;
}

export interface RepoMetadata {
  owner: string;
  repo: string;
  pullNumber: number;
  baseBranch: string;
  headBranch: string;
  headSha: string;
}

// ─── Rule Engine ────────────────────────────────────────────────

export type Severity = "critical" | "warning" | "info";

export interface Rule {
  id: string;
  description: string;
  scope: string; // glob pattern
  pattern: string; // natural language description of what to check
  severity: Severity;
  source: "seed" | "learned";
}

export interface SentinelConfig {
  rules: Rule[];
  ignore: string[];
  settings: {
    maxInlineComments: number;
    model: string;
    contextBudget: number; // token estimate limit
  };
}

// ─── Analysis Results ───────────────────────────────────────────

export interface Finding {
  ruleId: string;
  severity: Severity;
  file: string;
  line: number;
  title: string;
  explanation: string;
  suggestion?: string;
}

export interface AnalysisResult {
  findings: Finding[];
  summary: string;
  passCount: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ─── Review Output ──────────────────────────────────────────────

export interface InlineComment {
  path: string;
  line: number;
  body: string;
}

export interface ReviewOutput {
  body: string;
  comments: InlineComment[];
  event: "COMMENT" | "REQUEST_CHANGES" | "APPROVE";
}

// ─── History Mining ─────────────────────────────────────────────

export interface LearnedRule {
  id: string;
  description: string;
  scope: string;
  pattern: string;
  severity: Severity;
  source: "learned";
  learnedFrom: {
    prNumber: number;
    mergedAt: string;
  };
  confidence: number; // 0-1 how confident the extraction is
}

export interface LearnedRulesStore {
  version: number;
  rules: LearnedRule[];
  lastUpdated: string;
}
