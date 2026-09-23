import {validPNGImportDimensions} from "../editor/gameAssets";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface ProjectResponse {
  path: string;
  document: string;
}

export interface PNGResponse {
  name: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export function parseBridgeJSON(payload: string, errorMessage: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    throw new Error(errorMessage);
  }
}

export function parseProjectResponse(payload: string): ProjectResponse {
  const parsed = parseBridgeJSON(payload, "Invalid project response");
  if (!isRecord(parsed) || typeof parsed.path !== "string" || typeof parsed.document !== "string") {
    throw new Error("Invalid project response");
  }
  return {path: parsed.path, document: parsed.document};
}

export function parsePNGResponse(payload: string): PNGResponse {
  return decodePNGResponse(parseBridgeJSON(payload, "Invalid PNG response"));
}

function decodePNGResponse(parsed: unknown): PNGResponse {
  if (!isRecord(parsed) || typeof parsed.name !== "string" || typeof parsed.width !== "number" || typeof parsed.height !== "number" || typeof parsed.pixels !== "string") {
    throw new Error("Invalid PNG response");
  }
  const {name, width, height, pixels: encodedPixels} = parsed;
  if (!validPNGImportDimensions(width, height)) {
    throw new Error("Invalid PNG response");
  }
  let binary: string;
  try {
    binary = atob(encodedPixels);
  } catch {
    throw new Error("Invalid PNG response");
  }
  if (binary.length !== parsed.width * parsed.height * 4) throw new Error("Invalid PNG response");
  const pixels = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index += 1) pixels[index] = binary.charCodeAt(index);
  return {name, width, height, pixels};
}

export function parsePNGSequenceResponse(payload: string): PNGResponse[] {
  const parsed = parseBridgeJSON(payload, "Invalid PNG sequence response");
  if (!isRecord(parsed) || !Array.isArray(parsed.frames) || parsed.frames.length === 0 || parsed.frames.length > 4096) {
    throw new Error("Invalid PNG sequence response");
  }
  return parsed.frames.map(decodePNGResponse);
}
