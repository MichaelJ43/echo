import { describe, expect, it } from "vitest";
import { buildExpandedSendPayload } from "./expandForSend";
import type { CollectionNode, Environment } from "../types";

const emptyCollections: CollectionNode[] = [];

const TEST_ENV_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function envWith(vars: { key: string; value: string }[]): Environment {
  return {
    id: TEST_ENV_ID,
    name: "Default",
    variables: vars.map((v) => ({
      key: v.key,
      value: v.value,
      enabled: true,
      entryKind: "variable" as const,
    })),
  };
}

describe("buildExpandedSendPayload", () => {
  it("clears string body for multipart and expands multipart parts", () => {
    const env = envWith([{ key: "x", value: "hello" }]);
    const req = {
      id: "r1",
      name: "t",
      environmentId: TEST_ENV_ID,
      method: "POST",
      url: "https://example.com",
      headers: [],
      queryParams: [],
      body: "legacy",
      bodyType: "multipart" as const,
      multipartParts: [
        {
          enabled: true,
          key: "k{{x}}",
          partKind: "text" as const,
          text: "v{{x}}",
        },
      ],
      auth: { type: "none" as const },
      script: "",
    };
    const { payload } = buildExpandedSendPayload(
      req,
      env,
      emptyCollections,
      {}
    );
    expect(payload.body).toBe("");
    expect(payload.bodyType).toBe("multipart");
    expect(payload.multipartParts?.[0]?.key).toBe("khello");
    expect(payload.multipartParts?.[0]?.text).toBe("vhello");
    expect(payload.environmentId).toBe(TEST_ENV_ID);
  });

  it("expands binary body path and content type", () => {
    const env = envWith([{ key: "p", value: "/tmp/a.bin" }]);
    const req = {
      id: "r1",
      name: "t",
      environmentId: TEST_ENV_ID,
      method: "POST",
      url: "https://example.com",
      headers: [],
      queryParams: [],
      body: "",
      bodyType: "binary" as const,
      binaryBody: {
        path: "{{p}}",
        contentType: "application/octet-stream",
      },
      auth: { type: "none" as const },
      script: "",
    };
    const { payload } = buildExpandedSendPayload(
      req,
      env,
      emptyCollections,
      {}
    );
    expect(payload.binaryBody?.path).toBe("/tmp/a.bin");
    expect(payload.binaryBody?.contentType).toBe("application/octet-stream");
  });

  it("normalizes empty binary content type to empty string in payload", () => {
    const env = envWith([]);
    const req = {
      id: "r1",
      name: "t",
      environmentId: TEST_ENV_ID,
      method: "POST",
      url: "https://example.com",
      headers: [],
      queryParams: [],
      body: "",
      bodyType: "binary" as const,
      binaryBody: { path: "/x", contentType: "" },
      auth: { type: "none" as const },
      script: "",
    };
    const { payload } = buildExpandedSendPayload(
      req,
      env,
      emptyCollections,
      {}
    );
    expect(payload.binaryBody?.contentType).toBe("");
  });
});
