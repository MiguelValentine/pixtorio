import {defaultPalette as builtInColors} from "./document";

export interface DefaultPalette {
  name: string;
  colors: string[];
  transparentIndex: number;
}

type DefaultPaletteReadStorage = Pick<Storage, "getItem">;
type DefaultPaletteWriteStorage = Pick<Storage, "setItem">;
type DefaultPaletteResetStorage = Pick<Storage, "removeItem">;

const defaultPaletteStorageKey = "pixtorio-default-palette";
const paletteColorPattern = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

function builtInDefaultPalette(): DefaultPalette {
  return {
    name: "Default",
    colors: builtInColors.map(normalizePaletteColor),
    transparentIndex: 0,
  };
}

function normalizePaletteColor(value: string): string {
  const lower = value.toLowerCase();
  return lower.length === 7 ? `${lower}ff` : lower;
}

function normalizeDefaultPalette(value: unknown): DefaultPalette | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as {name?: unknown; colors?: unknown; transparentIndex?: unknown};
  if (typeof candidate.name !== "string" || !Array.isArray(candidate.colors)) return null;
  const colors = candidate.colors as unknown[];
  if (colors.length < 1 || colors.length > 256) return null;
  if (!colors.every((color) => typeof color === "string" && paletteColorPattern.test(color))) return null;
  const transparentIndex = candidate.transparentIndex;
  if (typeof transparentIndex !== "number"
    || !Number.isInteger(transparentIndex)
    || transparentIndex < 0
    || transparentIndex >= colors.length) return null;

  return {
    name: candidate.name,
    colors: colors.map((color) => normalizePaletteColor(color as string)),
    transparentIndex,
  };
}

export function readDefaultPalette(storage: DefaultPaletteReadStorage): DefaultPalette {
  let raw: string | null;
  try {
    raw = storage.getItem(defaultPaletteStorageKey);
  } catch {
    return builtInDefaultPalette();
  }

  if (raw === null) return builtInDefaultPalette();
  try {
    return normalizeDefaultPalette(JSON.parse(raw)) ?? builtInDefaultPalette();
  } catch {
    return builtInDefaultPalette();
  }
}

export function saveDefaultPalette(storage: DefaultPaletteWriteStorage, palette: DefaultPalette): void {
  const normalized = normalizeDefaultPalette(palette);
  if (!normalized) throw new Error("Invalid default palette");
  storage.setItem(defaultPaletteStorageKey, JSON.stringify(normalized));
}

export function resetDefaultPalette(storage: DefaultPaletteResetStorage): void {
  storage.removeItem(defaultPaletteStorageKey);
}
