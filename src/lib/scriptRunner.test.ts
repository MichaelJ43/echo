import { describe, expect, it, vi } from "vitest";
import { runCompletionScript } from "./scriptRunner";

describe("runCompletionScript", () => {
  it("runs script and captures console", async () => {
    const r = await runCompletionScript(
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

  it("returns error for bad script", async () => {
    const r = await runCompletionScript("throw new Error('x');", {
      status: 200,
      statusText: "OK",
      headers: [],
      body: "",
      durationMs: 1,
    });
    expect(r.error).toBeDefined();
  });

  it("calls pm.environment.set via context", async () => {
    const set = vi.fn();
    await runCompletionScript('pm.environment.set("k", "v");', {
      status: 200,
      statusText: "OK",
      headers: [],
      body: "{}",
      durationMs: 1,
    }, {
      setEnvironmentVariable: set,
      sendRequest: async () => {},
    });
    expect(set).toHaveBeenCalledWith("k", "v");
  });
});
