import { describe, expect, it } from "vitest";
import type { CollectionNode } from "../types";
import {
  addChildToFolder,
  allRequestIds,
  appendRootFolder,
  createFolderNode,
  createRequestItem,
  extractNode,
  findAncestorFolderIdsForRequest,
  findRequest,
  firstRequestId,
  insertChildAt,
  isDescendantOfFolder,
  mapCollection,
  moveNode,
  removeNodeById,
  renameFolderById,
  requestToNode,
} from "./collection";

const sample: CollectionNode[] = [
  {
    nodeType: "folder",
    id: "f1",
    name: "Root",
    children: [
      {
        nodeType: "request",
        id: "r1",
        name: "A",
        environmentId: "e0",
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
];

describe("collection helpers", () => {
  it("finds request by id", () => {
    const r = findRequest(sample, "r1");
    expect(r?.name).toBe("A");
  });

  it("maps a request", () => {
    const next = mapCollection(sample, "r1", (x) => ({ ...x, name: "B" }));
    expect(findRequest(next, "r1")?.name).toBe("B");
  });

  it("renames a folder by id", () => {
    const next = renameFolderById(sample, "f1", "Renamed");
    expect(next[0]?.nodeType).toBe("folder");
    if (next[0]?.nodeType === "folder") {
      expect(next[0].name).toBe("Renamed");
    }
  });

  it("returns first request id", () => {
    expect(firstRequestId(sample)).toBe("r1");
  });

  it("collects all request ids", () => {
    expect(allRequestIds(sample)).toEqual(new Set(["r1"]));
    expect(allRequestIds([])).toEqual(new Set());
  });

  it("adds a child folder inside a folder", () => {
    const child = createFolderNode("Nested");
    const next = addChildToFolder(sample, "f1", child);
    const folder = next[0];
    expect(folder?.nodeType).toBe("folder");
    if (folder?.nodeType === "folder") {
      expect(folder.children.some((c) => c.id === child.id)).toBe(true);
    }
  });

  it("appends a root folder", () => {
    const f = createFolderNode("Another");
    const next = appendRootFolder(sample, f);
    expect(next).toHaveLength(2);
    expect(next[1]?.id).toBe(f.id);
  });

  it("removes a request by id", () => {
    const next = removeNodeById(sample, "r1");
    expect(findRequest(next, "r1")).toBeNull();
    expect(firstRequestId(next)).toBeNull();
  });

  it("removes a folder and its subtree", () => {
    const next = removeNodeById(sample, "f1");
    expect(next).toHaveLength(0);
  });

  it("creates request node union", () => {
    const r = createRequestItem("X", "env1");
    const n = requestToNode(r);
    expect(n.nodeType).toBe("request");
    if (n.nodeType === "request") expect(n.name).toBe("X");
  });

  it("finds ancestor folder ids for a request", () => {
    expect(findAncestorFolderIdsForRequest(sample, "r1")).toEqual(["f1"]);
  });

  it("detects folder descendants", () => {
    const nested: CollectionNode[] = [
      {
        nodeType: "folder",
        id: "a",
        name: "A",
        children: [
          {
            nodeType: "folder",
            id: "b",
            name: "B",
            children: [],
          },
        ],
      },
    ];
    expect(isDescendantOfFolder(nested, "a", "b")).toBe(true);
    expect(isDescendantOfFolder(nested, "b", "a")).toBe(false);
  });

  it("moves a request within the same parent", () => {
    const two: CollectionNode[] = [
      {
        nodeType: "folder",
        id: "f1",
        name: "Root",
        children: [
          {
            nodeType: "request",
            id: "r1",
            name: "A",
            environmentId: "e0",
            method: "GET",
            url: "",
            headers: [],
            queryParams: [],
            body: "",
            bodyType: "none",
            auth: { type: "none" },
            script: "",
          },
          {
            nodeType: "request",
            id: "r2",
            name: "B",
            environmentId: "e0",
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
      },
    ];
    const moved = moveNode(two, "r2", { parentId: "f1", index: 0 });
    expect(moved).not.toBeNull();
    if (!moved?.[0] || moved[0].nodeType !== "folder") throw new Error("expected folder");
    expect(moved[0].children.map((c) => c.id)).toEqual(["r2", "r1"]);
  });

  it("extract and insert round-trip", () => {
    const ex = extractNode(sample, "r1");
    expect(ex.node?.nodeType).toBe("request");
    const back = insertChildAt(ex.nodes, "f1", 0, ex.node!);
    expect(findRequest(back, "r1")?.name).toBe("A");
  });
});
