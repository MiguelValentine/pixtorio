import {describe, expect, it} from "vitest";

import {setPixel} from "./pixels";
import {
  beginTool,
  createBitmapBrush,
  drawBitmapBrushStroke,
  drawPolylineOutline,
  moveTool,
  stampPatternBrush,
  type PatternAlignment,
  type PatternBrush,
  type RGBA,
  type ToolContext,
} from "./tools";

const RED: RGBA = [240, 32, 48, 255];
const BLUE: RGBA = [32, 96, 240, 255];
const GREEN: RGBA = [32, 200, 96, 255];

function pixelAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4;
  return Array.from(pixels.subarray(offset, offset + 4));
}

function pattern(colors: readonly RGBA[], sourceX = 0, sourceY = 0): PatternBrush {
  const pixels = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((color, index) => pixels.set(color, index * 4));
  return {width: colors.length, height: 1, pixels, sourceX, sourceY};
}

function context(width = 8, height = 2, color: RGBA = [...RED]): ToolContext {
  return {pixels: new Uint8ClampedArray(width * height * 4), width, height, color};
}

describe("pattern brush kernel", () => {
  it.each([
    ["source", [RED, BLUE, RED, BLUE]],
    ["destination", [RED, BLUE, BLUE, RED]],
  ] as Array<[PatternAlignment, RGBA[]]>)
    ("aligns a bitmap footprint per %s semantics", (alignment, expected) => {
      const target = new Uint8ClampedArray(8 * 1 * 4);
      const footprint = createBitmapBrush(2, 1, [1, 1], 0, 0);
      const texture = pattern([RED, BLUE]);

      drawBitmapBrushStroke(target, 8, 1, [{x: 1, y: 0}, {x: 4, y: 0}], RED, footprint, {
        spacing: 3,
        patternBrush: texture,
        patternAlignment: alignment,
      });

      expect(pixelAt(target, 8, 1, 0)).toEqual([...expected[0]]);
      expect(pixelAt(target, 8, 2, 0)).toEqual([...expected[1]]);
      expect(pixelAt(target, 8, 4, 0)).toEqual([...expected[2]]);
      expect(pixelAt(target, 8, 5, 0)).toEqual([...expected[3]]);
    });

  it("anchors canvas alignment at the pattern source origin", () => {
    const target = new Uint8ClampedArray(6 * 1 * 4);
    const texture = pattern([RED, BLUE], 1, 0);

    stampPatternBrush(target, 6, 1, {x: 1, y: 0}, RED, texture, {patternAlignment: "canvas"});
    stampPatternBrush(target, 6, 1, {x: 2, y: 0}, RED, texture, {patternAlignment: "canvas"});

    expect(pixelAt(target, 6, 1, 0)).toEqual([...RED]);
    expect(pixelAt(target, 6, 2, 0)).toEqual([...BLUE]);
  });

  it("uses floor modulo for negative pattern origins and leaves transparent texels untouched", () => {
    const target = new Uint8ClampedArray(2 * 1 * 4);
    setPixel(target, 2, 1, 0, 0, GREEN);
    setPixel(target, 2, 1, 1, 0, GREEN);
    const texture = pattern([[12, 34, 56, 0], RED]);

    stampPatternBrush(target, 2, 1, {x: 0, y: 0}, RED, texture, {patternAlignment: "canvas", patternOrigin: {x: -1, y: 0}});
    stampPatternBrush(target, 2, 1, {x: 1, y: 0}, RED, texture, {patternAlignment: "canvas", patternOrigin: {x: -1, y: 0}});

    expect(pixelAt(target, 2, 0, 0)).toEqual([...RED]);
    expect(pixelAt(target, 2, 1, 0)).toEqual([...GREEN]);

    const transparent = pattern([[12, 34, 56, 0]]);
    setPixel(target, 2, 1, 0, 0, GREEN);
    stampPatternBrush(target, 2, 1, {x: 0, y: 0}, RED, transparent);
    expect(pixelAt(target, 2, 0, 0)).toEqual([...GREEN]);
  });

  it("multiplies pattern alpha by color alpha and snapshots aliased sources", () => {
    const target = new Uint8ClampedArray(2 * 1 * 4);
    const texture: PatternBrush = {width: 1, height: 1, pixels: target.subarray(0, 4), sourceX: 0, sourceY: 0};
    texture.pixels.set([120, 80, 40, 255]);

    stampPatternBrush(target, 2, 1, {x: 1, y: 0}, [0, 0, 0, 128], texture, {brushSize: 2});

    expect(pixelAt(target, 2, 0, 0)).toEqual([120, 80, 40, 128]);
    expect(pixelAt(target, 2, 1, 0)).toEqual([120, 80, 40, 128]);

    const alphaTexture = pattern([[120, 80, 40, 128]]);
    stampPatternBrush(target, 2, 1, {x: 1, y: 0}, [0, 0, 0, 128], alphaTexture);
    expect(pixelAt(target, 2, 1, 0)).toEqual([120, 80, 40, 64]);
  });

  it("routes pencil patterns, ignores them for erasing, and keeps destination previews stable", () => {
    const pencil = context(8, 2, RED);
    pencil.patternBrush = pattern([RED, BLUE]);
    pencil.patternAlignment = "destination";
    pencil.pixelPerfect = true;
    const gesture = beginTool(pencil, "pencil", {x: 1, y: 0});
    moveTool(pencil, gesture, {x: 4, y: 0});
    moveTool(pencil, gesture, {x: 1, y: 0});
    expect(pixelAt(pencil.pixels, 8, 1, 0)).toEqual([...RED]);
    expect(pixelAt(pencil.pixels, 8, 2, 0)).toEqual([...BLUE]);

    const eraser = context(4, 1, RED);
    eraser.pixels.fill(255);
    eraser.patternBrush = pattern([BLUE]);
    beginTool(eraser, "eraser", {x: 1, y: 0});
    expect(pixelAt(eraser.pixels, 4, 1, 0)).toEqual([0, 0, 0, 0]);
  });

  it("accepts pattern settings on staged polyline helpers", () => {
    const target = new Uint8ClampedArray(5 * 1 * 4);
    const texture = pattern([RED, BLUE]);
    drawPolylineOutline(target, 5, 1, [{x: 0, y: 0}, {x: 3, y: 0}], RED, 1, "square", false, {
      patternBrush: texture,
      patternAlignment: "canvas",
    });
    expect(pixelAt(target, 5, 0, 0)).toEqual([...RED]);
    expect(pixelAt(target, 5, 1, 0)).toEqual([...BLUE]);
    expect(pixelAt(target, 5, 2, 0)).toEqual([...RED]);
  });

  it("invalidates the full rotated bitmap footprint for rectangle previews", () => {
    const target = context(12, 12, RED);
    target.brushSize = 1;
    target.bitmapBrush = createBitmapBrush(7, 5, new Array(35).fill(1), 3, 2);
    target.bitmapBrushPrepared = true;
    target.patternBrush = pattern([RED, BLUE]);
    const gesture = beginTool(target, "rectangle", {x: 5, y: 5});
    const result = moveTool(target, gesture, {x: 6, y: 6});
    expect(result.dirtyBounds).toEqual({x: 2, y: 2, width: 8, height: 8});
  });
});
