/** Row in an environment: `{{key}}` substitution (variable, file path) or secret name (keychain; UI only until wired). */
export type EnvironmentEntryKind = "variable" | "file" | "secret";

export type KeyValue = {
  key: string;
  value: string;
  enabled: boolean;
  /** Defaults to `variable`. `secret` rows do not participate in `{{key}}` substitution. */
  entryKind?: EnvironmentEntryKind;
};

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apiKey"; key: string; value: string; addTo: "header" | "query" };

/** Part of a `multipart/form-data` body (desktop: read `filePath` from disk; web: `fileDataBase64`). */
export type MultipartPart = {
  enabled: boolean;
  key: string;
  partKind: "text" | "file";
  text?: string;
  filePath?: string;
  fileName?: string;
  /** Browser-only; stripped before save. */
  fileDataBase64?: string;
};

/** Raw request body from a single file (`bodyType` `binary`). */
export type BinaryBody = {
  path: string;
  /** Empty = `application/octet-stream`. */
  contentType: string;
  /** Browser-only; stripped before save. */
  browserBase64?: string;
};

export type RequestItem = {
  id: string;
  name: string;
  /** Which environment definition this request uses for `{{variables}}`. */
  environmentId: string;
  method: string;
  url: string;
  headers: KeyValue[];
  queryParams: KeyValue[];
  body: string;
  bodyType: "none" | "json" | "raw" | "form" | "multipart" | "binary";
  /** Used when `bodyType` is `multipart`. */
  multipartParts?: MultipartPart[];
  /** Used when `bodyType` is `binary`. */
  binaryBody?: BinaryBody;
  auth: AuthConfig;
  script: string;
};

export type CollectionNode =
  | { nodeType: "folder"; id: string; name: string; children: CollectionNode[] }
  | ({ nodeType: "request" } & RequestItem);

export type Environment = {
  id: string;
  name: string;
  variables: KeyValue[];
};

export type AppState = {
  version: number;
  environments: Environment[];
  collections: CollectionNode[];
  activeRequestId: string | null;
};

export type HttpResponsePayload = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  durationMs: number;
};
