import { describe, expect, it } from "vitest";
import { composeSecretStorageKey } from "./secretStorageKey";

describe("composeSecretStorageKey", () => {
  it("builds echo_<envId>_<logical>", () => {
    const env = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(composeSecretStorageKey(env, "api_key")).toBe(
      "echo_a1b2c3d4-e5f6-7890-abcd-ef1234567890_api_key"
    );
  });
});
