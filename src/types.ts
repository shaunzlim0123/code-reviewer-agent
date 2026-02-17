// Diff parsing

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

// Context resolution

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

// Rules and policy

export type Severity = "critical" | "warning" | "info";
export type RuleSource = "seed" | "learned" | "policy";
export type SpecialistName =
  | "security"
  | "logging-error"
  | "architecture-boundary"
  | "api-contract"
  | "data-access"
  | "reliability";

export interface Rule {
  id: string;
  description: string;
  scope: string;
  pattern: string;
  severity: Severity;
  source: RuleSource;
}

export interface HardRule {
  id: string;
  description: string;
  scope: string;
  severity: Severity;
  source: RuleSource;
  category: SpecialistName | "any";
  mode: "forbid_regex" | "require_regex";
  pattern: string;
  target: "added_lines" | "file_content";
  message?: string;
  newCodeOnly: boolean;
}

export interface AllowlistEntry {
  path: string;
  ruleIds?: string[];
  reason?: string;
}

export interface EnforcementSettings {
  mode: "warn" | "enforce";
  blockOn: Severity[];
  newCodeOnly: boolean;
  maxComments: number;
}

export interface AgentRuntimeSettings {
  enabled: boolean;
  maxFindings: number;
}

export interface AgentSettings {
  specialists: Record<SpecialistName, AgentRuntimeSettings>;
}

export interface ReviewPilotConfig {
  // Backward-compatible alias with previous config format.
  rules: Rule[];
  softRules: Rule[];
  hardRules: HardRule[];
  ignore: string[];
  allowlist: AllowlistEntry[];
  settings: {
    maxInlineComments: number;
    model: string;
    contextBudget: number;
  };
  enforcement: EnforcementSettings;
  agents: AgentSettings;
}

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
  confidence: number;
}

export interface LearnedRulesStore {
  version: number;
  rules: LearnedRule[];
  lastUpdated: string;
}

export interface PolicySnapshot {
  version: number;
  generatedAt: string;
  softRules: Rule[];
  hardRules: HardRule[];
}

export interface PolicyBundle {
  softRules: Rule[];
  hardRules: HardRule[];
  allowlist: AllowlistEntry[];
  ignore: string[];
  settings: ReviewPilotConfig["settings"];
  enforcement: EnforcementSettings;
  agents: AgentSettings;
}

// Diff routing

export interface FileClassification {
  path: string;
  kind:
    | "generated"
    | "handler"
    | "service"
    | "dal"
    | "model"
    | "config"
    | "test"
    | "other";
}

export interface RoutedFile {
  file: ChangedFile;
  classification: FileClassification;
}

export interface DiffRoutingResult {
  bySpecialist: Record<SpecialistName, RoutedFile[]>;
  generatedTouched: RoutedFile[];
}

// Analysis and review output

export interface Finding {
  ruleId: string;
  severity: Severity;
  file: string;
  line: number;
  title: string;
  explanation: string;
  suggestion?: string;
  category?: SpecialistName;
  agent?: string;
  evidence?: string;
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
