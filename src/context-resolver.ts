import type { Context } from "@actions/github/lib/context.js";
import type { GitHub } from "@actions/github/lib/utils.js";
import type {
  ChangedFile,
  FileContent,
  RepoMetadata,
  ReviewContext,
} from "./types.js";

type Octokit = InstanceType<typeof GitHub>;

const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  go: "go",
  java: "java",
  rs: "rust",
  rb: "ruby",
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  md: "markdown",
  sh: "shell",
  bash: "shell",
};

/**
 * Rough token estimate: ~4 characters per token on average.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Infer programming language from file extension.
 */
function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? ext;
}

/**
 * Extract import paths from source code. Supports:
 * - JS/TS: import ... from "..." / require("...")
 * - Python: from ... import ... / import ...
 * - Go: import "..." / import (...)
 */
export function extractImports(
  content: string,
  language: string
): string[] {
  const imports: string[] = [];

  switch (language) {
    case "typescript":
    case "javascript": {
      // import ... from "path" or require("path")
      const importRegex =
        /(?:import\s+.*?\s+from\s+['"](.+?)['"]|require\s*\(\s*['"](.+?)['"]\s*\))/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1] ?? match[2];
        // Only resolve relative imports (not npm packages)
        if (importPath.startsWith(".") || importPath.startsWith("/")) {
          imports.push(importPath);
        }
      }
      break;
    }
    case "python": {
      // from module import ... / import module
      const pyRegex = /(?:from\s+(\S+)\s+import|^import\s+(\S+))/gm;
      let match;
      while ((match = pyRegex.exec(content)) !== null) {
        const mod = match[1] ?? match[2];
        // Only relative imports (starting with .)
        if (mod.startsWith(".")) {
          imports.push(mod);
        }
      }
      break;
    }
    case "go": {
      const goRegex = /import\s+(?:"([^"]+)"|\(\s*([\s\S]*?)\s*\))/g;
      let match;
      while ((match = goRegex.exec(content)) !== null) {
        if (match[1]) {
          imports.push(match[1]);
        } else if (match[2]) {
          const groupImports = match[2].match(/"([^"]+)"/g);
          if (groupImports) {
            for (const gi of groupImports) {
              imports.push(gi.replace(/"/g, ""));
            }
          }
        }
      }
      break;
    }
  }

  return imports;
}

/**
 * Resolve a relative import path to an absolute repo path.
 * Handles ./relative and ../parent paths, plus extension inference for JS/TS.
 */
export function resolveImportPath(
  importPath: string,
  fromFile: string,
  language: string
): string[] {
  const dir = fromFile.split("/").slice(0, -1).join("/");
  const candidates: string[] = [];

  // Normalize relative path
  // Python relative imports use leading dots: . = current package, .. = parent package
  let normalizedImport = importPath;
  let parentTraversals = 0;
  if (language === "python") {
    const dotMatch = importPath.match(/^(\.+)(.*)/);
    if (dotMatch) {
      parentTraversals = dotMatch[1].length - 1; // . = 0 traversals, .. = 1, etc.
      normalizedImport = dotMatch[2] || "";
    }
  }

  const dirParts = dir.split("/").filter(Boolean);
  // Apply parent traversals for Python
  for (let i = 0; i < parentTraversals; i++) {
    dirParts.pop();
  }

  const importParts = normalizedImport.split("/").filter(Boolean);
  const parts = [...dirParts, ...importParts];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  const basePath = resolved.join("/");

  if (language === "typescript" || language === "javascript") {
    // Try with common extensions
    candidates.push(basePath + ".ts", basePath + ".tsx", basePath + ".js", basePath + ".jsx");
    // Index files
    candidates.push(basePath + "/index.ts", basePath + "/index.js");
  } else {
    candidates.push(basePath);
  }

  return candidates;
}

/**
 * Fetch a file's content from the repository via GitHub API.
 * Returns null if the file doesn't exist.
 */
async function fetchFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ("content" in response.data && response.data.type === "file") {
      return Buffer.from(response.data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build a ReviewContext by resolving changed files and their direct imports.
 * Respects a token budget to avoid blowing context windows.
 */
export async function buildReviewContext(
  octokit: Octokit,
  context: Context,
  changedFiles: ChangedFile[],
  headSha: string,
  contextBudget: number
): Promise<ReviewContext> {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pullNumber = context.payload.pull_request?.number ?? 0;

  const metadata: RepoMetadata = {
    owner,
    repo,
    pullNumber,
    baseBranch: context.payload.pull_request?.base?.ref ?? "main",
    headBranch: context.payload.pull_request?.head?.ref ?? "",
    headSha,
  };

  let tokenBudget = contextBudget;
  const changedFileContents: FileContent[] = [];
  const importedFileContents: FileContent[] = [];
  const fetchedPaths = new Set<string>();

  // Step 1: Fetch full content for each changed file
  for (const file of changedFiles) {
    if (file.status === "removed") continue;

    const content = await fetchFileContent(octokit, owner, repo, file.path, headSha);
    if (!content) continue;

    const tokens = estimateTokens(content);
    if (tokens > tokenBudget) continue;
    tokenBudget -= tokens;

    const language = getLanguage(file.path);
    changedFileContents.push({ path: file.path, content, language });
    fetchedPaths.add(file.path);
  }

  // Step 2: Resolve and fetch direct imports for each changed file
  for (const fc of changedFileContents) {
    const importPaths = extractImports(fc.content, fc.language);

    for (const importPath of importPaths) {
      const candidates = resolveImportPath(importPath, fc.path, fc.language);

      for (const candidate of candidates) {
        if (fetchedPaths.has(candidate)) break;

        const content = await fetchFileContent(octokit, owner, repo, candidate, headSha);
        if (!content) continue;

        const tokens = estimateTokens(content);
        if (tokens > tokenBudget) break;
        tokenBudget -= tokens;

        importedFileContents.push({
          path: candidate,
          content,
          language: getLanguage(candidate),
        });
        fetchedPaths.add(candidate);
        break; // found a valid candidate, move to next import
      }
    }
  }

  return {
    changedFiles: changedFileContents,
    importedFiles: importedFileContents,
    repoMetadata: metadata,
    totalTokenEstimate: contextBudget - tokenBudget,
  };
}
