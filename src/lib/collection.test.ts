import { describe, expect, it } from "vitest";
import type { CollectionNode } from "../types";
import {
  addChildToFolder,
  appendRootFolder,
  createFolderNode,
  createRequestItem,
  findRequest,
  firstRequestId,
  mapCollection,
  removeNodeById,
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

  it("returns first request id", () => {
    expect(firstRequestId(sample)).toBe("r1");
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
    const r = createRequestItem("X");
    const n = requestToNode(r);
    expect(n.nodeType).toBe("request");
    if (n.nodeType === "request") expect(n.name).toBe("X");
  });
});
