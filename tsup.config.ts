import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // GitHub Actions requires a single bundled file with all dependencies inlined
  noExternal: [/.*/],
});
