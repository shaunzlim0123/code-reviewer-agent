import type {
  AgentSettings,
  ChangedFile,
  FileContent,
  PolicyBundle,
  RoutedFile,
  SpecialistName,
} from "../src/types.js";

export function makeChangedFile(path: string, added: string[] = []): ChangedFile {
  return {
    path,
    status: "modified",
    hunks: [],
    addedLines: added.map((content, idx) => ({
      type: "add" as const,
      lineNumber: idx + 1,
      content,
    })),
    removedLines: [],
    patch: "",
  };
}

export function makeRoutedFile(
  path: string,
  kind: RoutedFile["classification"]["kind"],
  added: string[] = []
): RoutedFile {
  return {
    file: makeChangedFile(path, added),
    classification: { path, kind },
  };
}

export function makeFileContent(path: string, content: string, language = "typescript"): FileContent {
  return { path, content, language };
}

export function makeDefaultAgents(): AgentSettings {
  const specialistNames: SpecialistName[] = [
    "security",
    "logging-error",
    "architecture-boundary",
    "api-contract",
    "data-access",
    "reliability",
  ];

  const specialists = Object.fromEntries(
    specialistNames.map((name) => [name, { enabled: true, maxFindings: 100 }])
  ) as AgentSettings["specialists"];

  return { specialists };
}

export function makePolicy(partial?: Partial<PolicyBundle>): PolicyBundle {
  return {
    softRules: [],
    hardRules: [],
    allowlist: [],
    ignore: [],
    settings: {
      maxInlineComments: 3,
      model: "claude-sonnet-4-5-20250929",
      contextBudget: 50000,
    },
    enforcement: {
      mode: "warn",
      blockOn: ["critical"],
      newCodeOnly: true,
      maxComments: 3,
    },
    agents: makeDefaultAgents(),
    ...partial,
  };
}
