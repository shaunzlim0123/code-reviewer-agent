import { describe, it, expect } from "vitest";
import {
  parseHunks,
  extractChangedLines,
  parsePRFiles,
  shouldIgnoreFile,
} from "../src/diff-parser.js";

describe("parseHunks", () => {
  it("parses a single hunk", () => {
    const patch = `@@ -1,4 +1,5 @@
 line1
 line2
+added line
 line3
 line4`;

    const hunks = parseHunks(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldStart).toBe(1);
    expect(hunks[0].oldLines).toBe(4);
    expect(hunks[0].newStart).toBe(1);
    expect(hunks[0].newLines).toBe(5);
  });

  it("parses multiple hunks", () => {
    const patch = `@@ -1,3 +1,4 @@
 line1
+added1
 line2
 line3
@@ -10,3 +11,4 @@
 line10
+added2
 line11
 line12`;

    const hunks = parseHunks(patch);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].newStart).toBe(1);
    expect(hunks[1].newStart).toBe(11);
  });

  it("handles hunks with no line count (single line)", () => {
    const patch = `@@ -1 +1 @@
-old
+new`;

    const hunks = parseHunks(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldLines).toBe(1);
    expect(hunks[0].newLines).toBe(1);
  });

  it("returns empty array for empty patch", () => {
    expect(parseHunks("")).toEqual([]);
  });
});

describe("extractChangedLines", () => {
  it("extracts added and removed lines with correct line numbers", () => {
    const patch = `@@ -5,4 +5,5 @@
 context
-removed line
+added line 1
+added line 2
 context
 context`;

    const hunks = parseHunks(patch);
    const { addedLines, removedLines } = extractChangedLines(hunks);

    expect(addedLines).toHaveLength(2);
    expect(addedLines[0]).toEqual({
      type: "add",
      lineNumber: 6,
      content: "added line 1",
    });
    expect(addedLines[1]).toEqual({
      type: "add",
      lineNumber: 7,
      content: "added line 2",
    });

    expect(removedLines).toHaveLength(1);
    expect(removedLines[0]).toEqual({
      type: "delete",
      lineNumber: 6,
      content: "removed line",
    });
  });
});

describe("shouldIgnoreFile", () => {
  it("ignores lock files", () => {
    expect(shouldIgnoreFile("package-lock.json")).toBe(true);
    expect(shouldIgnoreFile("yarn.lock")).toBe(true);
    expect(shouldIgnoreFile("pnpm-lock.yaml")).toBe(true);
  });

  it("ignores image files", () => {
    expect(shouldIgnoreFile("assets/logo.png")).toBe(true);
    expect(shouldIgnoreFile("img/photo.jpg")).toBe(true);
  });

  it("ignores minified files", () => {
    expect(shouldIgnoreFile("dist/bundle.min.js")).toBe(true);
    expect(shouldIgnoreFile("styles/main.min.css")).toBe(true);
  });

  it("does not ignore source files", () => {
    expect(shouldIgnoreFile("src/index.ts")).toBe(false);
    expect(shouldIgnoreFile("app/services/auth.py")).toBe(false);
  });

  it("respects extra ignore patterns", () => {
    expect(shouldIgnoreFile("src/generated/types.ts", ["**/generated/**"])).toBe(true);
    expect(shouldIgnoreFile("src/index.ts", ["**/generated/**"])).toBe(false);
  });
});

describe("parsePRFiles", () => {
  it("parses files with patches", () => {
    const files = [
      {
        filename: "src/handler.ts",
        status: "modified",
        patch: `@@ -1,3 +1,4 @@
 import { foo } from './foo';
+import { bar } from './bar';

 export function handler() {`,
      },
    ];

    const result = parsePRFiles(files);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/handler.ts");
    expect(result[0].status).toBe("modified");
    expect(result[0].addedLines).toHaveLength(1);
    expect(result[0].addedLines[0].content).toBe("import { bar } from './bar';");
  });

  it("filters out ignored files", () => {
    const files = [
      { filename: "src/index.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
      { filename: "package-lock.json", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
    ];

    const result = parsePRFiles(files);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/index.ts");
  });

  it("skips files without patches (binary files)", () => {
    const files = [
      { filename: "logo.png", status: "added" },
      { filename: "src/index.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
    ];

    const result = parsePRFiles(files);
    expect(result).toHaveLength(1);
  });
});
