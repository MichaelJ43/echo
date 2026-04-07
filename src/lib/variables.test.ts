import { describe, expect, it } from "vitest";
import { applyVariables, variablesToMap } from "./variables";
import type { KeyValue } from "../types";

describe("applyVariables", () => {
  it("replaces placeholders", () => {
    const vars: KeyValue[] = [
      { key: "host", value: "api.example.com", enabled: true },
    ];
    expect(applyVariables("https://{{host}}/v1", vars)).toBe(
      "https://api.example.com/v1"
    );
  });

  it("ignores disabled rows", () => {
    const vars: KeyValue[] = [
      { key: "x", value: "y", enabled: false },
    ];
    expect(applyVariables("{{x}}", vars)).toBe("{{x}}");
  });
});

describe("variablesToMap", () => {
  it("builds a map from enabled keys", () => {
    const vars: KeyValue[] = [
      { key: "a", value: "1", enabled: true },
      { key: "b", value: "2", enabled: false },
    ];
    expect(variablesToMap(vars)).toEqual({ a: "1" });
  });

  it("excludes secret rows from {{key}} substitution map", () => {
    const vars: KeyValue[] = [
      { key: "x", value: "secret-val", enabled: true, entryKind: "secret" },
      { key: "y", value: "ok", enabled: true, entryKind: "variable" },
    ];
    expect(variablesToMap(vars)).toEqual({ y: "ok" });
  });
});
