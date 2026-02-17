import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  extractImports,
  resolveImportPath,
} from "../src/context-resolver.js";

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
  });
});

describe("extractImports — TypeScript", () => {
  it("extracts ES module imports", () => {
    const code = `
import { foo } from "./foo";
import bar from "../bar";
import * as baz from "./utils/baz";
import { something } from "lodash"; // npm package, should be ignored
`;
    const imports = extractImports(code, "typescript");
    expect(imports).toEqual(["./foo", "../bar", "./utils/baz"]);
  });

  it("extracts require() calls", () => {
    const code = `
const foo = require("./foo");
const bar = require("express"); // npm, should be ignored
const baz = require("../utils/baz");
`;
    const imports = extractImports(code, "typescript");
    expect(imports).toEqual(["./foo", "../utils/baz"]);
  });

  it("returns empty for code with no imports", () => {
    const code = `const x = 42;\nconsole.log(x);`;
    expect(extractImports(code, "typescript")).toEqual([]);
  });
});

describe("extractImports — Python", () => {
  it("extracts relative imports", () => {
    const code = `
from .models import User
from ..utils import helper
import .config
import os  # stdlib, should be ignored
from fastapi import FastAPI  # third-party, should be ignored
`;
    const imports = extractImports(code, "python");
    expect(imports).toEqual([".models", "..utils", ".config"]);
  });
});

describe("extractImports — Go", () => {
  it("extracts single import", () => {
    const code = `import "fmt"`;
    const imports = extractImports(code, "go");
    expect(imports).toEqual(["fmt"]);
  });

  it("extracts grouped imports", () => {
    const code = `
import (
  "context"
  "fmt"
  "github.com/user/repo/pkg"
)`;
    const imports = extractImports(code, "go");
    expect(imports).toEqual(["context", "fmt", "github.com/user/repo/pkg"]);
  });
});

describe("resolveImportPath", () => {
  it("resolves relative path with TS extensions", () => {
    const candidates = resolveImportPath("./utils", "src/index.ts", "typescript");
    expect(candidates).toContain("src/utils.ts");
    expect(candidates).toContain("src/utils.tsx");
    expect(candidates).toContain("src/utils.js");
    expect(candidates).toContain("src/utils/index.ts");
  });

  it("resolves parent directory imports", () => {
    const candidates = resolveImportPath("../shared/types", "src/services/auth.ts", "typescript");
    expect(candidates).toContain("src/shared/types.ts");
  });

  it("resolves Python imports as-is", () => {
    const candidates = resolveImportPath(".models", "app/services/auth.py", "python");
    expect(candidates).toContain("app/services/models");
  });
});
