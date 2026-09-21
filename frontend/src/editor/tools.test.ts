import {describe, expect, it} from "vitest";

import {setPixel} from "./pixels";
import {
  beginTool,
  constrainPointToSquare,
  createBitmapBrush,
  createShapeBitmapBrush,
  drawLinearGradient,
  drawBitmapBrushStroke,
  drawEllipseOutline,
  drawPolygonOutline,
  drawPolylineOutline,
  drawQuadraticBezier,
  drawRectangle,
  blurPixelsInPlace,
  jumblePixelsInPlace,
  finishTool,
  floodFill,
  applyInkMode,
  moveTool,
  normalizeBrushSize,
  normalizePressure,
  pixelPerfectStroke,
  pressureToBrushSettings,
  pressureToBrushSize,
  pressureToOpacity,
  interpolateRGBA,
  normalizeBrushVelocity,
  pointerVelocity,
  resolveBrushDynamics,
  stabilizeStroke,
  rasterizeQuadraticBezier,
  replaceColor,
  resizeBitmapBrush,
  rotateBitmapBrush,
  resolveBrushSettings,
  simplifyPixelPerfectStroke,
  stampBitmapBrush,
  traceFloodBoundary,
  toolNames,
  toolShortcuts,
  type RGBA,
  type ToolContext,
} from "./tools";

const RED: RGBA = [255, 32, 48, 255];
const BLUE: RGBA = [32, 96, 255, 192];
const GREEN: RGBA = [32, 192, 96, 255];
const BACKGROUND: RGBA = [16, 24, 32, 255];

function createContext(width = 8, height = 8, color: RGBA = RED): ToolContext {
  return {
    pixels: new Uint8ClampedArray(width * height * 4),
    width,
    height,
    color,
  };
}

function pixelAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return Array.from(pixels.subarray(index, index + 4));
}

function fillPixels(context: ToolContext, color: RGBA) {
  for (let y = 0; y < context.height; y += 1) {
    for (let x = 0; x < context.width; x += 1) {
      setPixel(context.pixels, context.width, context.height, x, y, color);
    }
  }
}

function countPixels(pixels: Uint8ClampedArray, width: number, height: number, color: RGBA) {
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixelAt(pixels, width, x, y).every((channel, index) => channel === color[index])) count += 1;
    }
  }
  return count;
}

describe("tool metadata", () => {
  it("provides names and keyboard shortcuts for every tool", () => {
    expect(Object.keys(toolNames)).toEqual([
      "pencil",
      "eraser",
      "eyedropper",
      "zoom",
      "hand",
      "move",
      "line",
      "rectangle",
      "ellipse",
      "curve",
      "polyline",
      "polygon",
      "fill",
      "gradient",
      "spray",
      "blur",
      "jumble",
      "contour",
      "replace-color",
      "selection",
      "transform",
      "crop",
      "slice",
      "text",
    ]);
    expect(toolShortcuts).toEqual({
      p: "pencil",
      e: "eraser",
      i: "eyedropper",
      z: "zoom",
      h: "hand",
      v: "move",
      l: "line",
      r: "rectangle",
      o: "ellipse",
      q: "curve",
      n: "polyline",
      y: "polygon",
      g: "fill",
      d: "gradient",
      s: "spray",
      b: "blur",
      j: "jumble",
      u: "contour",
      k: "replace-color",
      m: "selection",
      t: "transform",
      c: "crop",
      a: "slice",
      x: "text",
    });
  });
});

describe("tiled brush wrapping", () => {
  it("wraps bitmap pixels across enabled document edges", () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    const brush = createBitmapBrush(3, 1, [1, 1, 1], 1, 0);
    stampBitmapBrush(pixels, 4, 3, {x: 0, y: 1}, [9, 8, 7, 255], brush, true, false);
    expect([0, 1, 2, 3].map((x) => pixels[(1 * 4 + x) * 4 + 3])).toEqual([255, 255, 0, 255]);
  });
});

describe("gradient alpha", () => {
  it("interpolates independent foreground and background alpha values", () => {
    const context = createContext(3, 1, [255, 0, 0, 255]);
    context.secondaryColor = [0, 0, 255, 0];

    const gesture = beginTool(context, "gradient", {x: 0, y: 0});
    moveTool(context, gesture, {x: 2, y: 0});

    expect(pixelAt(context.pixels, 3, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(context.pixels, 3, 1, 0)).toEqual([128, 0, 128, 128]);
    expect(pixelAt(context.pixels, 3, 2, 0)).toEqual([0, 0, 255, 0]);
  });
});

describe("shape constraints", () => {
  it.each([
    [{x: 7, y: 5}, {x: 7, y: 7}],
    [{x: 1, y: 5}, {x: 1, y: 7}],
    [{x: 7, y: 1}, {x: 7, y: 1}],
    [{x: 1, y: 1}, {x: 1, y: 1}],
    [{x: 4, y: 7}, {x: 7, y: 7}],
    [{x: 4, y: 4}, {x: 4, y: 4}],
  ])("constrains %o to a square from the drag origin", (point, expected) => {
    expect(constrainPointToSquare({x: 4, y: 4}, point)).toEqual(expected);
  });
});

describe("pencil tool", () => {
  it("starts a pixel and rasterizes a connected stroke on move", () => {
    const context = createContext();
    const gesture = beginTool(context, "pencil", {x: 1, y: 1});

    expect(gesture.changed).toBe(true);
    expect(pixelAt(context.pixels, context.width, 1, 1)).toEqual([...RED]);

    const result = moveTool(context, gesture, {x: 6, y: 4});

    expect(result.changed).toBe(true);
    expect(gesture.last).toEqual({x: 6, y: 4});
    expect(pixelAt(context.pixels, context.width, 2, 2)).toEqual([...RED]);
    expect(pixelAt(context.pixels, context.width, 3, 2)).toEqual([...RED]);
    expect(pixelAt(context.pixels, context.width, 4, 3)).toEqual([...RED]);
    expect(pixelAt(context.pixels, context.width, 5, 3)).toEqual([...RED]);
    expect(pixelAt(context.pixels, context.width, 6, 4)).toEqual([...RED]);
  });

  it("replaces the prior preview while drawing a Shift-constrained line", () => {
    const context = createContext();
    const gesture = beginTool(context, "pencil", {x: 1, y: 1}, true);

    moveTool(context, gesture, {x: 6, y: 1});
    moveTool(context, gesture, {x: 1, y: 6});

    expect(pixelAt(context.pixels, context.width, 5, 1)).toEqual([0, 0, 0, 0]);
    for (let y = 1; y <= 6; y += 1) {
      expect(pixelAt(context.pixels, context.width, 1, y)).toEqual([...RED]);
    }
  });

  it("supports odd and even square brush sizes with a stable centered footprint", () => {
    const evenContext = createContext(6, 6, RED);
    evenContext.brushSize = 2;
    evenContext.brushShape = "square";
    beginTool(evenContext, "pencil", {x: 3, y: 3});

    for (const point of [
      [2, 2], [3, 2], [2, 3], [3, 3],
    ] as Array<[number, number]>) {
      expect(pixelAt(evenContext.pixels, evenContext.width, point[0], point[1])).toEqual([...RED]);
    }
    expect(countPixels(evenContext.pixels, evenContext.width, evenContext.height, RED)).toBe(4);

    const oddContext = createContext(7, 7, RED);
    oddContext.brushSize = 3;
    beginTool(oddContext, "pencil", {x: 3, y: 3});

    for (let y = 2; y <= 4; y += 1) {
      for (let x = 2; x <= 4; x += 1) {
        expect(pixelAt(oddContext.pixels, oddContext.width, x, y)).toEqual([...RED]);
      }
    }
    expect(countPixels(oddContext.pixels, oddContext.width, oddContext.height, RED)).toBe(9);
  });

  it("uses a discrete circle mask and clips the footprint at the canvas boundary", () => {
    const context = createContext(5, 5, RED);
    context.brushSize = 3;
    context.brushShape = "circle";
    beginTool(context, "pencil", {x: 0, y: 0});

    expect(pixelAt(context.pixels, context.width, 0, 0)).toEqual([...RED]);
    expect(pixelAt(context.pixels, context.width, 1, 0)).toEqual([...RED]);
    expect(pixelAt(context.pixels, context.width, 0, 1)).toEqual([...RED]);
    expect(pixelAt(context.pixels, context.width, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(countPixels(context.pixels, context.width, context.height, RED)).toBe(3);
  });

  it("scales cross and diamond procedural masks with the configured size", () => {
    const cross = createContext(9, 9);
    cross.brushSize = 3;
    cross.brushShape = "cross";
    beginTool(cross, "pencil", {x: 4, y: 4});

    for (const point of [[4, 3], [3, 4], [4, 4], [5, 4], [4, 5]] as Array<[number, number]>) {
      expect(pixelAt(cross.pixels, cross.width, point[0], point[1])).toEqual([...RED]);
    }
    expect(countPixels(cross.pixels, cross.width, cross.height, RED)).toBe(5);

    const largerCross = createContext(11, 11);
    largerCross.brushSize = 5;
    largerCross.brushShape = "cross";
    beginTool(largerCross, "pencil", {x: 5, y: 5});
    expect(countPixels(largerCross.pixels, largerCross.width, largerCross.height, RED)).toBe(9);

    const diamond = createContext(9, 9);
    diamond.brushSize = 5;
    diamond.brushShape = "diamond";
    beginTool(diamond, "pencil", {x: 4, y: 4});

    for (let y = 2; y <= 6; y += 1) {
      const halfWidth = 2 - Math.abs(y - 4);
      for (let x = 2; x <= 6; x += 1) {
        const expected = Math.abs(x - 4) <= halfWidth;
        expect(pixelAt(diamond.pixels, diamond.width, x, y)).toEqual(expected ? [...RED] : [0, 0, 0, 0]);
      }
    }
    expect(countPixels(diamond.pixels, diamond.width, diamond.height, RED)).toBe(13);
  });

  it("spaces square and circle procedural brush stamps while preserving the endpoint", () => {
    for (const brushShape of ["square", "circle"] as const) {
      const context = createContext(18, 9);
      context.brushSize = 3;
      context.brushShape = brushShape;
      context.brushSpacing = 6;

      const gesture = beginTool(context, "pencil", {x: 2, y: 4});
      moveTool(context, gesture, {x: 13, y: 4});
      finishTool(context, gesture, {x: 13, y: 4});

      for (const x of [2, 8, 13]) {
        expect(pixelAt(context.pixels, context.width, x, 4)).toEqual([...RED]);
      }
      for (const x of [4, 5, 6, 10, 11]) {
        expect(pixelAt(context.pixels, context.width, x, 4)).toEqual([0, 0, 0, 0]);
      }
    }
  });

  it("keeps a wider continuous stroke connected across movement points", () => {
    const context = createContext(9, 7, RED);
    context.brushSize = 3;
    const gesture = beginTool(context, "pencil", {x: 1, y: 3});

    moveTool(context, gesture, {x: 7, y: 3});

    for (let y = 2; y <= 4; y += 1) {
      for (let x = 0; x <= 8; x += 1) {
        expect(pixelAt(context.pixels, context.width, x, y)).toEqual([...RED]);
      }
    }
    expect(pixelAt(context.pixels, context.width, 4, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe("shape tools with bitmap-sized brushes", () => {
  it("keeps both vertical sides closed for a size-10 square rectangle", () => {
    const context = createContext(40, 40);
    context.brushSize = 10;
    context.brushShape = "square";
    context.bitmapBrush = createShapeBitmapBrush("square", 10);
    context.bitmapBrushPrepared = true;

    drawRectangle(
      context.pixels,
      context.width,
      context.height,
      {x: 10, y: 10},
      {x: 30, y: 30},
      RED,
      10,
      "square",
      "outline",
      context,
    );

    for (let y = 15; y <= 25; y += 1) {
      expect(pixelAt(context.pixels, context.width, 10, y)).toEqual([...RED]);
      expect(pixelAt(context.pixels, context.width, 30, y)).toEqual([...RED]);
    }
  });
});

describe("eraser tool", () => {
  it("clears the starting pixel and the connected stroke to transparency", () => {
    const context = createContext(7, 3);
    fillPixels(context, RED);
    const gesture = beginTool(context, "eraser", {x: 1, y: 1});

    expect(gesture.changed).toBe(true);
    moveTool(context, gesture, {x: 5, y: 1});

    for (let x = 1; x <= 5; x += 1) {
      expect(pixelAt(context.pixels, context.width, x, 1)).toEqual([0, 0, 0, 0]);
    }
    expect(pixelAt(context.pixels, context.width, 0, 1)).toEqual([...RED]);
    expect(pixelAt(context.pixels, context.width, 6, 1)).toEqual([...RED]);
  });

  it("clears the configured circle footprint without changing pixels outside it", () => {
    const context = createContext(7, 7);
    fillPixels(context, RED);
    context.brushSize = 3;
    context.brushShape = "circle";
    beginTool(context, "eraser", {x: 3, y: 3});

    for (const point of [[3, 3], [2, 3], [4, 3], [3, 2], [3, 4]] as Array<[number, number]>) {
      expect(pixelAt(context.pixels, context.width, point[0], point[1])).toEqual([0, 0, 0, 0]);
    }
    expect(pixelAt(context.pixels, context.width, 2, 2)).toEqual([...RED]);
  });
});

describe("eyedropper tool", () => {
  it("returns an in-bounds pixel without changing the buffer", () => {
    const context = createContext(3, 2);
    setPixel(context.pixels, context.width, context.height, 2, 1, BLUE);
    const before = context.pixels.slice();

    const result = beginTool(context, "eyedropper", {x: 2, y: 1});

    expect(result.changed).toBe(false);
    expect(result.pickedColor).toEqual([...BLUE]);
    expect(Array.from(context.pixels)).toEqual(Array.from(before));
  });

  it("returns no color for an out-of-bounds point", () => {
    const context = createContext(3, 2);
    const before = context.pixels.slice();

    const result = beginTool(context, "eyedropper", {x: 3, y: 1});

    expect(result.changed).toBe(false);
    expect(result.pickedColor).toBeUndefined();
    expect(Array.from(context.pixels)).toEqual(Array.from(before));
  });
});

describe("line tool", () => {
  it("restores the original buffer before drawing each new preview", () => {
    const context = createContext(7, 7, BLUE);
    fillPixels(context, BACKGROUND);
    const before = context.pixels.slice();
    const gesture = beginTool(context, "line", {x: 1, y: 1});

    const preview = moveTool(context, gesture, {x: 5, y: 1});
    expect(preview.dirtyBounds).toEqual({x: 0, y: 0, width: 7, height: 7});
    expect(pixelAt(context.pixels, context.width, 5, 1)).toEqual([...BLUE]);

    moveTool(context, gesture, {x: 1, y: 5});

    expect(pixelAt(context.pixels, context.width, 1, 5)).toEqual([...BLUE]);
    expect(pixelAt(context.pixels, context.width, 5, 1)).toEqual([...BACKGROUND]);
    expect(pixelAt(context.pixels, context.width, 5, 5)).toEqual([...BACKGROUND]);
    expect(Array.from(gesture.before)).toEqual(Array.from(before));
  });

  it("draws a square brush line and restores the snapshot for each preview", () => {
    const context = createContext(8, 8, BLUE);
    context.brushSize = 2;
    const gesture = beginTool(context, "line", {x: 2, y: 2});

    moveTool(context, gesture, {x: 5, y: 2});

    for (let y = 1; y <= 2; y += 1) {
      for (let x = 1; x <= 5; x += 1) {
        expect(pixelAt(context.pixels, context.width, x, y)).toEqual([...BLUE]);
      }
    }
    expect(pixelAt(context.pixels, context.width, 6, 2)).toEqual([0, 0, 0, 0]);
  });
});

describe("rectangle tool", () => {
  it("draws a normalized border when dragged in reverse", () => {
    const context = createContext(6, 5, GREEN);
    const gesture = beginTool(context, "rectangle", {x: 4, y: 3});

    const result = moveTool(context, gesture, {x: 1, y: 1});

    expect(result.changed).toBe(true);
    const border: Array<[number, number]> = [
      [1, 1], [2, 1], [3, 1], [4, 1],
      [1, 2], [4, 2],
      [1, 3], [2, 3], [3, 3], [4, 3],
    ];
    for (const [x, y] of border) {
      expect(pixelAt(context.pixels, context.width, x, y)).toEqual([...GREEN]);
    }
    expect(pixelAt(context.pixels, context.width, 2, 2)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(context.pixels, context.width, 3, 2)).toEqual([0, 0, 0, 0]);
  });

  it("draws a thick rectangle with the configured brush and clips outside pixels", () => {
    const context = createContext(6, 5, GREEN);
    context.brushSize = 2;
    const gesture = beginTool(context, "rectangle", {x: -1, y: -1});

    moveTool(context, gesture, {x: 3, y: 3});

    for (let y = 0; y <= 3; y += 1) {
      for (let x = 0; x <= 3; x += 1) {
        const expectedBorder = x >= 2 || y >= 2;
        expect(pixelAt(context.pixels, context.width, x, y)).toEqual(expectedBorder ? [...GREEN] : [0, 0, 0, 0]);
      }
    }
  });
});

describe("brush settings", () => {
  it("defaults to a one-pixel square and clamps invalid sizes", () => {
    expect(resolveBrushSettings({})).toEqual({size: 1, shape: "square"});
    expect(normalizeBrushSize(0)).toBe(1);
    expect(normalizeBrushSize(65)).toBe(64);
    expect(normalizeBrushSize(2.4)).toBe(2);
    expect(normalizeBrushSize(2.6)).toBe(3);
    expect(normalizeBrushSize(Number.NaN)).toBe(1);
    expect(resolveBrushSettings({brushSize: 4, brushShape: "circle"})).toEqual({size: 4, shape: "circle"});
    expect(resolveBrushSettings({brushSize: 4, brushShape: "triangle" as "square"})).toEqual({size: 4, shape: "square"});
  });
});

describe("floodFill", () => {
  it("fills a bounded region without crossing its boundary", () => {
    const context = createContext(5, 5);
    fillPixels(context, RED);
    for (let x = 0; x < context.width; x += 1) {
      setPixel(context.pixels, context.width, context.height, x, 0, BLUE);
      setPixel(context.pixels, context.width, context.height, x, context.height - 1, BLUE);
    }
    for (let y = 0; y < context.height; y += 1) {
      setPixel(context.pixels, context.width, context.height, 0, y, BLUE);
      setPixel(context.pixels, context.width, context.height, context.width - 1, y, BLUE);
    }

    expect(floodFill(context, {x: 2, y: 2}, GREEN)).toBe(true);

    for (let y = 1; y < context.height - 1; y += 1) {
      for (let x = 1; x < context.width - 1; x += 1) {
        expect(pixelAt(context.pixels, context.width, x, y)).toEqual([...GREEN]);
      }
    }
    for (let x = 0; x < context.width; x += 1) {
      expect(pixelAt(context.pixels, context.width, x, 0)).toEqual([...BLUE]);
      expect(pixelAt(context.pixels, context.width, x, context.height - 1)).toEqual([...BLUE]);
    }
    for (let y = 0; y < context.height; y += 1) {
      expect(pixelAt(context.pixels, context.width, 0, y)).toEqual([...BLUE]);
      expect(pixelAt(context.pixels, context.width, context.width - 1, y)).toEqual([...BLUE]);
    }
  });

  it("rejects points outside the canvas and preserves the buffer", () => {
    const context = createContext(3, 2);
    fillPixels(context, RED);
    const before = context.pixels.slice();

    for (const point of [{x: -1, y: 0}, {x: 3, y: 0}, {x: 0, y: -1}, {x: 0, y: 2}]) {
      expect(floodFill(context, point, BLUE)).toBe(false);
    }
    expect(Array.from(context.pixels)).toEqual(Array.from(before));
  });

  it("returns false and leaves pixels unchanged when colors are equal", () => {
    const context = createContext(3, 2, RED);
    fillPixels(context, RED);
    const before = context.pixels.slice();

    expect(floodFill(context, {x: 1, y: 1}, RED)).toBe(false);
    expect(Array.from(context.pixels)).toEqual(Array.from(before));
  });

  it("fills the inside of a hole without leaking through the ring", () => {
    const context = createContext(9, 9);
    fillPixels(context, RED);
    for (let coordinate = 2; coordinate <= 6; coordinate += 1) {
      setPixel(context.pixels, context.width, context.height, coordinate, 2, BLUE);
      setPixel(context.pixels, context.width, context.height, coordinate, 6, BLUE);
      setPixel(context.pixels, context.width, context.height, 2, coordinate, BLUE);
      setPixel(context.pixels, context.width, context.height, 6, coordinate, BLUE);
    }

    expect(floodFill(context, {x: 4, y: 4}, GREEN)).toBe(true);

    expect(countPixels(context.pixels, context.width, context.height, GREEN)).toBe(9);
    expect(countPixels(context.pixels, context.width, context.height, RED)).toBe(56);
    expect(countPixels(context.pixels, context.width, context.height, BLUE)).toBe(16);
  });

  it("fills a one-pixel-wide region across the canvas", () => {
    const context = createContext(1, 257, RED);
    expect(floodFill(context, {x: 0, y: 128}, BLUE)).toBe(true);
    expect(countPixels(context.pixels, context.width, context.height, BLUE)).toBe(257);
    expect(countPixels(context.pixels, context.width, context.height, RED)).toBe(0);
  });

  it("fills an edge-connected transparent region on a larger canvas", () => {
    const width = 128;
    const height = 96;
    const context = createContext(width, height);
    fillPixels(context, [0, 0, 0, 0]);
    for (let y = 0; y < height; y += 1) {
      setPixel(context.pixels, width, height, 64, y, BLUE);
    }

    expect(floodFill(context, {x: 0, y: 0}, [255, 255, 255, 128])).toBe(true);
    expect(pixelAt(context.pixels, width, 0, 0)).toEqual([255, 255, 255, 128]);
    expect(pixelAt(context.pixels, width, width - 1, height - 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(context.pixels, width, 64, 0)).toEqual([...BLUE]);
    expect(pixelAt(context.pixels, width, 64, height - 1)).toEqual([...BLUE]);
    expect(pixelAt(context.pixels, width, 64, 48)).toEqual([...BLUE]);
    expect(countPixels(context.pixels, width, height, [0, 0, 0, 0])).toBe((width - 65) * height);
  });

  it("only performs a fill on the beginning of a fill gesture", () => {
    const context = createContext(3, 1);
    const gesture = beginTool(context, "fill", {x: 0, y: 0});

    expect(gesture.changed).toBe(true);
    expect(moveTool(context, gesture, {x: 2, y: 0}).changed).toBe(false);
  });
});

describe("finishTool", () => {
  it("does not apply another operation when finishing at the existing endpoint", () => {
    const context = createContext();
    const gesture = beginTool(context, "pencil", {x: 2, y: 2});
    const afterBegin = context.pixels.slice();

    const result = finishTool(context, gesture, {x: 2, y: 2});

    expect(result).toEqual({changed: false});
    expect(Array.from(context.pixels)).toEqual(Array.from(afterBegin));
  });

  it("applies the final move when the ending point differs", () => {
    const context = createContext(5, 5);
    const gesture = beginTool(context, "line", {x: 0, y: 0});

    const result = finishTool(context, gesture, {x: 4, y: 4});

    expect(result.changed).toBe(true);
    expect(gesture.last).toEqual({x: 4, y: 4});
    for (let coordinate = 0; coordinate < 5; coordinate += 1) {
      expect(pixelAt(context.pixels, context.width, coordinate, coordinate)).toEqual([...RED]);
    }
  });
});

describe("drawRectangle", () => {
  it("handles a single-pixel rectangle", () => {
    const pixels = new Uint8ClampedArray(3 * 3 * 4);

    drawRectangle(pixels, 3, 3, {x: 1, y: 1}, {x: 1, y: 1}, RED);

    expect(pixelAt(pixels, 3, 1, 1)).toEqual([...RED]);
    expect(pixelAt(pixels, 3, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe("advanced raster drawing helpers", () => {
  it("rasterizes a symmetric ellipse outline and handles degenerate bounds", () => {
    const pixels = new Uint8ClampedArray(9 * 9 * 4);

    drawEllipseOutline(pixels, 9, 9, {x: 1, y: 2}, {x: 7, y: 6}, RED);

    expect(pixelAt(pixels, 9, 4, 2)).toEqual([...RED]);
    expect(pixelAt(pixels, 9, 4, 6)).toEqual([...RED]);
    expect(pixelAt(pixels, 9, 1, 4)).toEqual([...RED]);
    expect(pixelAt(pixels, 9, 7, 4)).toEqual([...RED]);
    expect(pixelAt(pixels, 9, 4, 4)).toEqual([0, 0, 0, 0]);

    const line = new Uint8ClampedArray(4 * 4 * 4);
    drawEllipseOutline(line, 4, 4, {x: 1, y: 0}, {x: 1, y: 3}, BLUE);
    for (let y = 0; y < 4; y += 1) expect(pixelAt(line, 4, 1, y)).toEqual([...BLUE]);
  });

  it("draws open polylines and closed polygon outlines without filling the interior", () => {
    const pixels = new Uint8ClampedArray(7 * 7 * 4);
    drawPolylineOutline(pixels, 7, 7, [{x: 1, y: 1}, {x: 3, y: 3}, {x: 5, y: 1}], RED);
    expect(pixelAt(pixels, 7, 1, 1)).toEqual([...RED]);
    expect(pixelAt(pixels, 7, 3, 3)).toEqual([...RED]);
    expect(pixelAt(pixels, 7, 5, 1)).toEqual([...RED]);
    expect(pixelAt(pixels, 7, 3, 1)).toEqual([0, 0, 0, 0]);

    const triangle = new Uint8ClampedArray(7 * 7 * 4);
    drawPolygonOutline(triangle, 7, 7, [{x: 1, y: 1}, {x: 5, y: 1}, {x: 3, y: 5}], GREEN);
    expect(pixelAt(triangle, 7, 1, 1)).toEqual([...GREEN]);
    expect(pixelAt(triangle, 7, 5, 1)).toEqual([...GREEN]);
    expect(pixelAt(triangle, 7, 3, 5)).toEqual([...GREEN]);
    expect(pixelAt(triangle, 7, 3, 2)).toEqual([0, 0, 0, 0]);
  });

  it("samples and rasterizes a quadratic Bezier through both endpoints", () => {
    const curve = rasterizeQuadraticBezier({x: 0, y: 4}, {x: 4, y: 0}, {x: 8, y: 4}, 32);
    expect(curve[0]).toEqual({x: 0, y: 4});
    expect(curve[curve.length - 1]).toEqual({x: 8, y: 4});
    expect(curve.some((point) => point.y === 2)).toBe(true);

    const pixels = new Uint8ClampedArray(9 * 5 * 4);
    drawQuadraticBezier(pixels, 9, 5, {x: 0, y: 4}, {x: 4, y: 0}, {x: 8, y: 4}, BLUE, 1, "square", 32);
    expect(pixelAt(pixels, 9, 0, 4)).toEqual([...BLUE]);
    expect(pixelAt(pixels, 9, 8, 4)).toEqual([...BLUE]);
  });
});

describe("blur and jumble tools", () => {
  it("reports a clipped dirty region for blur and does not touch pixels outside it", () => {
    const width = 7;
    const height = 6;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) pixels[index] = index / 4;
    const beforeOutside = pixelAt(pixels, width, 6, 5);

    const result = blurPixelsInPlace(pixels, width, height, {x: 1, y: 1}, 2);

    expect(result.bounds).toEqual({x: 0, y: 0, width: 4, height: 4});
    expect(pixelAt(pixels, width, 6, 5)).toEqual(beforeOutside);
  });

  it("jumbles every pixel in the brush area exactly once", () => {
    const width = 9;
    const height = 9;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = x;
        pixels[offset + 1] = y;
        pixels[offset + 3] = 255;
      }
    }
    const before = pixels.slice();
    const result = jumblePixelsInPlace(pixels, width, height, {x: 4, y: 4}, 2, 17);
    const inside: number[] = [];
    const after: number[] = [];
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (Math.hypot(x - 4, y - 4) > 2) continue;
      inside.push((before[(y * width + x) * 4] << 8) | before[(y * width + x) * 4 + 1]);
      after.push((pixels[(y * width + x) * 4] << 8) | pixels[(y * width + x) * 4 + 1]);
    }
    expect(result.bounds).toEqual({x: 2, y: 2, width: 5, height: 5});
    expect(after.sort((a, b) => a - b)).toEqual(inside.sort((a, b) => a - b));
  });
});

describe("contour and color replacement helpers", () => {
  it("traces the boundary of the connected target region", () => {
    const width = 7;
    const height = 7;
    const pixels = new Uint8ClampedArray(width * height * 4);
    fillPixels({pixels, width, height, color: RED}, RED);
    for (let y = 2; y <= 4; y += 1) {
      for (let x = 2; x <= 4; x += 1) setPixel(pixels, width, height, x, y, BLUE);
    }

    const boundary = traceFloodBoundary(pixels, width, height, {x: 3, y: 3});
    expect(boundary).toHaveLength(8);
    expect(boundary).toContainEqual({x: 2, y: 2});
    expect(boundary).toContainEqual({x: 4, y: 4});
  });

  it("replaces exact colors globally or inside a clipped rectangle", () => {
    const width = 4;
    const height = 3;
    const pixels = new Uint8ClampedArray(width * height * 4);
    fillPixels({pixels, width, height, color: RED}, RED);
    expect(replaceColor(pixels, width, height, RED, GREEN, {x: 1, y: 1, width: 2, height: 1})).toBe(2);
    expect(countPixels(pixels, width, height, GREEN)).toBe(2);
    expect(replaceColor(pixels, width, height, RED, BLUE)).toBe(10);
    expect(replaceColor(pixels, width, height, BLUE, BLUE)).toBe(0);
  });
});

describe("bitmap brush stamping", () => {
  it("creates and clips a bitmap mask at the canvas edge", () => {
    const brush = createBitmapBrush([
      [1, 0, 1],
      [0, 1, 0],
    ], {x: 1, y: 0});
    const pixels = new Uint8ClampedArray(3 * 3 * 4);

    expect(stampBitmapBrush(pixels, 3, 3, {x: 0, y: 0}, RED, brush)).toBe(2);
    expect(pixelAt(pixels, 3, 1, 0)).toEqual([...RED]);
    expect(pixelAt(pixels, 3, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(pixels, 3, 0, 1)).toEqual([...RED]);
    expect(pixelAt(pixels, 3, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it("stamps a spaced stroke and always covers the final endpoint", () => {
    const brush = createBitmapBrush(1, 1, [1]);
    const pixels = new Uint8ClampedArray(7 * 2 * 4);
    expect(drawBitmapBrushStroke(pixels, 7, 2, [{x: 0, y: 0}, {x: 5, y: 0}], RED, brush, {spacing: 2})).toBe(4);
    for (const x of [0, 2, 4, 5]) expect(pixelAt(pixels, 7, x, 0)).toEqual([...RED]);
    expect(pixelAt(pixels, 7, 1, 0)).toEqual([0, 0, 0, 0]);
  });

  it("resizes a custom bitmap brush by its longest edge with nearest-neighbor pixels", () => {
    const brush = createBitmapBrush([
      [1, 0, 0, 1],
      [0, 1, 1, 0],
    ]);

    const resized = resizeBitmapBrush(brush, 8);

    expect(resized.width).toBe(8);
    expect(resized.height).toBe(4);
    expect(resized.anchorX).toBe(5);
    expect(resized.anchorY).toBe(3);
    expect(Array.from(resized.mask)).toEqual([
      1, 1, 0, 0, 0, 0, 1, 1,
      1, 1, 0, 0, 0, 0, 1, 1,
      0, 0, 1, 1, 1, 1, 0, 0,
      0, 0, 1, 1, 1, 1, 0, 0,
    ]);
  });
});

describe("pixel-perfect and pressure helpers", () => {
  it("removes duplicate and collinear pixel path points", () => {
    const points = [{x: 0, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 3, y: 1}];
    expect(simplifyPixelPerfectStroke(points)).toEqual([{x: 0, y: 0}, {x: 2, y: 0}, {x: 3, y: 1}]);
    expect(pixelPerfectStroke(points)).toEqual(simplifyPixelPerfectStroke(points));
  });

  it("normalizes pressure and maps it to size and opacity ranges", () => {
    expect(normalizePressure(-1)).toBe(0);
    expect(normalizePressure(2)).toBe(1);
    expect(normalizePressure(Number.NaN, 0.4)).toBe(0.4);
    expect(pressureToBrushSize(0, 2, 10)).toBe(2);
    expect(pressureToBrushSize(1, 2, 10)).toBe(10);
    expect(pressureToOpacity(0.5, 0.2, 0.8)).toBeCloseTo(0.5);
    expect(pressureToBrushSettings(0.5, {minSize: 2, maxSize: 10, minOpacity: 0.2, maxOpacity: 0.8})).toEqual({
      pressure: 0.5,
      size: 6,
      opacity: 0.5,
    });
  });
});

describe("brush dynamics", () => {
  it("maps pressure and velocity through thresholds and ranges", () => {
    const resolved = resolveBrushDynamics({pressure: 0.6, velocity: 0.5}, {
      size: {enabled: true, source: "pressure", min: 2, max: 12, threshold: 0.2, invert: false, curve: "linear"},
      opacity: {enabled: true, source: "velocity", min: 0.2, max: 1, threshold: 0, invert: true, curve: "linear"},
      angle: {enabled: true, source: "pressure", min: 0, max: 180, threshold: 0, invert: false, curve: "linear"},
      gradient: {enabled: true, source: "velocity", min: 0, max: 1, threshold: 0, invert: false, curve: "linear"},
    }, 1);
    expect(resolved.size).toBe(7);
    expect(resolved.opacity).toBeCloseTo(0.6);
    expect(resolved.angle).toBeCloseTo(108);
    expect(resolved.gradient).toBeCloseTo(0.5);
    expect(normalizeBrushVelocity(4, 2)).toBe(1);
  });

  it("supports independent response curves and disabled-channel fallbacks", () => {
    const resolved = resolveBrushDynamics({pressure: 0.5, velocity: 0.5}, {
      size: {enabled: true, source: "pressure", min: 1, max: 9, threshold: 0, invert: false, curve: "ease-in"},
      opacity: {enabled: true, source: "pressure", min: 0, max: 1, threshold: 0, invert: false, curve: "ease-out"},
      angle: {enabled: true, source: "pressure", min: 0, max: 360, threshold: 0, invert: false, curve: "smoothstep"},
      gradient: {enabled: false, source: "velocity", min: 0, max: 1, threshold: 0, invert: false, curve: "linear"},
    }, 1, {gradient: 0.25});
    expect(resolved.size).toBe(3);
    expect(resolved.opacity).toBeCloseTo(0.75);
    expect(resolved.angle).toBeCloseTo(180);
    expect(resolved.gradient).toBeCloseTo(0.25);
  });

  it("computes pointer velocity, gradients, and stable paths", () => {
    expect(pointerVelocity({x: 0, y: 0, time: 10}, {x: 3, y: 4, time: 20})).toBe(0.5);
    expect(interpolateRGBA([255, 0, 0, 255], [0, 0, 255, 0], 0.5)).toEqual([128, 0, 128, 128]);
    expect(stabilizeStroke([{x: 0, y: 0}, {x: 9, y: 0}, {x: 3, y: 0}], 1)).toEqual([
      {x: 0, y: 0}, {x: 4, y: 0}, {x: 3, y: 0},
    ]);
  });
});

describe("ink modes", () => {
  it.each(["simple", "copy-alpha"] as const)("keeps the already-rasterized preview unchanged in %s mode", (mode) => {
    const before = new Uint8ClampedArray([
      0, 0, 255, 128,
      16, 24, 32, 255,
    ]);
    const preview = new Uint8ClampedArray([
      255, 0, 0, 128,
      255, 255, 0, 64,
    ]);
    applyInkMode(preview, before, 2, 1, mode);
    expect(Array.from(preview)).toEqual([
      255, 0, 0, 128,
      255, 255, 0, 64,
    ]);
  });

  it("alpha-composites changed pixels and respects the dirty bounds", () => {
    const before = new Uint8ClampedArray([
      0, 0, 255, 128,
      16, 24, 32, 255,
    ]);
    const preview = new Uint8ClampedArray([
      255, 0, 0, 128,
      255, 255, 0, 64,
    ]);

    applyInkMode(preview, before, 2, 1, "alpha-composite", {x: 0, y: 0, width: 1, height: 1});

    expect(pixelAt(preview, 2, 0, 0)).toEqual([170, 0, 85, 192]);
    expect(pixelAt(preview, 2, 1, 0)).toEqual([255, 255, 0, 64]);
  });

  it("preserves existing alpha in lock-alpha mode and rejects transparent edits", () => {
    const before = new Uint8ClampedArray([
      32, 64, 96, 96,
      0, 0, 0, 0,
      12, 34, 56, 200,
    ]);
    const preview = new Uint8ClampedArray([
      255, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 0,
    ]);

    applyInkMode(preview, before, 3, 1, "lock-alpha");

    expect(pixelAt(preview, 3, 0, 0)).toEqual([255, 0, 0, 96]);
    expect(pixelAt(preview, 3, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(preview, 3, 2, 0)).toEqual([12, 34, 56, 200]);
  });
});

describe("rotated bitmap and shape brushes", () => {
  it("rotates an asymmetric bitmap brush around its anchor with nearest-neighbor pixels", () => {
    const brush = createBitmapBrush([
      [1, 0],
      [0, 1],
      [1, 1],
    ], {x: 0, y: 1});

    const rotated = rotateBitmapBrush(brush, 90);

    expect(rotated.width).toBe(3);
    expect(rotated.height).toBe(2);
    expect(rotated.anchorX).toBe(1);
    expect(rotated.anchorY).toBe(0);
    expect(Array.from(rotated.mask)).toEqual([
      1, 0, 1,
      1, 1, 0,
    ]);
    expect(Array.from(rotated.mask).reduce((sum, value) => sum + value, 0)).toBe(4);
    expect(rotateBitmapBrush(brush, 360)).toBe(brush);
  });

  it("creates shape presets as rotatable bitmap masks", () => {
    const diamond = createShapeBitmapBrush("diamond", 5);
    const rotated = rotateBitmapBrush(diamond, 90);

    expect(diamond.width).toBe(5);
    expect(diamond.height).toBe(5);
    expect(Array.from(diamond.mask).reduce((sum, value) => sum + value, 0)).toBe(13);
    expect(rotated.width).toBe(5);
    expect(rotated.height).toBe(5);
    expect(Array.from(rotated.mask).reduce((sum, value) => sum + value, 0)).toBe(13);
    expect(Array.from(rotated.mask)).toEqual(Array.from(diamond.mask));
  });
});

describe("gradient dithering", () => {
  it("keeps the smooth gradient baseline and applies a deterministic ordered pattern", () => {
    const smooth = new Uint8ClampedArray(4 * 4 * 4);
    const ordered = new Uint8ClampedArray(4 * 4 * 4);
    const draw = (pixels: Uint8ClampedArray, dither: "none" | "ordered") => {
      drawLinearGradient(pixels, 4, 4, {x: 0, y: 0}, {x: 3, y: 0}, [0, 0, 0, 255], [255, 255, 255, 255], dither);
    };

    draw(smooth, "none");
    draw(ordered, "ordered");

    expect(pixelAt(smooth, 4, 1, 0)).toEqual([85, 85, 85, 255]);
    expect(pixelAt(ordered, 4, 1, 1)).toEqual([83, 83, 83, 255]);
    expect(pixelAt(ordered, 4, 2, 0)).toEqual([167, 167, 167, 255]);
    expect(Array.from(ordered)).not.toEqual(Array.from(smooth));

    const repeated = new Uint8ClampedArray(4 * 4 * 4);
    draw(repeated, "ordered");
    expect(Array.from(repeated)).toEqual(Array.from(ordered));
  });

  it("uses the first color for a zero-length non-dithered gradient", () => {
    const pixels = new Uint8ClampedArray(3 * 2 * 4);
    drawLinearGradient(pixels, 3, 2, {x: 1, y: 1}, {x: 1, y: 1}, [12, 34, 56, 78], [200, 210, 220, 230]);

    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        expect(pixelAt(pixels, 3, x, y)).toEqual([12, 34, 56, 78]);
      }
    }
  });
});
