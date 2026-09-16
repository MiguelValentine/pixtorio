import {assignColorProfile, type ColorProfile, type PixelDocument} from "./document";
import {parseHexColor, refreshIndexedDocument, refreshTilemapCaches} from "./colorModes";

type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

const srgbToXYZ: Matrix3 = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.0721750,
  0.0193339, 0.1191920, 0.9503041,
];
const displayP3ToXYZ: Matrix3 = [
  0.48657095, 0.26566769, 0.19821729,
  0.22897456, 0.69173852, 0.07928691,
  0.00000000, 0.04511338, 1.04394437,
];
const xyzToSRGB: Matrix3 = [
  3.2404542, -1.5371385, -0.4985314,
  -0.9692660, 1.8760108, 0.0415560,
  0.0556434, -0.2040259, 1.0572252,
];
const xyzToDisplayP3: Matrix3 = [
  2.49349691, -0.93138362, -0.40271078,
  -0.82948897, 1.76266406, 0.02362469,
  0.03584583, -0.07617239, 0.95688452,
];

export type ConvertibleColorProfile = "srgb" | "display-p3";

export function canConvertColorProfile(profile: ColorProfile): profile is ColorProfile & {type: ConvertibleColorProfile} {
  return profile.type === "srgb" || profile.type === "display-p3";
}

export function assignDocumentColorProfile(document: PixelDocument, profile: ColorProfile) {
  return assignColorProfile(document, profile);
}

/** Converts encoded RGB values while preserving their visual D65 color. */
export function convertRGBColorProfile(
  color: readonly [number, number, number, number?],
  source: ConvertibleColorProfile,
  target: ConvertibleColorProfile,
): [number, number, number, number] {
  const alpha = clampByte(color[3] ?? 255);
  if (source === target) return [clampByte(color[0]), clampByte(color[1]), clampByte(color[2]), alpha];
  const linear = [decodeTransfer(color[0] / 255), decodeTransfer(color[1] / 255), decodeTransfer(color[2] / 255)] as const;
  const xyz = multiply(source === "srgb" ? srgbToXYZ : displayP3ToXYZ, linear);
  const output = multiply(target === "srgb" ? xyzToSRGB : xyzToDisplayP3, xyz);
  return [
    clampByte(encodeTransfer(output[0]) * 255),
    clampByte(encodeTransfer(output[1]) * 255),
    clampByte(encodeTransfer(output[2]) * 255),
    alpha,
  ];
}

export function convertPixelsColorProfileInPlace(
  pixels: Uint8ClampedArray,
  source: ConvertibleColorProfile,
  target: ConvertibleColorProfile,
) {
  if (source === target) return pixels;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const converted = convertRGBColorProfile(
      [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]],
      source,
      target,
    );
    pixels[offset] = converted[0];
    pixels[offset + 1] = converted[1];
    pixels[offset + 2] = converted[2];
  }
  return pixels;
}

export function convertDocumentColorProfile(
  document: PixelDocument,
  target: ColorProfile & {type: ConvertibleColorProfile},
) {
  if (!canConvertColorProfile(document.colorProfile)) {
    throw new Error("Embedded and untagged profiles must be assigned before conversion");
  }
  const source = document.colorProfile.type;
  if (source === target.type) return assignColorProfile(document, target);
  if (document.colorMode === "indexed") {
    document.palette.colors = document.palette.colors.map((value) => {
      const color = parseHexColor(value);
      if (!color) return value;
      const converted = convertRGBColorProfile([color.r, color.g, color.b, color.a], source, target.type);
      return rgbaHex(converted);
    });
    assignColorProfile(document, target);
    refreshIndexedDocument(document);
    return true;
  }

  const convertedLinks = new Set<string>();
  for (const cel of Object.values(document.cels)) {
    if (convertedLinks.has(cel.linkId)) continue;
    convertedLinks.add(cel.linkId);
    convertPixelsColorProfileInPlace(cel.pixels, source, target.type);
  }
  for (const tileset of document.tilesets) {
    for (const tile of tileset.tiles) convertPixelsColorProfileInPlace(tile.pixels, source, target.type);
  }
  assignColorProfile(document, target);
  refreshTilemapCaches(document);
  return true;
}

function multiply(matrix: Matrix3, vector: readonly [number, number, number]) {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ] as const;
}

function decodeTransfer(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encodeTransfer(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

function rgbaHex(color: readonly [number, number, number, number]) {
  return `#${color.map((channel) => clampByte(channel).toString(16).padStart(2, "0")).join("")}`;
}
