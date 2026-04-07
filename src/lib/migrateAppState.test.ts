import { describe, expect, it } from "vitest";
import { migrateAppState } from "./migrateAppState";

const E1 = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("migrateAppState", () => {
  it("fills environmentId from legacy activeEnvironmentId", () => {
    const next = migrateAppState({
      version: 1,
      activeEnvironmentId: E1,
      environments: [{ id: E1, name: "Default", variables: [] }],
      collections: [
        {
          nodeType: "folder",
          id: "f1",
          name: "Root",
          children: [
            {
              nodeType: "request",
              id: "r1",
              name: "A",
              method: "GET",
              url: "https://x.test",
              headers: [],
              queryParams: [],
              body: "",
              bodyType: "none",
              auth: { type: "none" },
              script: "",
            },
          ],
        },
      ],
      activeRequestId: "r1",
    });
    const req = next.collections[0];
    expect(req?.nodeType).toBe("folder");
    if (req?.nodeType !== "folder") return;
    const leaf = req.children[0];
    expect(leaf?.nodeType).toBe("request");
    if (leaf?.nodeType !== "request") return;
    expect(leaf.environmentId).toBe(E1);
  });

  it("reassigns dangling environmentId to first env", () => {
    const next = migrateAppState({
      version: 1,
      environments: [{ id: E1, name: "Default", variables: [] }],
      collections: [
        {
          nodeType: "request",
          id: "r1",
          name: "A",
          environmentId: "missing",
          method: "GET",
          url: "",
          headers: [],
          queryParams: [],
          body: "",
          bodyType: "none",
          auth: { type: "none" },
          script: "",
        },
      ],
      activeRequestId: "r1",
    });
    const r = next.collections[0];
    expect(r?.nodeType).toBe("request");
    if (r?.nodeType !== "request") return;
    expect(r.environmentId).toBe(E1);
  });

  it("defaults entryKind to variable for legacy rows", () => {
    const next = migrateAppState({
      version: 1,
      environments: [
        {
          id: E1,
          name: "Default",
          variables: [{ key: "k", value: "v", enabled: true }],
        },
      ],
      collections: [],
      activeRequestId: null,
    });
    expect(next.environments[0]?.variables[0]?.entryKind).toBe("variable");
  });

  it("remaps non-UUID environment ids to UUIDs", () => {
    const next = migrateAppState({
      version: 1,
      environments: [{ id: "short-id", name: "Default", variables: [] }],
      collections: [],
      activeRequestId: null,
    });
    expect(next.environments[0]?.id.length).toBe(36);
  });
});
