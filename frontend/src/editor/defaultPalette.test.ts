import {describe, expect, it} from "vitest";
import {defaultPalette as builtInColors} from "./document";
import {readDefaultPalette, resetDefaultPalette, saveDefaultPalette, type DefaultPalette} from "./defaultPalette";

function createStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, nextValue: string) => { value = nextValue; },
    removeItem: () => { value = null; },
    value: () => value,
  };
}

describe("default palette storage", () => {
  it("round-trips alpha colors and the transparent index", () => {
    const storage = createStorage();
    const palette: DefaultPalette = {
      name: "Warm",
      colors: ["#ABCDEF", "#12345678"],
      transparentIndex: 1,
    };

    saveDefaultPalette(storage, palette);

    expect(readDefaultPalette(storage)).toEqual({
      name: "Warm",
      colors: ["#abcdefff", "#12345678"],
      transparentIndex: 1,
    });
    expect(palette.colors).toEqual(["#ABCDEF", "#12345678"]);
  });

  it.each([
    null,
    "not json",
    JSON.stringify(null),
    JSON.stringify({name: "Broken", colors: [], transparentIndex: 0}),
    JSON.stringify({name: 42, colors: ["#000000"], transparentIndex: 0}),
    JSON.stringify({name: "Broken", colors: ["#12345"], transparentIndex: 0}),
    JSON.stringify({name: "Broken", colors: ["#000000"], transparentIndex: 1}),
  ])("falls back to the built-in palette for invalid stored data: %s", (stored) => {
    const storage = createStorage(stored);

    expect(readDefaultPalette(storage)).toEqual({
      name: "Default",
      colors: builtInColors,
      transparentIndex: 0,
    });
  });

  it("returns independent color arrays", () => {
    const storage = createStorage();
    const first = readDefaultPalette(storage);
    first.colors[0] = "#000000ff";
    const second = readDefaultPalette(storage);

    expect(second.colors).toEqual(builtInColors);
    expect(second.colors).not.toBe(first.colors);
  });

  it.each([
    [{name: 1, colors: ["#000000"], transparentIndex: 0}, "name"],
    [{name: "Bad", colors: [], transparentIndex: 0}, "empty colors"],
    [{name: "Bad", colors: new Array(257).fill("#000000"), transparentIndex: 0}, "too many colors"],
    [{name: "Bad", colors: ["#123"], transparentIndex: 0}, "short color"],
    [{name: "Bad", colors: ["123456"], transparentIndex: 0}, "missing hash"],
    [{name: "Bad", colors: ["#123456"], transparentIndex: 1}, "out of range index"],
    [{name: "Bad", colors: ["#123456"], transparentIndex: 0.5}, "fractional index"],
  ] as const)("rejects invalid palettes on save: %s", (palette, _label) => {
    expect(() => saveDefaultPalette(createStorage(), palette as never)).toThrow("Invalid default palette");
  });

  it("resets the stored palette", () => {
    const storage = createStorage();
    saveDefaultPalette(storage, {name: "Custom", colors: ["#abcdef"], transparentIndex: 0});

    resetDefaultPalette(storage);

    expect(readDefaultPalette(storage)).toEqual({
      name: "Default",
      colors: builtInColors,
      transparentIndex: 0,
    });
  });

  it("falls back when reading fails and propagates write and remove errors", () => {
    const error = new Error("storage failure");
    const readFailure = {getItem: () => { throw error; }};
    expect(readDefaultPalette(readFailure)).toEqual({name: "Default", colors: builtInColors, transparentIndex: 0});

    const writeFailure = {setItem: () => { throw error; }};
    expect(() => saveDefaultPalette(writeFailure, {name: "Custom", colors: ["#000000"], transparentIndex: 0})).toThrow(error);

    const removeFailure = {removeItem: () => { throw error; }};
    expect(() => resetDefaultPalette(removeFailure)).toThrow(error);
  });
});
