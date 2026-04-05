import { describe, expect, it } from "vitest";
import { runCompletionScript } from "./scriptRunner";

describe("runCompletionScript", () => {
  it("runs script and captures console", () => {
    const r = runCompletionScript(
      "pm.console.log('ok', pm.response.status());",
      {
        status: 200,
        statusText: "OK",
        headers: [],
        body: "{}",
        durationMs: 1,
      }
    );
    expect(r.error).toBeUndefined();
    expect(r.logs.join(" ")).toContain("ok 200");
  });

  it("returns error for bad script", () => {
    const r = runCompletionScript("throw new Error('x');", {
      status: 200,
      statusText: "OK",
      headers: [],
      body: "",
      durationMs: 1,
    });
    expect(r.error).toBeDefined();
  });
});
