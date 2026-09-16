import type {
  BitmapBrush,
  BrushDynamicsOptions,
  BrushDynamicsRange,
  BrushDynamicsCurve,
  BrushDynamicsSource,
  BrushShape,
  InkMode,
  PatternAlignment,
  PatternBrush,
  Point,
} from "./tools";

export interface BrushPresetSettings {
  size: number;
  shape: BrushShape;
  bitmap: BitmapBrush | null;
  pattern: PatternBrush | null;
  alignment: PatternAlignment;
  origin: Point;
  spacing: number;
  angle: number;
  pixelPerfect: boolean;
  pressure: boolean;
  inkMode: InkMode;
  stabilizer: number;
  dynamics: {
    enabled: boolean;
    options: BrushDynamicsOptions;
  };
}

export interface NamedBrushPreset {
  name: string;
  settings: BrushPresetSettings;
}

type BrushPresetReadStorage = Pick<Storage, "getItem">;
type BrushPresetWriteStorage = Pick<Storage, "getItem" | "setItem">;

export const brushPresetsStorageKey = "pixtorio-brush-presets";

const brushPresetVersion = 2;
const minBrushDimension = 1;
const maxBrushDimension = 64;
const minSpacing = 1;
const maxSpacing = 32;
const minStabilizer = 0;
const maxStabilizer = 32;
const minOrigin = -4096;
const maxOrigin = 4096;
const maxDynamicsThreshold = 0.99;
const brushShapes = new Set<BrushShape>(["square", "circle", "cross", "diamond"]);
const inkModes = new Set<InkMode>(["simple", "alpha-composite", "copy-alpha", "lock-alpha"]);
const dynamicsSources = new Set<BrushDynamicsSource>(["pressure", "velocity"]);
const dynamicsCurves = new Set<BrushDynamicsCurve>(["linear", "ease-in", "ease-out", "smoothstep"]);
const patternAlignments = new Set<PatternAlignment>(["source", "canvas", "destination"]);

interface BrushPresetEnvelope {
  version: 2;
  presets: SerializedNamedBrushPreset[];
}

interface SerializedNamedBrushPreset {
  name: string;
  settings: SerializedBrushPresetSettings;
}

interface SerializedBrushPresetSettings {
  size: number;
  shape: BrushShape;
  bitmap: SerializedBitmapBrush | null;
  pattern: SerializedPatternBrush | null;
  alignment: PatternAlignment;
  origin: Point;
  spacing: number;
  angle: number;
  pixelPerfect: boolean;
  pressure: boolean;
  inkMode: InkMode;
  stabilizer: number;
  dynamics: SerializedBrushDynamics;
}

interface SerializedBitmapBrush {
  width: number;
  height: number;
  mask: number[];
  anchorX: number;
  anchorY: number;
}

interface SerializedPatternBrush {
  width: number;
  height: number;
  pixels: number[];
  sourceX: number;
  sourceY: number;
}

interface SerializedBrushDynamics {
  enabled: boolean;
  options: BrushDynamicsOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isFiniteInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum;
}

function isFiniteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function normalizePresetName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name) return null;
  return name;
}

function isPoint(value: unknown): value is Point {
  if (!isRecord(value) || !hasExactKeys(value, ["x", "y"])) return false;
  return isFiniteInteger(value.x, minOrigin, maxOrigin) && isFiniteInteger(value.y, minOrigin, maxOrigin);
}

function isByte(value: unknown): value is number {
  return isFiniteInteger(value, 0, 255);
}

function isByteArray(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(isByte);
}

function isBitmapBrush(value: unknown): value is BitmapBrush {
  if (!isRecord(value) || !hasExactKeys(value, ["width", "height", "mask", "anchorX", "anchorY"])) return false;
  const width = value.width;
  const height = value.height;
  if (!isFiniteInteger(width, minBrushDimension, maxBrushDimension)
    || !isFiniteInteger(height, minBrushDimension, maxBrushDimension)) return false;
  if (!isFiniteInteger(value.anchorX, 0, width - 1)
    || !isFiniteInteger(value.anchorY, 0, height - 1)
    || !(value.mask instanceof Uint8Array)
    || value.mask.length !== width * height) return false;

  return true;
}

function isPatternBrush(value: unknown): value is PatternBrush {
  if (!isRecord(value) || !hasExactKeys(value, ["width", "height", "pixels", "sourceX", "sourceY"])) return false;
  const width = value.width;
  const height = value.height;
  if (!isFiniteInteger(width, minBrushDimension, maxBrushDimension)
    || !isFiniteInteger(height, minBrushDimension, maxBrushDimension)) return false;
  if (!isFiniteInteger(value.sourceX, minOrigin, maxOrigin)
    || !isFiniteInteger(value.sourceY, minOrigin, maxOrigin)
    || !(value.pixels instanceof Uint8ClampedArray)
    || value.pixels.length !== width * height * 4) return false;

  return Array.from(value.pixels).every(isByte);
}

function isDynamicsRange(value: unknown, minimum: number, maximum: number): value is BrushDynamicsRange {
  if (!isRecord(value) || !hasExactKeys(value, ["enabled", "source", "min", "max", "threshold", "invert", "curve"])) return false;
  return typeof value.enabled === "boolean"
    && typeof value.source === "string"
    && dynamicsSources.has(value.source as BrushDynamicsSource)
    && isFiniteNumber(value.min, minimum, maximum)
    && isFiniteNumber(value.max, minimum, maximum)
    && isFiniteNumber(value.threshold, 0, maxDynamicsThreshold)
    && typeof value.invert === "boolean"
    && typeof value.curve === "string"
    && dynamicsCurves.has(value.curve as BrushDynamicsCurve);
}

function isDynamicsOptions(value: unknown): value is BrushDynamicsOptions {
  if (!isRecord(value) || !hasExactKeys(value, ["size", "opacity", "angle", "gradient"])) return false;
  return isDynamicsRange(value.size, minBrushDimension, maxBrushDimension)
    && isDynamicsRange(value.opacity, 0, 1)
    && isDynamicsRange(value.angle, -360, 360)
    && isDynamicsRange(value.gradient, 0, 1);
}

function isDynamics(value: unknown): value is BrushPresetSettings["dynamics"] {
  return isRecord(value)
    && hasExactKeys(value, ["enabled", "options"])
    && typeof value.enabled === "boolean"
    && isDynamicsOptions(value.options);
}

function cloneDynamicsRange(range: BrushDynamicsRange): BrushDynamicsRange { return {...range}; }

function cloneDynamics(options: BrushDynamicsOptions): BrushDynamicsOptions {
  return {
    size: cloneDynamicsRange(options.size),
    opacity: cloneDynamicsRange(options.opacity),
    angle: cloneDynamicsRange(options.angle),
    gradient: cloneDynamicsRange(options.gradient),
  };
}

function isBrushPresetSettings(value: unknown): value is BrushPresetSettings {
  if (!isRecord(value) || !hasExactKeys(value, [
    "size",
    "shape",
    "bitmap",
    "pattern",
    "alignment",
    "origin",
    "spacing",
    "angle",
    "pixelPerfect",
    "pressure",
    "inkMode",
    "stabilizer",
    "dynamics",
  ])) return false;

  return isFiniteInteger(value.size, minBrushDimension, maxBrushDimension)
    && typeof value.shape === "string"
    && brushShapes.has(value.shape as BrushShape)
    && (value.bitmap === null || isBitmapBrush(value.bitmap))
    && (value.pattern === null || isPatternBrush(value.pattern))
    && typeof value.alignment === "string"
    && patternAlignments.has(value.alignment as PatternAlignment)
    && isPoint(value.origin)
    && isFiniteInteger(value.spacing, minSpacing, maxSpacing)
    && isFiniteInteger(value.angle, 0, 359)
    && typeof value.pixelPerfect === "boolean"
    && typeof value.pressure === "boolean"
    && typeof value.inkMode === "string"
    && inkModes.has(value.inkMode as InkMode)
    && isFiniteInteger(value.stabilizer, minStabilizer, maxStabilizer)
    && isDynamics(value.dynamics);
}

function cloneBitmapBrush(bitmap: BitmapBrush): BitmapBrush {
  return {
    width: bitmap.width,
    height: bitmap.height,
    mask: new Uint8Array(bitmap.mask),
    anchorX: bitmap.anchorX,
    anchorY: bitmap.anchorY,
  };
}

function clonePatternBrush(pattern: PatternBrush): PatternBrush {
  return {
    width: pattern.width,
    height: pattern.height,
    pixels: new Uint8ClampedArray(pattern.pixels),
    sourceX: pattern.sourceX,
    sourceY: pattern.sourceY,
  };
}

function cloneSettings(settings: BrushPresetSettings): BrushPresetSettings {
  return {
    size: settings.size,
    shape: settings.shape,
    bitmap: settings.bitmap ? cloneBitmapBrush(settings.bitmap) : null,
    pattern: settings.pattern ? clonePatternBrush(settings.pattern) : null,
    alignment: settings.alignment,
    origin: {x: settings.origin.x, y: settings.origin.y},
    spacing: settings.spacing,
    angle: settings.angle,
    pixelPerfect: settings.pixelPerfect,
    pressure: settings.pressure,
    inkMode: settings.inkMode,
    stabilizer: settings.stabilizer,
    dynamics: {
      enabled: settings.dynamics.enabled,
      options: cloneDynamics(settings.dynamics.options),
    },
  };
}

function clonePreset(preset: NamedBrushPreset): NamedBrushPreset {
  return {name: preset.name, settings: cloneSettings(preset.settings)};
}

function serializeBitmapBrush(bitmap: BitmapBrush): SerializedBitmapBrush {
  return {
    width: bitmap.width,
    height: bitmap.height,
    mask: Array.from(bitmap.mask),
    anchorX: bitmap.anchorX,
    anchorY: bitmap.anchorY,
  };
}

function serializePatternBrush(pattern: PatternBrush): SerializedPatternBrush {
  return {
    width: pattern.width,
    height: pattern.height,
    pixels: Array.from(pattern.pixels),
    sourceX: pattern.sourceX,
    sourceY: pattern.sourceY,
  };
}

function serializeSettings(settings: BrushPresetSettings): SerializedBrushPresetSettings {
  return {
    size: settings.size,
    shape: settings.shape,
    bitmap: settings.bitmap ? serializeBitmapBrush(settings.bitmap) : null,
    pattern: settings.pattern ? serializePatternBrush(settings.pattern) : null,
    alignment: settings.alignment,
    origin: {x: settings.origin.x, y: settings.origin.y},
    spacing: settings.spacing,
    angle: settings.angle,
    pixelPerfect: settings.pixelPerfect,
    pressure: settings.pressure,
    inkMode: settings.inkMode,
    stabilizer: settings.stabilizer,
    dynamics: {
      enabled: settings.dynamics.enabled,
      options: cloneDynamics(settings.dynamics.options),
    },
  };
}

function serializePreset(preset: NamedBrushPreset): SerializedNamedBrushPreset {
  return {name: preset.name, settings: serializeSettings(preset.settings)};
}

function deserializeBitmapBrush(value: SerializedBitmapBrush): BitmapBrush {
  return {
    width: value.width,
    height: value.height,
    mask: Uint8Array.from(value.mask),
    anchorX: value.anchorX,
    anchorY: value.anchorY,
  };
}

function deserializePatternBrush(value: SerializedPatternBrush): PatternBrush {
  return {
    width: value.width,
    height: value.height,
    pixels: Uint8ClampedArray.from(value.pixels),
    sourceX: value.sourceX,
    sourceY: value.sourceY,
  };
}

function deserializeSettings(value: unknown): BrushPresetSettings | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "size",
    "shape",
    "bitmap",
    "pattern",
    "alignment",
    "origin",
    "spacing",
    "angle",
    "pixelPerfect",
    "pressure",
    "inkMode",
    "stabilizer",
    "dynamics",
  ])) return null;

  const bitmap = value.bitmap;
  const pattern = value.pattern;
  if (bitmap !== null) {
    if (!isRecord(bitmap) || !hasExactKeys(bitmap, ["width", "height", "mask", "anchorX", "anchorY"])) return null;
    const width = bitmap.width;
    const height = bitmap.height;
    if (!isFiniteInteger(width, minBrushDimension, maxBrushDimension)
      || !isFiniteInteger(height, minBrushDimension, maxBrushDimension)
      || !isFiniteInteger(bitmap.anchorX, 0, width - 1)
      || !isFiniteInteger(bitmap.anchorY, 0, height - 1)
      || !isByteArray(bitmap.mask, width * height)) return null;
  }
  if (pattern !== null) {
    if (!isRecord(pattern) || !hasExactKeys(pattern, ["width", "height", "pixels", "sourceX", "sourceY"])) return null;
    const width = pattern.width;
    const height = pattern.height;
    if (!isFiniteInteger(width, minBrushDimension, maxBrushDimension)
      || !isFiniteInteger(height, minBrushDimension, maxBrushDimension)
      || !isFiniteInteger(pattern.sourceX, minOrigin, maxOrigin)
      || !isFiniteInteger(pattern.sourceY, minOrigin, maxOrigin)
      || !isByteArray(pattern.pixels, width * height * 4)) return null;
  }
  if (!isFiniteInteger(value.size, minBrushDimension, maxBrushDimension)
    || typeof value.shape !== "string"
    || !brushShapes.has(value.shape as BrushShape)
    || !isRecord(value.origin)
    || !hasExactKeys(value.origin, ["x", "y"])
    || !isPoint(value.origin)
    || !isFiniteInteger(value.spacing, minSpacing, maxSpacing)
    || !isFiniteInteger(value.angle, 0, 359)
    || typeof value.pixelPerfect !== "boolean"
    || typeof value.pressure !== "boolean"
    || typeof value.inkMode !== "string"
    || !inkModes.has(value.inkMode as InkMode)
    || typeof value.alignment !== "string"
    || !patternAlignments.has(value.alignment as PatternAlignment)
    || !isFiniteInteger(value.stabilizer, minStabilizer, maxStabilizer)
    || !isDynamics(value.dynamics)) return null;

  const candidate = value as unknown as SerializedBrushPresetSettings;
  return {
    size: candidate.size,
    shape: candidate.shape,
    bitmap: candidate.bitmap === null ? null : deserializeBitmapBrush(candidate.bitmap),
    pattern: candidate.pattern === null ? null : deserializePatternBrush(candidate.pattern),
    alignment: candidate.alignment,
    origin: {x: candidate.origin.x, y: candidate.origin.y},
    spacing: candidate.spacing,
    angle: candidate.angle,
    pixelPerfect: candidate.pixelPerfect,
    pressure: candidate.pressure,
    inkMode: candidate.inkMode,
    stabilizer: candidate.stabilizer,
    dynamics: {
      enabled: candidate.dynamics.enabled,
      options: cloneDynamics(candidate.dynamics.options),
    },
  };
}

function deserializePreset(value: unknown): NamedBrushPreset | null {
  if (!isRecord(value) || !hasExactKeys(value, ["name", "settings"])) return null;
  const name = normalizePresetName(value.name);
  if (!name || name !== value.name) return null;
  const settings = deserializeSettings(value.settings);
  return settings ? {name, settings} : null;
}

function deserializeEnvelope(value: unknown): NamedBrushPreset[] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["version", "presets"]) || value.version !== brushPresetVersion || !Array.isArray(value.presets)) {
    return null;
  }

  const presets: NamedBrushPreset[] = [];
  const names = new Set<string>();
  for (const entry of value.presets) {
    const preset = deserializePreset(entry);
    if (!preset || names.has(preset.name)) return null;
    names.add(preset.name);
    presets.push(preset);
  }
  return presets;
}

function encodePresets(presets: readonly NamedBrushPreset[]): string {
  const envelope: BrushPresetEnvelope = {
    version: brushPresetVersion,
    presets: presets.map(serializePreset),
  };
  return JSON.stringify(envelope);
}

export function readBrushPresets(storage: BrushPresetReadStorage): NamedBrushPreset[] {
  let raw: string | null;
  try {
    raw = storage.getItem(brushPresetsStorageKey);
  } catch {
    return [];
  }
  if (raw === null) return [];

  try {
    const presets = deserializeEnvelope(JSON.parse(raw));
    return presets ? presets.map(clonePreset) : [];
  } catch {
    return [];
  }
}

export function saveBrushPreset(
  storage: BrushPresetWriteStorage,
  name: string,
  settings: BrushPresetSettings,
): NamedBrushPreset[] {
  const normalizedName = normalizePresetName(name);
  if (!normalizedName || !isBrushPresetSettings(settings)) throw new Error("Invalid brush preset");

  const presets = readBrushPresets(storage);
  const nextPreset = {name: normalizedName, settings: cloneSettings(settings)};
  const existingIndex = presets.findIndex((preset) => preset.name === normalizedName);
  if (existingIndex >= 0) presets[existingIndex] = nextPreset;
  else presets.push(nextPreset);

  storage.setItem(brushPresetsStorageKey, encodePresets(presets));
  return presets.map(clonePreset);
}

export function deleteBrushPreset(storage: BrushPresetWriteStorage, name: string): NamedBrushPreset[] {
  const normalizedName = normalizePresetName(name);
  if (!normalizedName) throw new Error("Invalid brush preset");

  const presets = readBrushPresets(storage).filter((preset) => preset.name !== normalizedName);
  storage.setItem(brushPresetsStorageKey, encodePresets(presets));
  return presets.map(clonePreset);
}
