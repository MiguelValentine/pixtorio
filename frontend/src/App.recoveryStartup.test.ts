import appSource from "./App.tsx?raw";
import ts from "typescript";
import {describe, expect, it, vi} from "vitest";

// Execute the actual startup effect without adding a DOM runtime to this suite.
const source = ts.createSourceFile("App.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effectSource = "";
function findRecoveryEffect(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect"
    && node.arguments[0]?.getText(source).includes("await LoadRecovery()")) {
    effectSource = node.arguments[0].getText(source);
  }
  ts.forEachChild(node, findRecoveryEffect);
}
findRecoveryEffect(source);

function harness() {
  const dependencies = {
    hasWailsAppBridge: vi.fn(() => true),
    recoveryStartedRef: {current: false},
    LoadRecovery: vi.fn(async () => "snapshot"),
    preferences: {files: {autosaveEnabled: true, recentItems: 10}},
    window: {confirm: vi.fn(() => false)},
    labels: {en: {restoreRecovery: "Restore?"}},
    initialLanguageRef: {current: "en"},
    restoreRecoveryTabs: vi.fn(),
    ClearRecovery: vi.fn(async () => undefined),
    OpenStartupProject: vi.fn(async () => ""),
    setStatus: vi.fn(),
    setRecoveryReady: vi.fn(),
  };
  const javascript = ts.transpile(`(${effectSource})`, {target: ts.ScriptTarget.ES2022});
  const run = new Function(...Object.keys(dependencies), `return ${javascript}`)(...Object.values(dependencies)) as () => void;
  return {run, ...dependencies};
}

describe("startup recovery effect", () => {
  it("checks recovery only once across effect replays and tool/status updates", async () => {
    expect(effectSource).not.toBe("");
    const state = harness();
    state.run();
    state.run();
    expect(state.LoadRecovery).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(state.setRecoveryReady).toHaveBeenCalledWith(true));
    state.run();
    expect(state.LoadRecovery).toHaveBeenCalledTimes(1);
    expect(state.window.confirm).toHaveBeenCalledTimes(1);
    expect(state.ClearRecovery).toHaveBeenCalledTimes(1);
    expect(state.OpenStartupProject).toHaveBeenCalledTimes(1);
  });

  it("does not mark a browser-only render as having checked desktop recovery", () => {
    const state = harness();
    state.hasWailsAppBridge.mockReturnValue(false);
    state.run();
    expect(state.recoveryStartedRef.current).toBe(false);
    expect(state.LoadRecovery).not.toHaveBeenCalled();
  });

  it("skips recovery data when recovery is disabled but still checks the startup project", async () => {
    const state = harness();
    state.preferences.files.autosaveEnabled = false;
    state.run();
    await vi.waitFor(() => expect(state.setRecoveryReady).toHaveBeenCalledWith(true));
    expect(state.LoadRecovery).not.toHaveBeenCalled();
    expect(state.window.confirm).not.toHaveBeenCalled();
    expect(state.OpenStartupProject).toHaveBeenCalledTimes(1);
  });

  it("reports startup errors without retrying on later status changes", async () => {
    const state = harness();
    state.LoadRecovery.mockRejectedValue(new Error("Recovery read failed"));
    state.run();
    await vi.waitFor(() => expect(state.setRecoveryReady).toHaveBeenCalledWith(true));
    state.run();
    expect(state.setStatus).toHaveBeenCalledWith("Recovery read failed");
    expect(state.LoadRecovery).toHaveBeenCalledTimes(1);
    expect(state.window.confirm).not.toHaveBeenCalled();
  });
});
