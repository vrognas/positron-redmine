import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Activation", () => {
  test("Should activate extension", async () => {
    const ext = vscode.extensions.getExtension("vrognas.positron-redmine");
    assert.ok(ext, "Extension not found");

    await ext.activate();
    assert.strictEqual(ext.isActive, true, "Extension failed to activate");
  });
});
