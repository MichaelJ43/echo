import { describe, expect, it } from "vitest";
import type { AppState } from "../types";
import {
  mergeImportedUnderFolder,
  remapImportedWorkspaceIds,
} from "./importWorkspace";

function minimalState(): AppState {
  return {
    version: 1,
    environments: [{ id: "e-root", name: "Root env", variables: [] }],
    collections: [
      {
        nodeType: "folder",
        id: "f-target",
        name: "Target",
        children: [],
      },
    ],
    activeRequestId: null,
  };
}

function importedWorkspace(): AppState {
  return {
    version: 1,
    environments: [{ id: "e-imp", name: "Imported", variables: [{ key: "k", value: "v", enabled: true }] }],
    collections: [
      {
        nodeType: "folder",
        id: "f-imp-root",
        name: "API",
        children: [
          {
            nodeType: "request",
            id: "r-imp",
            name: "GET x",
            environmentId: "e-imp",
            method: "GET",
            url: "https://example.com",
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
    activeRequestId: "r-imp",
  };
}

describe("importWorkspace", () => {
  it("remapImportedWorkspaceIds issues new ids for envs, folders, requests", () => {
    const src = importedWorkspace();
    const out = remapImportedWorkspaceIds(src);
    expect(out.environments).toHaveLength(1);
    expect(out.environments[0].id).not.toBe("e-imp");
    expect(out.collections[0].nodeType).toBe("folder");
    if (out.collections[0].nodeType === "folder") {
      expect(out.collections[0].id).not.toBe("f-imp-root");
      const req = out.collections[0].children[0];
      expect(req.nodeType).toBe("request");
      if (req.nodeType === "request") {
        expect(req.id).not.toBe("r-imp");
        expect(req.environmentId).toBe(out.environments[0].id);
      }
    }
  });

  it("mergeImportedUnderFolder adds roots under target and merges envs", () => {
    const base = minimalState();
    const merged = mergeImportedUnderFolder(base, "f-target", importedWorkspace());
    expect(merged).not.toBeNull();
    if (!merged) return;
    expect(merged.environments).toHaveLength(2);
    const target = merged.collections[0];
    expect(target.nodeType).toBe("folder");
    if (target.nodeType !== "folder") return;
    expect(target.children).toHaveLength(1);
    const added = target.children[0];
    expect(added.nodeType).toBe("folder");
    if (added.nodeType === "folder") {
      expect(added.name).toBe("API");
      expect(added.children).toHaveLength(1);
    }
  });

  it("mergeImportedUnderFolder returns null for missing folder", () => {
    expect(
      mergeImportedUnderFolder(minimalState(), "nope", importedWorkspace())
    ).toBeNull();
  });
});
