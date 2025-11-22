export default {
  files: "out/test/smoke/**/*.test.js",
  extensionDevelopmentPath: process.cwd(),
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
};
