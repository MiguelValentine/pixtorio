import {describe, expect, it} from "vitest";
import {deleteWorkspaceLayout, readWorkspaceLayouts, saveWorkspaceLayout, type WorkspaceLayout} from "./workspaceLayouts";

function createStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, nextValue: string) => { value = nextValue; },
  };
}

describe("workspace layouts", () => {
  it("round-trips a layout and trims its name", () => {
    const storage = createStorage();
    const layout: WorkspaceLayout = {name: "  Illustration  ", inspectorWidth: 240, timelineHeight: 300};

    expect(saveWorkspaceLayout(storage, layout)).toEqual([
      {name: "Illustration", inspectorWidth: 240, timelineHeight: 300},
    ]);
    expect(readWorkspaceLayouts(storage)).toEqual([
      {name: "Illustration", inspectorWidth: 240, timelineHeight: 300},
    ]);
  });

  it("replaces a matching layout while preserving other presets", () => {
    const storage = createStorage();
    saveWorkspaceLayout(storage, {name: "Paint", inspectorWidth: 220, timelineHeight: 250});
    saveWorkspaceLayout(storage, {name: "Animate", inspectorWidth: 300, timelineHeight: 400});

    expect(saveWorkspaceLayout(storage, {name: " Paint ", inspectorWidth: 260, timelineHeight: 350})).toEqual([
      {name: "Paint", inspectorWidth: 260, timelineHeight: 350},
      {name: "Animate", inspectorWidth: 300, timelineHeight: 400},
    ]);
  });

  it("deletes a layout by its trimmed name", () => {
    const storage = createStorage();
    saveWorkspaceLayout(storage, {name: "Paint", inspectorWidth: 220, timelineHeight: 250});
    saveWorkspaceLayout(storage, {name: "Animate", inspectorWidth: 300, timelineHeight: 400});

    expect(deleteWorkspaceLayout(storage, "  Paint ")).toEqual([
      {name: "Animate", inspectorWidth: 300, timelineHeight: 400},
    ]);
    expect(readWorkspaceLayouts(storage)).toEqual([
      {name: "Animate", inspectorWidth: 300, timelineHeight: 400},
    ]);
  });

  it("returns no layouts for corrupt data and filters invalid entries", () => {
    const corruptStorage = createStorage("not json");
    expect(readWorkspaceLayouts(corruptStorage)).toEqual([]);

    const mixedStorage = createStorage(JSON.stringify([
      {name: "Valid", inspectorWidth: 190, timelineHeight: 520},
      {name: " ", inspectorWidth: 220, timelineHeight: 250},
      {name: "Too wide", inspectorWidth: 421, timelineHeight: 250},
      {name: "Bad timeline", inspectorWidth: 220, timelineHeight: 149},
      {name: "Trimmed", inspectorWidth: 240, timelineHeight: 300},
    ]));
    expect(readWorkspaceLayouts(mixedStorage)).toEqual([
      {name: "Valid", inspectorWidth: 190, timelineHeight: 520},
      {name: "Trimmed", inspectorWidth: 240, timelineHeight: 300},
    ]);
  });

  it.each([
    [{name: "", inspectorWidth: 228, timelineHeight: 254}, "empty name"],
    [{name: " ", inspectorWidth: 228, timelineHeight: 254}, "blank name"],
    [{name: "x".repeat(65), inspectorWidth: 228, timelineHeight: 254}, "long name"],
    [{name: "Layout", inspectorWidth: 189, timelineHeight: 254}, "small inspector"],
    [{name: "Layout", inspectorWidth: 421, timelineHeight: 254}, "large inspector"],
    [{name: "Layout", inspectorWidth: 228.5, timelineHeight: 254}, "fractional inspector"],
    [{name: "Layout", inspectorWidth: Number.NaN, timelineHeight: 254}, "non-finite inspector"],
    [{name: "Layout", inspectorWidth: 228, timelineHeight: 149}, "small timeline"],
    [{name: "Layout", inspectorWidth: 228, timelineHeight: 521}, "large timeline"],
    [{name: "Layout", inspectorWidth: 228, timelineHeight: 254.5}, "fractional timeline"],
    [{name: "Layout", inspectorWidth: 228, timelineHeight: Number.POSITIVE_INFINITY}, "non-finite timeline"],
  ] as const)("rejects %s", (layout, _label) => {
    expect(() => saveWorkspaceLayout(createStorage(), layout)).toThrow("Invalid workspace layout");
  });

  it("propagates storage write errors", () => {
    const error = new Error("storage full");
    const storage = {
      getItem: () => null,
      setItem: () => { throw error; },
    };

    expect(() => saveWorkspaceLayout(storage, {name: "Layout", inspectorWidth: 228, timelineHeight: 254})).toThrow(error);
    expect(() => deleteWorkspaceLayout(storage, "Layout")).toThrow(error);
  });
});
