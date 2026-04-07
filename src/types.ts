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
  bodyType: "none" | "json" | "raw" | "form";
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
