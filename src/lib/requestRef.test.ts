import { describe, expect, it } from "vitest";
import type { CollectionNode, HttpResponsePayload } from "../types";
import {
  expandRequestReferences,
  findRequestByPath,
  getValueAtJsonPath,
  parseStructuredBody,
  splitRequestRefInner,
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

  it("expandRequestReferences inserts full body when no value path", () => {
    const cache: Record<string, HttpResponsePayload | undefined> = {
      r1: {
        status: 200,
        statusText: "OK",
        headers: [],
        body: "plain text body",
        durationMs: 1,
      },
    };
    const { text, errors } = expandRequestReferences(
      "X={{request:folder1/folder2/get_request}}",
      tree,
      cache
    );
    expect(errors).toHaveLength(0);
    expect(text).toBe("X=plain text body");
  });

  it("expandRequestReferences parses YAML for dot path", () => {
    const cache: Record<string, HttpResponsePayload | undefined> = {
      r1: {
        status: 200,
        statusText: "OK",
        headers: [],
        body: "auth:\n  token: yaml-token\n",
        durationMs: 1,
      },
    };
    const { text, errors } = expandRequestReferences(
      "{{request:folder1/folder2/get_request:auth.token}}",
      tree,
      cache
    );
    expect(errors).toHaveLength(0);
    expect(text).toBe("yaml-token");
  });

  it("parseStructuredBody reads YAML mapping", () => {
    const v = parseStructuredBody("a: 1\nb: two\n");
    expect(v).toEqual({ a: 1, b: "two" });
  });

  it("splitRequestRefInner treats last colon as value path", () => {
    expect(splitRequestRefInner("a/b/c")).toEqual({
      pathPart: "a/b/c",
      valuePath: null,
    });
    expect(splitRequestRefInner("a/b/c:auth.key")).toEqual({
      pathPart: "a/b/c",
      valuePath: "auth.key",
    });
  });
});
