import { mapEveryRequest } from "./collection";
import type { AppState } from "../types";

/** Remove browser-only / session fields before writing workspace JSON. */
export function stripEphemeralWorkspaceFields(state: AppState): AppState {
  return {
    ...state,
    collections: mapEveryRequest(state.collections, (r) => {
      const next = { ...r };
      if (next.multipartParts?.length) {
        next.multipartParts = next.multipartParts.map((p) => {
          const { fileDataBase64: _, ...rest } = p;
          return rest;
        });
      }
      if (next.binaryBody) {
        next.binaryBody = {
          path: next.binaryBody.path,
          contentType: next.binaryBody.contentType,
        };
      }
      return next;
    }),
  };
}
