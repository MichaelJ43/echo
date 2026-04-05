import { describe, expect, it } from "vitest";
import type { CollectionNode } from "../types";
import { findRequest, firstRequestId, mapCollection } from "./collection";

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
});
