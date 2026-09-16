import {describe, expect, it} from "vitest";
import {deleteBrushPreset, readBrushPresets, saveBrushPreset, type BrushPresetSettings} from "./brushPresets";
import type {BitmapBrush, PatternBrush} from "./tools";

function createStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, nextValue: string) => { value = nextValue; },
    value: () => value,
  };
}

function createSettings(): BrushPresetSettings {
  const bitmap: BitmapBrush = {
    width: 2,
    height: 2,
    mask: new Uint8Array([1, 0, 0, 1]),
    anchorX: 1,
    anchorY: 0,
  };
  const pattern: PatternBrush = {
    width: 2,
    height: 1,
    pixels: new Uint8ClampedArray([10, 20, 30, 0, 200, 150, 100, 37]),
    sourceX: -4096,
    sourceY: 4096,
  };
  return {
    size: 17,
    shape: "diamond",
    bitmap,
    pattern,
    alignment: "destination",
    origin: {x: -17, y: 23},
    spacing: 7,
    angle: 359,
    pixelPerfect: true,
    pressure: true,
    inkMode: "alpha-composite",
    stabilizer: 32,
    dynamics: {
      enabled: true,
      options: {
        size: {enabled: true, source: "velocity", min: 3, max: 17, threshold: 0.99, invert: false, curve: "ease-in"},
        opacity: {enabled: true, source: "pressure", min: 0.25, max: 0.9, threshold: 0.1, invert: true, curve: "ease-out"},
        angle: {enabled: true, source: "velocity", min: -180, max: 180, threshold: 0, invert: false, curve: "smoothstep"},
        gradient: {enabled: true, source: "pressure", min: 0.1, max: 1, threshold: 0.2, invert: false, curve: "linear"},
      },
    },
  };
}

describe("brush preset storage", () => {
  it("round-trips typed brush buffers and full settings", () => {
    const storage = createStorage();
    const settings = createSettings();

    expect(saveBrushPreset(storage, "  Pixel Brush  ", settings)).toEqual([
      {name: "Pixel Brush", settings},
    ]);
    const loaded = readBrushPresets(storage);

    expect(loaded).toEqual([{name: "Pixel Brush", settings}]);
    expect(loaded[0].settings.bitmap?.mask).toBeInstanceOf(Uint8Array);
    expect(Array.from(loaded[0].settings.bitmap?.mask ?? [])).toEqual([1, 0, 0, 1]);
    expect(loaded[0].settings.pattern?.pixels).toBeInstanceOf(Uint8ClampedArray);
    expect(Array.from(loaded[0].settings.pattern?.pixels ?? [])).toEqual([10, 20, 30, 0, 200, 150, 100, 37]);
  });

  it("overwrites a trimmed matching name while preserving other presets", () => {
    const storage = createStorage();
    saveBrushPreset(storage, "Paint", createSettings());
    saveBrushPreset(storage, "Animate", {...createSettings(), shape: "circle"});

    expect(saveBrushPreset(storage, " Paint ", {...createSettings(), size: 4})).toEqual([
      {name: "Paint", settings: {...createSettings(), size: 4}},
      {name: "Animate", settings: {...createSettings(), shape: "circle"}},
    ]);
  });

  it("deletes a preset by its trimmed name", () => {
    const storage = createStorage();
    saveBrushPreset(storage, "Paint", createSettings());
    saveBrushPreset(storage, "Animate", {...createSettings(), shape: "circle"});

    expect(deleteBrushPreset(storage, "  Paint ")).toEqual([
      {name: "Animate", settings: {...createSettings(), shape: "circle"}},
    ]);
    expect(readBrushPresets(storage)).toEqual([
      {name: "Animate", settings: {...createSettings(), shape: "circle"}},
    ]);
  });

  it("keeps saved and returned nested buffers isolated from later edits", () => {
    const storage = createStorage();
    const settings = createSettings();
    const returned = saveBrushPreset(storage, "Brush", settings);
    settings.bitmap?.mask.fill(0);
    settings.pattern?.pixels.fill(0);
    settings.origin.x = 4096;
    returned[0].settings.bitmap?.mask.fill(0);
    returned[0].settings.pattern?.pixels.fill(0);
    returned[0].settings.origin.x = -4096;

    const loaded = readBrushPresets(storage)[0].settings;
    expect(Array.from(loaded.bitmap?.mask ?? [])).toEqual([1, 0, 0, 1]);
    expect(Array.from(loaded.pattern?.pixels ?? [])).toEqual([10, 20, 30, 0, 200, 150, 100, 37]);
    expect(loaded.origin).toEqual({x: -17, y: 23});
  });

  it.each([
    null,
    "not json",
    JSON.stringify({version: 0, presets: []}),
    JSON.stringify({version: 1, presets: []}),
    JSON.stringify({version: 2, presets: {}}),
    JSON.stringify({version: 2, presets: [{name: "Broken", settings: {}}]}),
    JSON.stringify({version: 2, presets: [{name: "Broken", settings: {...createSettings(), size: 65}}]}),
    JSON.stringify({version: 2, presets: [{name: "Broken", settings: {...createSettings(), spacing: 0}}]}),
    JSON.stringify({version: 2, presets: [{name: "Broken", settings: {...createSettings(), stabilizer: 33}}]}),
    JSON.stringify({version: 2, presets: [{name: "Broken", settings: {...createSettings(), dynamics: {...createSettings().dynamics, options: {...createSettings().dynamics.options, size: {...createSettings().dynamics.options.size, threshold: 1}}}}}]}),
    JSON.stringify({version: 2, presets: [{name: "Broken", settings: {...createSettings(), bitmap: {...createSettings().bitmap, mask: [1, 0]}}}]}),
    JSON.stringify({version: 2, presets: [{name: "Broken", settings: {...createSettings(), pattern: {...createSettings().pattern, pixels: [1, 2, 3]}}}]}),
    JSON.stringify({version: 2, presets: [{name: "Broken", settings: createSettings()}, {name: "Broken", settings: createSettings()}]}),
  ])("returns empty for malformed stored payload: %s", (payload) => {
    expect(readBrushPresets(createStorage(payload))).toEqual([]);
  });

  it.each([
    ["", "empty name"],
    [" ", "blank name"],
  ] as const)("rejects invalid preset names: %s", (name, _description) => {
    expect(() => saveBrushPreset(createStorage(), name, createSettings())).toThrow("Invalid brush preset");
  });

  it("rejects invalid settings rather than repairing them", () => {
    const settings = createSettings();
    expect(() => saveBrushPreset(createStorage(), "Broken", {...settings, size: 0})).toThrow("Invalid brush preset");
    expect(() => saveBrushPreset(createStorage(), "Broken", {...settings, bitmap: {...settings.bitmap!, anchorX: 2}})).toThrow("Invalid brush preset");
    expect(() => saveBrushPreset(createStorage(), "Broken", {...settings, pattern: {...settings.pattern!, sourceY: 4097}})).toThrow("Invalid brush preset");
    expect(() => saveBrushPreset(createStorage(), "Broken", {...settings, dynamics: {...settings.dynamics, options: {...settings.dynamics.options, opacity: {...settings.dynamics.options.opacity, curve: "bad" as "linear"}}}})).toThrow("Invalid brush preset");
    expect(() => saveBrushPreset(createStorage(), "Broken", {...settings, dynamics: {...settings.dynamics, options: {...settings.dynamics.options, gradient: {...settings.dynamics.options.gradient, max: 1.1}}}})).toThrow("Invalid brush preset");
  });

  it("propagates storage write errors", () => {
    const error = new Error("storage full");
    const storage = {
      getItem: () => null,
      setItem: () => { throw error; },
    };

    expect(() => saveBrushPreset(storage, "Brush", createSettings())).toThrow(error);
    expect(() => deleteBrushPreset(storage, "Brush")).toThrow(error);
  });
});
