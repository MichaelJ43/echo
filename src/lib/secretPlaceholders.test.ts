import { describe, expect, it } from "vitest";
import {
  payloadContainsSecretPlaceholder,
  textContainsSecretPlaceholder,
} from "./secretPlaceholders";

describe("textContainsSecretPlaceholder", () => {
  it("detects {{secret:name}}", () => {
    expect(textContainsSecretPlaceholder('Bearer {{secret:tok}}')).toBe(true);
  });

  it("detects hyphenated secret names", () => {
    expect(
      textContainsSecretPlaceholder("Bearer {{secret:api-key}}")
    ).toBe(true);
  });

  it("does not match env-style {{name}}", () => {
    expect(textContainsSecretPlaceholder("{{host}}/x")).toBe(false);
  });
});

describe("payloadContainsSecretPlaceholder", () => {
  it("returns true when any field has secret placeholder", () => {
    expect(
      payloadContainsSecretPlaceholder({
        url: "https://x/{{secret:u}}",
        body: "",
        headers: [],
        queryParams: [],
        auth: { type: "none" },
      })
    ).toBe(true);
  });

  it("returns false when no secret placeholders", () => {
    expect(
      payloadContainsSecretPlaceholder({
        url: "https://{{host}}/api",
        body: "",
        headers: [],
        queryParams: [],
        auth: { type: "none" },
      })
    ).toBe(false);
  });
});
