import {isTilemapLayer, type Cel, type ColorMode, type PixelDocument} from "./document";
import {renderTilemapCel} from "./tilemap";

export interface RGBColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Indexed conversion strategies. `none` is deterministic nearest-colour mapping. */
export type DitherMode = "none" | "ordered" | "floyd-steinberg";
export type IndexedDitherMode = DitherMode;

export interface IndexedConversionOptions {
  dither?: DitherMode | "floyd" | "floydSteinberg" | "ordered-bayer";
  /** Required for two-dimensional ordered/error-diffusion conversion. */
  width?: number;
  height?: number;
  transparentIndex?: number;
  /** Ordered dither amplitude in byte values. Defaults to 64. */
  orderedStrength?: number;
}

export type IndexPixelsOptions = IndexedConversionOptions;

export type PaletteFileFormat = "gpl" | "jasc-pal";

export interface ParsedPalette {
  format: PaletteFileFormat;
  name: string;
  colors: string[];
}

export function constrainColorToMode(color: readonly number[], mode: ColorMode, palette: readonly string[]): [number, number, number, number] {
  const source: RGBColor = {
    r: clampByte(color[0]),
    g: clampByte(color[1]),
    b: clampByte(color[2]),
    a: clampByte(color[3] ?? 255),
  };
  if (mode === "rgba") return [source.r, source.g, source.b, source.a];
  if (mode === "grayscale") {
    const gray = Math.round(source.r * 0.299 + source.g * 0.587 + source.b * 0.114);
    return [gray, gray, gray, source.a];
  }
  if (mode === "bitmap") {
    const luminance = source.r * 0.299 + source.g * 0.587 + source.b * 0.114;
    const value = luminance >= 128 && source.a > 0 ? 255 : 0;
    return [value, value, value, source.a > 0 ? 255 : 0];
  }
  const nearest = nearestPaletteColor(source, palette);
  return nearest ? [nearest.r, nearest.g, nearest.b, source.a] : [source.r, source.g, source.b, source.a];
}

export function convertDocumentColorMode(document: PixelDocument, mode: ColorMode, options?: IndexedConversionOptions | DitherMode) {
  if (document.colorMode === mode) return false;
  const indexedOptions = normalizeIndexedOptions(options);
  for (const tileset of document.tilesets) {
    for (const tile of tileset.tiles) {
      if (mode === "indexed") {
        tile.indexes = indexPixels(tile.pixels, document.palette.colors, {
          ...indexedOptions,
          width: tileset.tileWidth,
          height: tileset.tileHeight,
          transparentIndex: document.palette.transparentIndex,
        });
        renderIndexedPixels(tile.indexes, tile.pixels, document.palette.colors, document.palette.transparentIndex);
      } else {
        if (document.colorMode === "indexed" && tile.indexes) {
          renderIndexedPixels(tile.indexes, tile.pixels, document.palette.colors, document.palette.transparentIndex);
        }
        tile.indexes = undefined;
        quantizePixelsInPlace(tile.pixels, mode, document.palette.colors);
      }
    }
  }
  const convertedLinks = new Set<string>();
  for (const cel of Object.values(document.cels)) {
    if (convertedLinks.has(cel.linkId)) continue;
    convertedLinks.add(cel.linkId);
    const layer = document.layers.find((candidate) => candidate.id === cel.layerId);
    if (layer && isTilemapLayer(layer)) continue;
    if (mode === "indexed") {
      cel.indexes = indexPixels(cel.pixels, document.palette.colors, {
        ...indexedOptions,
        width: cel.width,
        height: cel.height,
        transparentIndex: document.palette.transparentIndex,
      });
      renderIndexedPixels(cel.indexes, cel.pixels, document.palette.colors, document.palette.transparentIndex);
    } else {
      if (document.colorMode === "indexed" && cel.indexes) {
        renderIndexedPixels(cel.indexes, cel.pixels, document.palette.colors, document.palette.transparentIndex);
      }
      cel.indexes = undefined;
      quantizePixelsInPlace(cel.pixels, mode, document.palette.colors);
    }
  }
  document.colorMode = mode;
  refreshTilemapCaches(document);
  return true;
}

export function syncIndexedCel(document: PixelDocument, cel: Cel, options?: IndexedConversionOptions | DitherMode) {
  if (document.colorMode !== "indexed") return;
  cel.indexes = indexPixels(cel.pixels, document.palette.colors, {
    ...normalizeIndexedOptions(options),
    transparentIndex: document.palette.transparentIndex,
  });
  renderIndexedPixels(cel.indexes, cel.pixels, document.palette.colors, document.palette.transparentIndex);
  // Detached preview Cels must never update the live document's aliases.
  const cels = Object.values(document.cels);
  if (cels.includes(cel)) {
    for (const alias of cels) {
      if (alias.linkId !== cel.linkId) continue;
      alias.pixels = cel.pixels;
      alias.indexes = cel.indexes;
    }
  }
}

export function refreshIndexedDocument(document: PixelDocument) {
  if (document.colorMode !== "indexed") return false;
  const refreshed = new Set<string>();
  for (const tileset of document.tilesets) {
    for (const tile of tileset.tiles) {
      if (!tile.indexes) continue;
      renderIndexedPixels(tile.indexes, tile.pixels, document.palette.colors, document.palette.transparentIndex);
      refreshed.add(`tile:${tileset.id}:${tile.id}`);
    }
  }
  for (const cel of Object.values(document.cels)) {
    const layer = document.layers.find((candidate) => candidate.id === cel.layerId);
    if (layer && isTilemapLayer(layer)) continue;
    if (!cel.indexes || refreshed.has(cel.linkId)) continue;
    refreshed.add(cel.linkId);
    renderIndexedPixels(cel.indexes, cel.pixels, document.palette.colors, document.palette.transparentIndex);
  }
  refreshTilemapCaches(document);
  return refreshed.size > 0;
}

/** Rebuilds every tilemap Cel cache from its authoritative tiles and tileset. */
export function refreshTilemapCaches(document: PixelDocument) {
  const layerByID = new Map(document.layers.map((layer) => [layer.id, layer]));
  const tilesetByID = new Map(document.tilesets.map((tileset) => [tileset.id, tileset]));
  const linked = new Map<string, {pixels: Uint8ClampedArray; indexes?: Uint8Array}>();
  let refreshed = 0;
  for (const cel of Object.values(document.cels)) {
    const layer = layerByID.get(cel.layerId);
    if (!layer || !isTilemapLayer(layer) || !cel.tilemap || !layer.tilesetId) continue;
    const existing = linked.get(cel.linkId);
    if (existing) {
      cel.pixels = existing.pixels;
      cel.indexes = existing.indexes;
      continue;
    }
    const tileset = tilesetByID.get(layer.tilesetId);
    if (!tileset) continue;
    const pixels = renderTilemapCel(cel, tileset, {
      palette: document.colorMode === "indexed" ? document.palette.colors : undefined,
      transparentIndex: document.palette.transparentIndex,
    });
    const indexes = document.colorMode === "indexed"
      ? indexPixels(pixels, document.palette.colors, {
        width: cel.width,
        height: cel.height,
        transparentIndex: document.palette.transparentIndex,
      })
      : undefined;
    cel.pixels = pixels;
    cel.indexes = indexes;
    linked.set(cel.linkId, {pixels, indexes});
    refreshed += 1;
  }
  return refreshed;
}

export function indexPixels(
  pixels: Uint8ClampedArray,
  palette: readonly string[],
  transparentIndex?: number,
  options?: IndexedConversionOptions | DitherMode,
): Uint8Array;
export function indexPixels(
  pixels: Uint8ClampedArray,
  palette: readonly string[],
  options?: IndexedConversionOptions | DitherMode,
): Uint8Array;
export function indexPixels(
  pixels: Uint8ClampedArray,
  palette: readonly string[],
  transparentIndexOrOptions: number | IndexedConversionOptions | DitherMode = 0,
  trailingOptions?: IndexedConversionOptions | DitherMode,
) {
  const suppliedOptions = typeof transparentIndexOrOptions === "number"
    ? trailingOptions
    : transparentIndexOrOptions;
  const resolved = normalizeIndexedOptions(suppliedOptions);
  const transparentIndex = typeof transparentIndexOrOptions === "number"
    ? normalizeTransparentIndex(transparentIndexOrOptions)
    : normalizeTransparentIndex(resolved.transparentIndex ?? 0);
  const width = normalizePixelDimension(resolved.width, pixels.length / 4, "width");
  const height = normalizePixelDimension(resolved.height, pixels.length / 4 / width, "height");
  if (width * height !== pixels.length / 4) throw new Error("Indexed conversion dimensions do not match the pixel buffer");

  const dither = normalizeDitherMode(resolved.dither);
  if (dither === "floyd-steinberg") return indexPixelsFloydSteinberg(pixels, palette, width, height, transparentIndex);
  const indexes = new Uint8Array(pixels.length / 4);
  for (let pixel = 0; pixel < indexes.length; pixel += 1) {
    const offset = pixel * 4;
    if (pixels[offset + 3] === 0) {
      indexes[pixel] = transparentIndex;
      continue;
    }
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const source: RGBColor = {
      r: pixels[offset],
      g: pixels[offset + 1],
      b: pixels[offset + 2],
      a: pixels[offset + 3],
    };
    if (dither === "ordered") {
      const threshold = orderedDitherOffset(x, y, resolved.orderedStrength);
      source.r = clampByte(source.r + threshold);
      source.g = clampByte(source.g + threshold);
      source.b = clampByte(source.b + threshold);
    }
    indexes[pixel] = nearestPaletteIndex(source, palette, transparentIndex);
  }
  return indexes;
}

export function renderIndexedPixels(indexes: Uint8Array, pixels: Uint8ClampedArray, palette: readonly string[], transparentIndex = 0) {
  if (pixels.length !== indexes.length * 4) throw new Error("Indexed pixel buffers have different dimensions");
  for (let pixel = 0; pixel < indexes.length; pixel += 1) {
    const offset = pixel * 4;
    const index = indexes[pixel];
    const color = parseHexColor(palette[index] ?? "#00000000") ?? {r: 0, g: 0, b: 0, a: 0};
    pixels[offset] = color.r;
    pixels[offset + 1] = color.g;
    pixels[offset + 2] = color.b;
    pixels[offset + 3] = index === transparentIndex ? 0 : color.a;
  }
  return pixels;
}

export function quantizePixelsInPlace(
  pixels: Uint8ClampedArray,
  mode: ColorMode,
  palette: readonly string[],
  options?: IndexedConversionOptions | DitherMode,
) {
  if (mode === "rgba") return pixels;
  if (mode === "indexed") {
    const indexes = indexPixels(pixels, palette, options);
    renderIndexedPixels(indexes, pixels, palette, normalizeIndexedOptions(options).transparentIndex ?? 0);
    return pixels;
  }
  if (mode === "bitmap") {
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const constrained = constrainColorToMode([pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]], mode, palette);
      pixels[offset] = constrained[0];
      pixels[offset + 1] = constrained[1];
      pixels[offset + 2] = constrained[2];
      pixels[offset + 3] = constrained[3];
    }
    return pixels;
  }
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const constrained = constrainColorToMode(
      [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]],
      mode,
      palette,
    );
    pixels[offset] = constrained[0];
    pixels[offset + 1] = constrained[1];
    pixels[offset + 2] = constrained[2];
  }
  return pixels;
}

export function extractPalette(buffers: Iterable<Uint8ClampedArray>, maximum = 256) {
  const limit = Math.max(1, Math.min(256, Math.floor(maximum)));
  const buckets = new Map<number, {count: number; r: number; g: number; b: number; a: number}>();
  for (const pixels of buffers) {
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const a = pixels[offset + 3];
      if (a === 0) continue;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const key = ((r >> 3) << 15) | ((g >> 3) << 10) | ((b >> 3) << 5) | (a >> 3);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.a += a;
      } else {
        buckets.set(key, {count: 1, r, g, b, a});
      }
    }
  }
  return [...buckets.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
    .map((bucket) => rgbToHex(
      Math.round(bucket.r / bucket.count),
      Math.round(bucket.g / bucket.count),
      Math.round(bucket.b / bucket.count),
      Math.round(bucket.a / bucket.count),
    ));
}

export function sortPalette(colors: readonly string[]) {
  return [...new Set(colors.map((color) => color.toLowerCase()))].sort((left, right) => {
    const a = rgbToHsl(parseHexColor(left) ?? {r: 0, g: 0, b: 0, a: 255});
    const b = rgbToHsl(parseHexColor(right) ?? {r: 0, g: 0, b: 0, a: 255});
    return a.h - b.h || a.l - b.l || a.s - b.s;
  });
}

export function parseHexColor(value: string): RGBColor | null {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!match) return null;
  return {
    r: Number.parseInt(match[1].slice(0, 2), 16),
    g: Number.parseInt(match[1].slice(2, 4), 16),
    b: Number.parseInt(match[1].slice(4, 6), 16),
    a: match[2] ? Number.parseInt(match[2], 16) : 255,
  };
}

/**
 * Parses an indexed palette from a GIMP `.gpl` or JASC `.pal` text file.
 * The parser deliberately rejects malformed color rows and out-of-range
 * channels instead of silently importing a partial palette.
 */
export function parsePaletteText(text: string, format?: PaletteFileFormat): ParsedPalette {
  if (typeof text !== "string") throw new Error("Palette text must be a string");
  const normalized = text.replace(/^\uFEFF/, "");
  const detected = format ?? detectPaletteFileFormat(normalized);
  if (detected === "gpl") return parseGplPalette(normalized);
  if (detected === "jasc-pal") return parseJascPalette(normalized);
  throw new Error("Unsupported palette format");
}

export function parseGplPalette(text: string): ParsedPalette {
  const lines = splitPaletteLines(text);
  if (lines.length === 0 || lines[0] !== "GIMP Palette") {
    throw new Error("Invalid GIMP GPL palette header");
  }
  let name = "Untitled Palette";
  let hasName = false;
  let columns: number | undefined;
  let pendingAlpha: number | undefined;
  const colors: string[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.trim() === "") continue;
    if (line.startsWith("#")) {
      const alpha = parseRGBAExtension(line);
      if (alpha !== null) {
        if (pendingAlpha !== undefined) throw new Error("Invalid GIMP GPL palette alpha extension");
        pendingAlpha = alpha;
      }
      continue;
    }
    const nameMatch = /^Name:\s*(.*)$/.exec(line);
    if (nameMatch) {
      if (hasName || !nameMatch[1].trim() || nameMatch[1].includes("\r") || nameMatch[1].includes("\n")) {
        throw new Error("Invalid GIMP GPL palette name");
      }
      name = nameMatch[1].trim();
      hasName = true;
      continue;
    }
    const columnsMatch = /^Columns:\s*(\d+)$/.exec(line);
    if (columnsMatch) {
      if (columns !== undefined) throw new Error("Invalid GIMP GPL palette columns");
      columns = Number(columnsMatch[1]);
      if (!Number.isInteger(columns) || columns > 256) throw new Error("Invalid GIMP GPL palette columns");
      continue;
    }
    const colorMatch = /^(\d+)\s+(\d+)\s+(\d+)(?:\s+.*)?$/.exec(line);
    if (!colorMatch) throw new Error(`Invalid GIMP GPL palette row at line ${lineIndex + 1}`);
    const rgb = colorMatch.slice(1, 4).map(Number);
    if (rgb.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
      throw new Error(`Invalid GIMP GPL palette color at line ${lineIndex + 1}`);
    }
    const alpha = pendingAlpha ?? 255;
    colors.push(rgbToHex(rgb[0], rgb[1], rgb[2], alpha));
    pendingAlpha = undefined;
    if (colors.length > 256) throw new Error("Palette cannot contain more than 256 colors");
  }
  if (pendingAlpha !== undefined || colors.length === 0) throw new Error("Invalid GIMP GPL palette colors");
  return {format: "gpl", name, colors};
}

export function parseJascPalette(text: string): ParsedPalette {
  const lines = splitPaletteLines(text);
  if (lines.length < 3 || lines[0] !== "JASC-PAL" || lines[1] !== "0100") {
    throw new Error("Invalid JASC PAL palette header");
  }
  const count = Number(lines[2]);
  if (!/^\d+$/.test(lines[2]) || !Number.isInteger(count) || count < 1 || count > 256) {
    throw new Error("Invalid JASC PAL palette color count");
  }
  let name = "Untitled Palette";
  let pendingAlpha: number | undefined;
  const colors: string[] = [];
  for (let lineIndex = 3; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.trim() === "") continue;
    if (line.startsWith("#")) {
      const nameMatch = /^#\s*Name:\s*(.*)$/.exec(line);
      if (nameMatch) {
        if (!nameMatch[1].trim()) throw new Error("Invalid JASC PAL palette name");
        name = nameMatch[1].trim();
      }
      const alpha = parseRGBAExtension(line);
      if (alpha !== null) {
        if (pendingAlpha !== undefined) throw new Error("Invalid JASC PAL palette alpha extension");
        pendingAlpha = alpha;
      }
      continue;
    }
    if (colors.length >= count) throw new Error("JASC PAL palette has extra color rows");
    const colorMatch = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(line);
    if (!colorMatch) throw new Error(`Invalid JASC PAL palette row at line ${lineIndex + 1}`);
    const rgb = colorMatch.slice(1, 4).map(Number);
    if (rgb.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
      throw new Error(`Invalid JASC PAL palette color at line ${lineIndex + 1}`);
    }
    colors.push(rgbToHex(rgb[0], rgb[1], rgb[2], pendingAlpha ?? 255));
    pendingAlpha = undefined;
  }
  if (colors.length !== count || pendingAlpha !== undefined) throw new Error("JASC PAL palette color count does not match its rows");
  return {format: "jasc-pal", name, colors};
}

export function exportPaletteText(
  palette: readonly string[] | {colors: readonly string[]; name?: string},
  format: PaletteFileFormat,
  name?: string,
) {
  if (format === "gpl") return exportGplPalette(palette, name);
  if (format === "jasc-pal") return exportJascPalette(palette, name);
  throw new Error("Unsupported palette format");
}

export function exportGplPalette(colors: readonly string[], name?: string): string;
export function exportGplPalette(name: string, colors: readonly string[]): string;
export function exportGplPalette(palette: {colors: readonly string[]; name?: string}, name?: string): string;
export function exportGplPalette(palette: readonly string[] | {colors: readonly string[]; name?: string}, name?: string): string;
export function exportGplPalette(
  first: readonly string[] | {colors: readonly string[]; name?: string} | string,
  second?: string | readonly string[],
) {
  const {colors, name} = normalizePaletteExportArguments(first, second);
  validatePaletteColors(colors);
  const lines = ["GIMP Palette", `Name: ${name}`, `Columns: ${Math.min(16, colors.length)}`, "#"];
  colors.forEach((value, index) => {
    const color = parsePaletteColor(value);
    if (color.a !== 255) lines.push(`# PIXTORIO_RGBA ${color.r} ${color.g} ${color.b} ${color.a}`);
    lines.push(`${color.r} ${color.g} ${color.b} Color ${index + 1}`);
  });
  return `${lines.join("\n")}\n`;
}

export function exportJascPalette(colors: readonly string[], name?: string): string;
export function exportJascPalette(name: string, colors: readonly string[]): string;
export function exportJascPalette(palette: {colors: readonly string[]; name?: string}, name?: string): string;
export function exportJascPalette(palette: readonly string[] | {colors: readonly string[]; name?: string}, name?: string): string;
export function exportJascPalette(
  first: readonly string[] | {colors: readonly string[]; name?: string} | string,
  second?: string | readonly string[],
) {
  const {colors, name} = normalizePaletteExportArguments(first, second);
  validatePaletteColors(colors);
  const lines = ["JASC-PAL", "0100", String(colors.length), `# Name: ${name}`];
  colors.forEach((value) => {
    const color = parsePaletteColor(value);
    if (color.a !== 255) lines.push(`# PIXTORIO_RGBA ${color.r} ${color.g} ${color.b} ${color.a}`);
    lines.push(`${color.r} ${color.g} ${color.b}`);
  });
  return `${lines.join("\n")}\n`;
}

export const serializeGplPalette = exportGplPalette;
export const serializeJascPalette = exportJascPalette;
export const exportGPLPalette = exportGplPalette;
export const exportJASCPalette = exportJascPalette;
export const parseGPLPalette = parseGplPalette;
export const parseJASCPalette = parseJascPalette;

/** Convenience APIs for callers that only need the imported color list. */
export function parseGplColors(text: string) { return parseGplPalette(text).colors; }
export function parseJascColors(text: string) { return parseJascPalette(text).colors; }

function normalizeIndexedOptions(options?: IndexedConversionOptions | DitherMode): IndexedConversionOptions {
  if (typeof options === "string") return {dither: options};
  return options ? {...options} : {};
}

function normalizeDitherMode(value: IndexedConversionOptions["dither"]): DitherMode {
  if (value === undefined || value === "none") return "none";
  if (value === "ordered" || value === "ordered-bayer") return "ordered";
  if (value === "floyd-steinberg" || value === "floyd" || value === "floydSteinberg") return "floyd-steinberg";
  throw new Error("Unsupported indexed dithering mode");
}

function normalizeTransparentIndex(value: number) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

function normalizePixelDimension(value: number | undefined, fallback: number, label: string) {
  const result = value === undefined ? fallback : value;
  if (!Number.isInteger(result) || result <= 0) throw new Error(`Indexed conversion ${label} must be a positive integer`);
  return result;
}

function orderedDitherOffset(x: number, y: number, strength = 64) {
  const matrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const amplitude = Number.isFinite(strength) ? Math.max(0, Math.min(255, strength)) : 64;
  return (((matrix[y & 3][x & 3] + 0.5) / 16) - 0.5) * amplitude;
}

function indexPixelsFloydSteinberg(
  pixels: Uint8ClampedArray,
  palette: readonly string[],
  width: number,
  height: number,
  transparentIndex: number,
) {
  const indexes = new Uint8Array(pixels.length / 4);
  const errors = new Float64Array(pixels.length);
  const addError = (x: number, y: number, channel: number, value: number, weight: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    errors[(y * width + x) * 4 + channel] += value * weight;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      if (pixels[offset + 3] === 0) {
        indexes[pixel] = transparentIndex;
        continue;
      }
      const source: RGBColor = {
        r: clampByte(pixels[offset] + errors[offset]),
        g: clampByte(pixels[offset + 1] + errors[offset + 1]),
        b: clampByte(pixels[offset + 2] + errors[offset + 2]),
        a: clampByte(pixels[offset + 3] + errors[offset + 3]),
      };
      const index = nearestPaletteIndex(source, palette, transparentIndex);
      indexes[pixel] = index;
      const color = parseHexColor(palette[index] ?? "#00000000") ?? {r: 0, g: 0, b: 0, a: 0};
      for (let channel = 0; channel < 4; channel += 1) {
        const error = source[channelKey(channel)] - color[channelKey(channel)];
        addError(x + 1, y, channel, error, 7 / 16);
        addError(x - 1, y + 1, channel, error, 3 / 16);
        addError(x, y + 1, channel, error, 5 / 16);
        addError(x + 1, y + 1, channel, error, 1 / 16);
      }
    }
  }
  return indexes;
}

function channelKey(channel: number): keyof RGBColor {
  return channel === 0 ? "r" : channel === 1 ? "g" : channel === 2 ? "b" : "a";
}

function detectPaletteFileFormat(text: string): PaletteFileFormat {
  const firstLine = splitPaletteLines(text)[0];
  if (firstLine === "GIMP Palette") return "gpl";
  if (firstLine === "JASC-PAL") return "jasc-pal";
  throw new Error("Unsupported palette format");
}

function splitPaletteLines(text: string) {
  return text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).map((line) => line.trimEnd());
}

function parseRGBAExtension(line: string) {
  const match = /^#\s*PIXTORIO_RGBA\s*:?\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/i.exec(line);
  if (!match) {
    if (/^#\s*PIXTORIO_RGBA\b/i.test(line)) throw new Error("Invalid PIXTORIO_RGBA palette extension");
    return null;
  }
  const channels = match.slice(1).map(Number);
  if (channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    throw new Error("Invalid PIXTORIO_RGBA palette extension");
  }
  return channels[3];
}

function normalizePaletteExportArguments(
  first: readonly string[] | {colors: readonly string[]; name?: string} | string,
  second?: string | readonly string[],
): {colors: readonly string[]; name: string} {
  if (typeof first === "string") {
    if (!Array.isArray(second)) throw new Error("Palette colors are required");
    return {colors: second, name: normalizePaletteName(first)};
  }
  if (isPaletteObject(first)) return {colors: first.colors, name: normalizePaletteName(typeof second === "string" ? second : first.name)};
  return {colors: first, name: normalizePaletteName(typeof second === "string" ? second : undefined)};
}

function isPaletteObject(value: readonly string[] | {colors: readonly string[]; name?: string}): value is {colors: readonly string[]; name?: string} {
  if (Array.isArray(value) || typeof value !== "object" || value === null) return false;
  return Array.isArray((value as {colors?: unknown}).colors);
}

function normalizePaletteName(value: string | undefined) {
  const name = value?.trim() || "Pixtorio Palette";
  if (name.includes("\r") || name.includes("\n")) throw new Error("Palette name cannot contain line breaks");
  return name;
}

function validatePaletteColors(colors: readonly string[]) {
  if (colors.length < 1 || colors.length > 256) throw new Error("Palette must contain between 1 and 256 colors");
  colors.forEach((value) => parsePaletteColor(value));
}

function parsePaletteColor(value: string) {
  const color = parseHexColor(value);
  if (!color) throw new Error(`Invalid palette color: ${value}`);
  return color;
}

function nearestPaletteColor(source: RGBColor, palette: readonly string[]) {
  let best: RGBColor | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const value of palette) {
    const candidate = parseHexColor(value);
    if (!candidate) continue;
    const red = candidate.r - source.r;
    const green = candidate.g - source.g;
    const blue = candidate.b - source.b;
    const distance = red * red * 0.3 + green * green * 0.59 + blue * blue * 0.11;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function nearestPaletteIndex(source: RGBColor, palette: readonly string[], transparentIndex: number) {
  let bestIndex = transparentIndex;
  let bestDistance = Number.POSITIVE_INFINITY;
  palette.forEach((value, index) => {
    const candidate = parseHexColor(value);
    if (!candidate || candidate.a === 0 || index === transparentIndex) return;
    const red = candidate.r - source.r;
    const green = candidate.g - source.g;
    const blue = candidate.b - source.b;
    const alpha = candidate.a - source.a;
    const distance = red * red * 0.3 + green * green * 0.59 + blue * blue * 0.11 + alpha * alpha;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function rgbToHsl(color: RGBColor) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / delta + 2) / 6;
    else hue = ((r - g) / delta + 4) / 6;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return {h: hue, s: saturation, l: lightness};
}

function rgbToHex(r: number, g: number, b: number, a: number) {
  return `#${[r, g, b, a].map((value) => clampByte(value).toString(16).padStart(2, "0")).join("")}`;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}
