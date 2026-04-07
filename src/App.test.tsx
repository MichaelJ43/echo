import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

const MOCK_ENV_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

vi.mock("./api", () => ({
  openContainingFolder: vi.fn(),
  loadState: vi.fn(async () => ({
    version: 1,
    environments: [{ id: MOCK_ENV_ID, name: "Default", variables: [] }],
    collections: [
      {
        nodeType: "folder",
        id: "f1",
        name: "Root",
        children: [
          {
            nodeType: "request",
            id: "r1",
            name: "Test",
            environmentId: MOCK_ENV_ID,
            method: "GET",
            url: "https://example.com",
            headers: [],
            queryParams: [],
            body: "",
            bodyType: "none" as const,
            auth: { type: "none" as const },
            script: "",
          },
        ],
      },
    ],
    activeRequestId: "r1",
  })),
  saveState: vi.fn(),
  sendHttpRequest: vi.fn(),
  getPaths: vi.fn(async () => ({
    appDataDir: "/tmp",
    collectionsFile: "/tmp/collections.json",
  })),
  importWorkspaceFile: vi.fn(),
  exportWorkspaceFile: vi.fn(),
  listSecretLogicalNamesForEnvironment: vi.fn(async () => []),
  listSecretKeys: vi.fn(async () => []),
  resolveSecretPlaceholderRows: vi.fn(async () => []),
  deleteSecret: vi.fn(),
  deleteSecretsForEnvironment: vi.fn(),
  setSecret: vi.fn(),
}));

describe("App", () => {
  it("renders the sidebar and request panel", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    });
    expect(screen.getByTestId("request-panel")).toBeInTheDocument();
    expect(screen.getByTestId("url-input")).toHaveValue("https://example.com");
  });
});
