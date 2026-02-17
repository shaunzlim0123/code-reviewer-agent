import type {
  ChangedFile,
  DiffRoutingResult,
  FileClassification,
  RoutedFile,
  SpecialistName,
} from "../types.js";

function classifyPath(path: string): FileClassification["kind"] {
  const p = path.toLowerCase();

  if (
    p.includes("/generated/") ||
    p.includes("/gen/") ||
    p.includes("/biz/model/") ||
    p.includes("biz/model/") ||
    p.endsWith("_gen.go") ||
    p.endsWith("router_gen.go")
  ) {
    return "generated";
  }

  if (p.includes("/handler/") || p.includes("/handlers/") || p.includes("/api/")) return "handler";
  if (p.includes("/service/") || p.includes("/services/")) return "service";
  if (p.includes("/dal/") || p.includes("/repository/") || p.includes("/repos/")) return "dal";
  if (p.includes("/model/") || p.includes("/models/")) return "model";
  if (p.includes("/config/") || p.endsWith("config.ts") || p.endsWith("config.go")) return "config";
  if (p.includes("/test/") || p.includes("/tests/") || p.endsWith(".test.ts") || p.endsWith("_test.go")) return "test";
  return "other";
}

function specialistsForKind(kind: FileClassification["kind"]): SpecialistName[] {
  if (kind === "test") return ["security", "reliability"];
  if (kind === "generated") return ["security", "architecture-boundary"];

  const common: SpecialistName[] = ["security", "logging-error", "reliability"];

  if (kind === "handler") {
    return [...common, "architecture-boundary", "api-contract", "data-access"];
  }
  if (kind === "service") {
    return [...common, "architecture-boundary", "data-access"];
  }
  if (kind === "dal") {
    return [...common, "architecture-boundary"];
  }
  if (kind === "config") {
    return ["security", "logging-error", "reliability"];
  }

  return [...common, "architecture-boundary", "data-access", "api-contract"];
}

function buildEmptyRouteMap(): DiffRoutingResult["bySpecialist"] {
  return {
    "security": [],
    "logging-error": [],
    "architecture-boundary": [],
    "api-contract": [],
    "data-access": [],
    "reliability": [],
  };
}

export function routeDiff(changedFiles: ChangedFile[]): DiffRoutingResult {
  const bySpecialist = buildEmptyRouteMap();
  const generatedTouched: RoutedFile[] = [];

  for (const file of changedFiles) {
    const classification: FileClassification = {
      path: file.path,
      kind: classifyPath(file.path),
    };

    const routed: RoutedFile = { file, classification };

    if (classification.kind === "generated") {
      generatedTouched.push(routed);
    }

    for (const specialist of specialistsForKind(classification.kind)) {
      bySpecialist[specialist].push(routed);
    }
  }

  return {
    bySpecialist,
    generatedTouched,
  };
}
