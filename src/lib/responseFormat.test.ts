import { describe, expect, it } from "vitest";
import {
  formatResponseBody,
  getContentTypeFromHeaders,
  isLikelyHtmlDocument,
} from "./responseFormat";

describe("responseFormat", () => {
  it("pretty-prints JSON object", () => {
    const r = formatResponseBody('{"a":1}', "application/json");
    expect(r.kind).toBe("json");
    expect(r.text).toContain('"a"');
    expect(r.text).toContain("\n");
  });

  it("detects HTML document", () => {
    expect(
      isLikelyHtmlDocument("<!DOCTYPE html><html>", null)
    ).toBe(true);
    expect(isLikelyHtmlDocument("", "text/html")).toBe(true);
  });

  it("reads Content-Type header", () => {
    const h: [string, string][] = [
      ["Content-Type", "application/json; charset=utf-8"],
    ];
    expect(getContentTypeFromHeaders(h)).toBe("application/json");
  });
});
