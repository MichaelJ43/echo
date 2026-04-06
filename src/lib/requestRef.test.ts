import { describe, expect, it } from "vitest";
import type { CollectionNode, HttpResponsePayload } from "../types";
import {
  expandRequestReferences,
  findRequestByPath,
  getValueAtJsonPath,
} from "./requestRef";

const tree: CollectionNode[] = [
  {
    nodeType: "folder",
    id: "f1",
    name: "folder1",
    children: [
      {
        nodeType: "folder",
        id: "f2",
        name: "folder2",
        children: [
          {
            nodeType: "request",
            id: "r1",
            name: "get_request",
            environmentId: "e1",
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
    ],
  },
];

describe("requestRef", () => {
  it("finds request by folder path", () => {
    const r = findRequestByPath(tree, "folder1/folder2/get_request");
    expect(r?.id).toBe("r1");
  });

  it("getValueAtJsonPath reads nested keys", () => {
    const data = { auth: { bearer: "tok" } };
    expect(getValueAtJsonPath(data, "auth.bearer")).toBe("tok");
  });

  it("expandRequestReferences inlines JSON path from cache", () => {
    const cache: Record<string, HttpResponsePayload | undefined> = {
      r1: {
        status: 200,
        statusText: "OK",
        headers: [],
        body: JSON.stringify({ auth: { bearer: "abc123" } }),
        durationMs: 1,
      },
    };
    const { text, errors } = expandRequestReferences(
      'Bearer {{request:folder1/folder2/get_request:auth.bearer}}',
      tree,
      cache
    );
    expect(errors).toHaveLength(0);
    expect(text).toBe("Bearer abc123");
  });
});
