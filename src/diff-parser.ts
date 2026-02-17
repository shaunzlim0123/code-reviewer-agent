import { minimatch } from "minimatch";
import type { ChangedFile, ChangedLine, DiffHunk } from "./types.js";

// Files that should never be reviewed
const DEFAULT_IGNORE_PATTERNS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map",
  "**/*.png",
  "**/*.jpg",
  "**/*.gif",
  "**/*.ico",
  "**/*.woff",
  "**/*.woff2",
  "**/*.ttf",
  "**/*.eot",
  "**/*.svg",
  "**/*.pdf",
];

/**
 * Parse a unified diff patch string into structured DiffHunk objects.
 * Handles the `@@ -oldStart,oldLines +newStart,newLines @@` header format.
 */
export function parseHunks(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = patch.split("\n");

  let currentHunk: DiffHunk | null = null;
  const hunkHeaderRegex = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/;

  for (const line of lines) {
    const match = line.match(hunkHeaderRegex);
    if (match) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        header: line,
        oldStart: parseInt(match[1], 10),
        oldLines: match[2] ? parseInt(match[2], 10) : 1,
        newStart: parseInt(match[3], 10),
        newLines: match[4] ? parseInt(match[4], 10) : 1,
        content: "",
      };
    } else if (currentHunk) {
      currentHunk.content += (currentHunk.content ? "\n" : "") + line;
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

/**
 * Extract added and removed lines with their line numbers from hunks.
 */
export function extractChangedLines(hunks: DiffHunk[]): {
  addedLines: ChangedLine[];
  removedLines: ChangedLine[];
} {
  const addedLines: ChangedLine[] = [];
  const removedLines: ChangedLine[] = [];

  for (const hunk of hunks) {
    let newLineNum = hunk.newStart;
    let oldLineNum = hunk.oldStart;

    for (const line of hunk.content.split("\n")) {
      if (line.startsWith("+")) {
        addedLines.push({
          type: "add",
          lineNumber: newLineNum,
          content: line.slice(1),
        });
        newLineNum++;
      } else if (line.startsWith("-")) {
        removedLines.push({
          type: "delete",
          lineNumber: oldLineNum,
          content: line.slice(1),
        });
        oldLineNum++;
      } else {
        // Context line — both counters advance
        newLineNum++;
        oldLineNum++;
      }
    }
  }

  return { addedLines, removedLines };
}

/**
 * Determine file status from GitHub's file status string.
 */
function normalizeStatus(
  status: string
): "added" | "modified" | "removed" | "renamed" {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}

/**
 * Check whether a file path should be excluded from review.
 */
export function shouldIgnoreFile(
  path: string,
  extraIgnorePatterns: string[] = []
): boolean {
  const allPatterns = [...DEFAULT_IGNORE_PATTERNS, ...extraIgnorePatterns];
  return allPatterns.some((pattern) => minimatch(path, pattern));
}

/**
 * Parse the list of PR files (from GitHub API) into structured ChangedFile objects.
 * Filters out non-reviewable files (binaries, lockfiles, etc).
 */
export function parsePRFiles(
  files: Array<{
    filename: string;
    status: string;
    patch?: string;
  }>,
  ignorePatterns: string[] = []
): ChangedFile[] {
  const changedFiles: ChangedFile[] = [];

  for (const file of files) {
    if (shouldIgnoreFile(file.filename, ignorePatterns)) continue;
    if (!file.patch) continue; // Binary files or files with no diff

    const hunks = parseHunks(file.patch);
    const { addedLines, removedLines } = extractChangedLines(hunks);

    changedFiles.push({
      path: file.filename,
      status: normalizeStatus(file.status),
      hunks,
      addedLines,
      removedLines,
      patch: file.patch,
    });
  }

  return changedFiles;
}
