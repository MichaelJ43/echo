import { describe, expect, it } from "vitest";
import {
  expectedComposedKeysFromWorkspace,
  findOrphanComposedKeysInIndex,
  gatherSecretPlaceholderRows,
  parseEchoComposedStorageKey,
} from "./secretSync";
import type { AppState } from "../types";

const E1 = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function minimalState(
  overrides: Partial<AppState> & Pick<AppState, "environments">
): AppState {
  return {
    version: 1,
    collections: [],
    activeRequestId: null,
    ...overrides,
  };
}

function compose(envId: string, logical: string): string {
  return `echo_${envId}_${logical}`;
}

describe("parseEchoComposedStorageKey", () => {
  it("parses valid composed keys", () => {
    const k = compose(E1, "api_key");
    expect(parseEchoComposedStorageKey(k)).toEqual({
      environmentId: E1,
      logicalName: "api_key",
    });
  });

  it("returns null for legacy bare keys", () => {
    expect(parseEchoComposedStorageKey("api_key")).toBeNull();
  });
});

describe("findOrphanComposedKeysInIndex", () => {
  it("flags index keys not referenced by workspace secret rows", () => {
    const state = minimalState({
      environments: [
        {
          id: E1,
          name: "Default",
          variables: [
            {
              key: "keep",
              value: "",
              enabled: true,
              entryKind: "secret",
            },
          ],
        },
      ],
    });
    const index = [compose(E1, "keep"), compose(E1, "orphan"), "bare_legacy"];
    expect(findOrphanComposedKeysInIndex(index, state)).toEqual([
      compose(E1, "orphan"),
    ]);
  });
});

describe("gatherSecretPlaceholderRows", () => {
  it("skips empty secret names and non-secret rows", () => {
    const state = minimalState({
      environments: [
        {
          id: E1,
          name: "Default",
          variables: [
            { key: "", value: "", enabled: true, entryKind: "secret" },
            { key: "v", value: "x", enabled: true, entryKind: "variable" },
            { key: "n", value: "", enabled: true, entryKind: "secret" },
          ],
        },
      ],
    });
    expect(gatherSecretPlaceholderRows(state)).toEqual([
      { environmentId: E1, logicalName: "n" },
    ]);
  });
});

describe("expectedComposedKeysFromWorkspace", () => {
  it("matches gather rows count for composed keys", () => {
    const state = minimalState({
      environments: [
        {
          id: E1,
          name: "Default",
          variables: [
            { key: "a", value: "", enabled: true, entryKind: "secret" },
            { key: "b", value: "", enabled: true, entryKind: "secret" },
          ],
        },
      ],
    });
    const g = gatherSecretPlaceholderRows(state);
    const exp = expectedComposedKeysFromWorkspace(state);
    expect(g.length).toBe(2);
    expect(exp.has(compose(E1, "a"))).toBe(true);
    expect(exp.has(compose(E1, "b"))).toBe(true);
  });
});
