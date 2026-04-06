export function getContentTypeFromHeaders(
  headers: [string, string][]
): string | null {
  const row = headers.find(([k]) => k.toLowerCase() === "content-type");
  if (!row) return null;
  return row[1].split(";")[0].trim();
}

export type StructuredFormatKind = "json" | "yaml" | "csv" | "text";

export type FormattedBody = {
  kind: StructuredFormatKind;
  text: string;
};

function tryPrettyJson(body: string): FormattedBody | null {
  const t = body.trim();
  if (!t) return null;
  if (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  ) {
    try {
      const parsed: unknown = JSON.parse(body);
      return {
        kind: "json",
        text: JSON.stringify(parsed, null, 2),
      };
    } catch {
      return null;
    }
  }
  return null;
}

/** Heuristic YAML-ish pretty: normalize newlines; no full YAML parser (keeps bundle small). */
function formatYamlLoose(body: string): string {
  return body
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n");
}

function prettyCsv(body: string): string {
  return body
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n");
}

/**
 * Pretty-print structured responses using Content-Type and light heuristics.
 * JSON is fully formatted; CSV/YAML get normalized newlines without a YAML parser.
 */
export function formatResponseBody(
  body: string,
  contentType: string | null | undefined
): FormattedBody {
  const ct = (contentType || "").toLowerCase();

  if (ct.includes("json")) {
    const j = tryPrettyJson(body);
    if (j) return j;
  }
  if (ct.includes("yaml") || ct.includes("x-yaml")) {
    return { kind: "yaml", text: formatYamlLoose(body) };
  }
  if (ct.includes("csv") || ct.includes("tab-separated-values")) {
    return { kind: "csv", text: prettyCsv(body) };
  }

  const jsonGuess = tryPrettyJson(body);
  if (jsonGuess) return jsonGuess;

  const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const yamlGuess =
    lines.length >= 1 &&
    lines.some((l) => /^[a-zA-Z_][\w-]*:\s*\S/.test(l.trim()));
  if (yamlGuess) {
    return { kind: "yaml", text: formatYamlLoose(body) };
  }

  return { kind: "text", text: body };
}

/** Whether the body is likely an HTML document worth previewing in a sandboxed iframe. */
export function isLikelyHtmlDocument(
  body: string,
  contentType: string | null | undefined
): boolean {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("text/html")) return true;
  const head = body.trim().slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}
