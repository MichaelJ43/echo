import { describe, expect, it } from "vitest";
import type { AppState } from "../types";
import {
  collectEnvironmentIdsFromTree,
  findFolderNodeById,
  sanitizeExportFilenameBase,
  sliceWorkspaceForFolderExport,
  sliceWorkspaceForRequestExport,
} from "./workspaceSlice";

const baseState = (): AppState => ({
  version: 1,
  environments: [
    { id: "e1", name: "Dev", variables: [] },
    { id: "e2", name: "Prod", variables: [] },
  ],
  collections: [
    {
      nodeType: "folder",
      id: "root",
      name: "Root",
      children: [
        {
          nodeType: "folder",
          id: "sub",
          name: "API",
          children: [
            {
              nodeType: "request",
              id: "r1",
              name: "Ping",
              environmentId: "e2",
              method: "GET",
              url: "https://x",
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
    },
  ],
  activeRequestId: "r1",
});

describe("workspaceSlice", () => {
  it("findFolderNodeById returns nested folder", () => {
    const f = findFolderNodeById(baseState().collections, "sub");
    expect(f?.nodeType).toBe("folder");
    expect(f?.id).toBe("sub");
  });

  it("sliceWorkspaceForFolderExport keeps subtree and only referenced environments", () => {
    const sliced = sliceWorkspaceForFolderExport(baseState(), "sub");
    expect(sliced).not.toBeNull();
    expect(sliced!.collections).toHaveLength(1);
    expect(sliced!.collections[0].id).toBe("sub");
    expect(sliced!.environments.map((e) => e.id)).toEqual(["e2"]);
    expect(sliced!.activeRequestId).toBe("r1");
  });

  it("sliceWorkspaceForRequestExport includes single request and its environment", () => {
    const sliced = sliceWorkspaceForRequestExport(baseState(), "r1");
    expect(sliced).not.toBeNull();
    expect(sliced!.collections[0].nodeType).toBe("request");
    expect(sliced!.environments).toHaveLength(1);
    expect(sliced!.environments[0].id).toBe("e2");
  });

  it("collectEnvironmentIdsFromTree gathers request env ids", () => {
    const ids = collectEnvironmentIdsFromTree(baseState().collections);
    expect([...ids].sort()).toEqual(["e2"]);
  });

  it("sanitizeExportFilenameBase strips illegal characters", () => {
    expect(sanitizeExportFilenameBase('foo/bar')).toBe("foo_bar");
    expect(sanitizeExportFilenameBase("   ")).toBe("echo-export");
  });
});
