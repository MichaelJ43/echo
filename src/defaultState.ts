import type { AppState } from "./types";

export function createDefaultState(): AppState {
  const rid = crypto.randomUUID();
  const fid = crypto.randomUUID();
  const eid = crypto.randomUUID();
  return {
    version: 1,
    activeEnvironmentId: eid,
    environments: [
      {
        id: eid,
        name: "Default",
        variables: [],
      },
    ],
    collections: [
      {
        nodeType: "folder",
        id: fid,
        name: "My collection",
        children: [
          {
            nodeType: "request",
            id: rid,
            name: "Example GET",
            method: "GET",
            url: "https://httpbin.org/get",
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
    activeRequestId: rid,
  };
}
