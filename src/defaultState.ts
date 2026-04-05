import type { AppState } from "./types";

export function createDefaultState(): AppState {
  const rid = crypto.randomUUID();
  const fid = crypto.randomUUID();
  const eid = crypto.randomUUID();
  return {
    version: 1,
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
        name: "My folder",
        children: [
          {
            nodeType: "request",
            id: rid,
            name: "Example GET",
            environmentId: eid,
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
