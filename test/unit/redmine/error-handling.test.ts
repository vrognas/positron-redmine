import { describe, it, expect } from "vitest";
import {
  RedmineServer,
  RedmineOptionsError,
} from "../../../src/redmine/redmine-server";

describe("RedmineServer Error Handling", () => {
  describe("validation", () => {
    it("should throw on empty address", () => {
      expect(() => new RedmineServer({ address: "", key: "test" })).toThrow(
        RedmineOptionsError
      );
    });

    it("should throw on empty key", () => {
      expect(
        () => new RedmineServer({ address: "https://localhost:3000", key: "" })
      ).toThrow(RedmineOptionsError);
    });

    it("should throw on invalid URL", () => {
      expect(
        () => new RedmineServer({ address: "not-a-url", key: "test" })
      ).toThrow(RedmineOptionsError);
    });

    it("should throw on invalid protocol", () => {
      expect(
        () =>
          new RedmineServer({ address: "ftp://localhost:3000", key: "test" })
      ).toThrow(RedmineOptionsError);
    });
  });

  describe("https enforcement", () => {
    it("should accept https URLs", () => {
      const server = new RedmineServer({
        address: "https://localhost:3000",
        key: "test",
      });
      expect(server.request).toBeDefined();
    });

    it("should reject http URLs", () => {
      expect(
        () =>
          new RedmineServer({
            address: "http://localhost:3000",
            key: "test",
          })
      ).toThrow(RedmineOptionsError);
      expect(
        () =>
          new RedmineServer({
            address: "http://localhost:3000",
            key: "test",
          })
      ).toThrow("HTTPS required");
    });
  });
});
