import {describe, expect, it} from "vitest";
import {createDocument} from "./document";
import {applyNewDocumentPreferenceDefaults, defaultPreferences, preferencesStorageKey, readPreferences, resetPreferences, savePreferences} from "./preferences";

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => key === preferencesStorageKey ? value : null,
    setItem: (key: string, next: string) => { if (key === preferencesStorageKey) value = next; },
    removeItem: (key: string) => { if (key === preferencesStorageKey) value = null; },
    current: () => value,
  };
}

describe("application preferences", () => {
  it("defaults to the Chinese light interface", () => {
    expect(defaultPreferences().general).toMatchObject({language: "zh", theme: "light"});
  });

  it("round trips the complete preference model", () => {
    const target = storage();
    const preferences = defaultPreferences();
    preferences.general.theme = "dark";
    preferences.general.language = "en";
    preferences.general.uiScale = 175;
    preferences.general.expandMenusOnHover = true;
    preferences.general.paletteSeparators = false;
    preferences.files.autosaveEnabled = false;
    preferences.files.autosaveSeconds = 600;
    preferences.files.recentItems = 0;
    preferences.color.alphaRange = "byte";
    preferences.color.defaultColorMode = "indexed";
    preferences.color.defaultProfile = "display-p3";
    preferences.alerts = {closeUnsaved: false, deleteLayer: true, deleteFrame: true, deleteCel: true, convertColorMode: false};
    preferences.editor = {wheelZoom: false, zoomFromCenter: true, autoFitOnOpen: true, previewShiftLine: false, discardCustomBrushOnEyedropper: true};
    preferences.selection = {keepAfterDelete: false, showEdges: false, transformScope: "selected-rows-columns"};
    preferences.timeline.autoShow = false;
    preferences.timeline.rewindOnStop = true;
    preferences.timeline.firstFrame = 0;
    preferences.timeline.keepSelection = false;
    preferences.timeline.onionPreviousFrames = 16;
    preferences.timeline.onionNextFrames = 0;
    preferences.timeline.onionOpacity = 100;
    preferences.timeline.onionPreviousColor = "#123456";
    preferences.timeline.onionNextColor = "#abcdef";
    preferences.cursor = {preview: "crosshair", scale: 400, color: "#010203"};
    preferences.background = {defaultFill: "background", checkerSize: 64, checkerLight: "#ffffff", checkerDark: "#000000"};
    preferences.grid = {width: 2048, height: 1, offsetX: -2048, offsetY: 2048, lineColor: "#111111", lineOpacity: 0, showPixelGrid: false, pixelGridColor: "#eeeeee", pixelGridOpacity: 100};
    preferences.guides = {guideColor: "#102030", sliceColor: "#a0b0c0"};
    preferences.undo = {memoryLimitMB: 2048, goToModified: false, allowNonLinear: false, showTooltip: false};
    preferences.drawing = {pixelPerfect: true, pressure: true, brushDynamics: true};
    preferences.editor.zoomFromCenter = true;
    savePreferences(target, preferences);
    expect(readPreferences(target)).toEqual(preferences);
  });

  it("applies document defaults shared by new-document workflows", () => {
    const preferences = defaultPreferences();
    preferences.color.defaultProfile = "display-p3";
    preferences.grid = {...preferences.grid, width: 12, height: 20, offsetX: -3, offsetY: 5};
    preferences.timeline = {
      ...preferences.timeline,
      onionPreviousFrames: 4,
      onionNextFrames: 6,
      onionOpacity: 72,
      onionPreviousColor: "#112233",
      onionNextColor: "#aabbcc",
    };
    const document = createDocument({width: 4, height: 3});

    applyNewDocumentPreferenceDefaults(document, preferences);

    expect(document.colorProfile).toEqual({type: "display-p3", name: "Display P3"});
    expect(document.settings).toMatchObject({
      gridWidth: 12,
      gridHeight: 20,
      gridOffsetX: -3,
      gridOffsetY: 5,
      onionPreviousFrames: 4,
      onionNextFrames: 6,
      onionOpacity: 0.72,
      onionPreviousColor: "#112233ff",
      onionNextColor: "#aabbccff",
    });
  });

  it("returns independent defaults when storage is absent or malformed", () => {
    const first = readPreferences(storage());
    const second = readPreferences(storage("{bad"));
    first.grid.width = 99;
    expect(second.grid.width).toBe(8);
  });

  it("rejects unknown, missing and out-of-range fields without migration", () => {
    const valid = defaultPreferences();
    expect(readPreferences(storage(JSON.stringify({...valid, version: 0})))).toEqual(defaultPreferences());
    expect(readPreferences(storage(JSON.stringify({...valid, extra: true})))).toEqual(defaultPreferences());
    expect(readPreferences(storage(JSON.stringify({...valid, timeline: {...valid.timeline, autoShow: "yes"}})))).toEqual(defaultPreferences());
    expect(readPreferences(storage(JSON.stringify({...valid, files: {...valid.files, autosaveSeconds: 1}})))).toEqual(defaultPreferences());
  });

  it("rejects invalid values on save", () => {
    const target = storage();
    const invalid = defaultPreferences();
    invalid.cursor.color = "white";
    expect(() => savePreferences(target, invalid)).toThrow("Invalid Pixtorio preferences");
    expect(target.current()).toBeNull();
  });

  it("removes saved data when reset", () => {
    const target = storage();
    savePreferences(target, defaultPreferences());
    expect(resetPreferences(target)).toEqual(defaultPreferences());
    expect(target.current()).toBeNull();
  });
});
