import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/smoke/**/*.test.js",
  extensionDevelopmentPath: process.cwd(),
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
});
