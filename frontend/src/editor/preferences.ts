import type {ColorMode, ColorProfileType} from "./document";

export const preferencesStorageKey = "pixtorio-preferences";
export const preferencesVersion = 1 as const;

export type ThemePreference = "dark" | "light";
export type LanguagePreference = "zh" | "en";
export type CursorPreview = "brush" | "crosshair" | "both";
export type SelectionTransformScope = "selected-cels" | "selected-rows-columns";

export interface AppPreferences {
  version: 1;
  general: {
    theme: ThemePreference;
    language: LanguagePreference;
    uiScale: number;
    expandMenusOnHover: boolean;
    paletteSeparators: boolean;
  };
  files: {
    autosaveEnabled: boolean;
    autosaveSeconds: number;
    recentItems: number;
  };
  color: {
    alphaRange: "percent";
    defaultColorMode: Exclude<ColorMode, "bitmap">;
    defaultProfile: Exclude<ColorProfileType, "embedded">;
  };
  alerts: {
    closeUnsaved: boolean;
    deleteLayer: boolean;
    deleteFrame: boolean;
    deleteCel: boolean;
    convertColorMode: boolean;
  };
  editor: {
    wheelZoom: boolean;
    zoomFromCenter: boolean;
    autoFitOnOpen: boolean;
    previewShiftLine: boolean;
    discardCustomBrushOnEyedropper: boolean;
  };
  selection: {
    keepAfterDelete: boolean;
    showEdges: boolean;
    transformScope: SelectionTransformScope;
  };
  timeline: {
    autoShow: boolean;
    rewindOnStop: boolean;
    firstFrame: number;
    keepSelection: boolean;
    onionPreviousFrames: number;
    onionNextFrames: number;
    onionOpacity: number;
    onionPreviousColor: string;
    onionNextColor: string;
  };
  cursor: {
    preview: CursorPreview;
    scale: number;
    color: string;
  };
  background: {
    defaultFill: "transparent" | "foreground" | "background";
    checkerSize: number;
    checkerLight: string;
    checkerDark: string;
  };
  grid: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    lineColor: string;
    lineOpacity: number;
    showPixelGrid: boolean;
    pixelGridColor: string;
    pixelGridOpacity: number;
  };
  guides: {
    guideColor: string;
    sliceColor: string;
  };
  undo: {
    memoryLimitMB: number;
    goToModified: boolean;
    allowNonLinear: boolean;
    showTooltip: boolean;
  };
  drawing: {
    pixelPerfect: boolean;
    pressure: boolean;
    brushDynamics: boolean;
  };
}

type PreferenceStorageReader = Pick<Storage, "getItem">;
type PreferenceStorageWriter = Pick<Storage, "setItem">;
type PreferenceStorageResetter = Pick<Storage, "removeItem">;

const hexColor = /^#[0-9a-f]{6}$/i;

export function defaultPreferences(): AppPreferences {
  return {
    version: preferencesVersion,
    general: {theme: "light", language: "zh", uiScale: 100, expandMenusOnHover: false, paletteSeparators: true},
    files: {autosaveEnabled: true, autosaveSeconds: 30, recentItems: 10},
    color: {alphaRange: "percent", defaultColorMode: "rgba", defaultProfile: "srgb"},
    alerts: {closeUnsaved: true, deleteLayer: false, deleteFrame: false, deleteCel: false, convertColorMode: true},
    editor: {wheelZoom: true, zoomFromCenter: false, autoFitOnOpen: false, previewShiftLine: true, discardCustomBrushOnEyedropper: false},
    selection: {keepAfterDelete: true, showEdges: true, transformScope: "selected-cels"},
    timeline: {autoShow: true, rewindOnStop: false, firstFrame: 1, keepSelection: true, onionPreviousFrames: 1, onionNextFrames: 1, onionOpacity: 35, onionPreviousColor: "#f25b5b", onionNextColor: "#4ea3ff"},
    cursor: {preview: "brush", scale: 100, color: "#ffffff"},
    background: {defaultFill: "transparent", checkerSize: 8, checkerLight: "#b8bbc1", checkerDark: "#8f9298"},
    grid: {width: 8, height: 8, offsetX: 0, offsetY: 0, lineColor: "#7f8288", lineOpacity: 45, showPixelGrid: true, pixelGridColor: "#7f8288", pixelGridOpacity: 35},
    guides: {guideColor: "#4cc9f0", sliceColor: "#ffd166"},
    undo: {memoryLimitMB: 128, goToModified: true, allowNonLinear: true, showTooltip: true},
    drawing: {pixelPerfect: false, pressure: false, brushDynamics: false},
  };
}

export function readPreferences(storage: PreferenceStorageReader): AppPreferences {
  let raw: string | null;
  try {
    raw = storage.getItem(preferencesStorageKey);
  } catch {
    return defaultPreferences();
  }
  if (raw === null) return defaultPreferences();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPreferences(parsed) ? clonePreferences(parsed) : defaultPreferences();
  } catch {
    return defaultPreferences();
  }
}

export function savePreferences(storage: PreferenceStorageWriter, preferences: AppPreferences): void {
  if (!isPreferences(preferences)) throw new Error("Invalid Pixtorio preferences");
  storage.setItem(preferencesStorageKey, JSON.stringify(preferences));
}

export function resetPreferences(storage: PreferenceStorageResetter): AppPreferences {
  storage.removeItem(preferencesStorageKey);
  return defaultPreferences();
}

function clonePreferences(preferences: AppPreferences): AppPreferences {
  return JSON.parse(JSON.stringify(preferences)) as AppPreferences;
}

function isPreferences(value: unknown): value is AppPreferences {
  if (!recordWithKeys(value, ["version", "general", "files", "color", "alerts", "editor", "selection", "timeline", "cursor", "background", "grid", "guides", "undo", "drawing"])) return false;
  if (value.version !== preferencesVersion) return false;
  if (!recordWithKeys(value.general, ["theme", "language", "uiScale", "expandMenusOnHover", "paletteSeparators"])) return false;
  if (!oneOf(value.general.theme, ["dark", "light"]) || !oneOf(value.general.language, ["zh", "en"]) || !integer(value.general.uiScale, 75, 200) || !booleans(value.general, ["expandMenusOnHover", "paletteSeparators"])) return false;
  if (!recordWithKeys(value.files, ["autosaveEnabled", "autosaveSeconds", "recentItems"]) || !booleans(value.files, ["autosaveEnabled"]) || !integer(value.files.autosaveSeconds, 5, 600) || !integer(value.files.recentItems, 0, 50)) return false;
  if (!recordWithKeys(value.color, ["alphaRange", "defaultColorMode", "defaultProfile"]) || value.color.alphaRange !== "percent" || !oneOf(value.color.defaultColorMode, ["rgba", "grayscale", "indexed"]) || !oneOf(value.color.defaultProfile, ["none", "srgb", "display-p3"])) return false;
  if (!recordWithKeys(value.alerts, ["closeUnsaved", "deleteLayer", "deleteFrame", "deleteCel", "convertColorMode"]) || !booleans(value.alerts, ["closeUnsaved", "deleteLayer", "deleteFrame", "deleteCel", "convertColorMode"])) return false;
  if (!recordWithKeys(value.editor, ["wheelZoom", "zoomFromCenter", "autoFitOnOpen", "previewShiftLine", "discardCustomBrushOnEyedropper"]) || !booleans(value.editor, ["wheelZoom", "zoomFromCenter", "autoFitOnOpen", "previewShiftLine", "discardCustomBrushOnEyedropper"])) return false;
  if (!recordWithKeys(value.selection, ["keepAfterDelete", "showEdges", "transformScope"]) || !booleans(value.selection, ["keepAfterDelete", "showEdges"]) || !oneOf(value.selection.transformScope, ["selected-cels", "selected-rows-columns"])) return false;
  if (!recordWithKeys(value.timeline, ["autoShow", "rewindOnStop", "firstFrame", "keepSelection", "onionPreviousFrames", "onionNextFrames", "onionOpacity", "onionPreviousColor", "onionNextColor"]) || !booleans(value.timeline, ["autoShow", "rewindOnStop", "keepSelection"]) || !integer(value.timeline.firstFrame, 0, 9999)) return false;
  if (!integer(value.timeline.onionPreviousFrames, 0, 16) || !integer(value.timeline.onionNextFrames, 0, 16) || !integer(value.timeline.onionOpacity, 0, 100) || !color(value.timeline.onionPreviousColor) || !color(value.timeline.onionNextColor)) return false;
  if (!recordWithKeys(value.cursor, ["preview", "scale", "color"]) || !oneOf(value.cursor.preview, ["brush", "crosshair", "both"]) || !integer(value.cursor.scale, 50, 400) || !color(value.cursor.color)) return false;
  if (!recordWithKeys(value.background, ["defaultFill", "checkerSize", "checkerLight", "checkerDark"]) || !oneOf(value.background.defaultFill, ["transparent", "foreground", "background"]) || !integer(value.background.checkerSize, 2, 64) || !color(value.background.checkerLight) || !color(value.background.checkerDark)) return false;
  if (!recordWithKeys(value.grid, ["width", "height", "offsetX", "offsetY", "lineColor", "lineOpacity", "showPixelGrid", "pixelGridColor", "pixelGridOpacity"])) return false;
  if (!integer(value.grid.width, 1, 2048) || !integer(value.grid.height, 1, 2048) || !integer(value.grid.offsetX, -2048, 2048) || !integer(value.grid.offsetY, -2048, 2048) || !color(value.grid.lineColor) || !integer(value.grid.lineOpacity, 0, 100) || typeof value.grid.showPixelGrid !== "boolean" || !color(value.grid.pixelGridColor) || !integer(value.grid.pixelGridOpacity, 0, 100)) return false;
  if (!recordWithKeys(value.guides, ["guideColor", "sliceColor"]) || !color(value.guides.guideColor) || !color(value.guides.sliceColor)) return false;
  if (!recordWithKeys(value.undo, ["memoryLimitMB", "goToModified", "allowNonLinear", "showTooltip"]) || !integer(value.undo.memoryLimitMB, 16, 2048) || !booleans(value.undo, ["goToModified", "allowNonLinear", "showTooltip"])) return false;
  return recordWithKeys(value.drawing, ["pixelPerfect", "pressure", "brushDynamics"]) && booleans(value.drawing, ["pixelPerfect", "pressure", "brushDynamics"]);
}

function recordWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function color(value: unknown): value is string {
  return typeof value === "string" && hexColor.test(value);
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function booleans(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === "boolean");
}
