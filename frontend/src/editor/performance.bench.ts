import {test} from "vitest";
import {
  addLayer,
  compositeFrame,
  createDocument,
  getCel,
  type PixelDocument,
} from "./document";
import {FrameCompositeCache} from "./compositingCache";
import {
  beginTool,
  finishTool,
  moveTool,
  type Point,
  type RGBA,
  type ToolContext,
} from "./tools";

const BENCHMARK_RUN_OPTIONS = {
  iterations: 8,
  time: 250,
  warmupIterations: 3,
  warmupTime: 100,
};

const LARGE_WIDTH = 1024;
const LARGE_HEIGHT = 1024;
const LARGE_PIXEL_BYTES = LARGE_WIDTH * LARGE_HEIGHT * 4;
const DRAW_COLOR: RGBA = [236, 112, 52, 255];
const FILL_COLOR: RGBA = [44, 172, 214, 255];

let benchmarkSink = 0;

test("large-document drawing and tool mutation", async ({bench}) => {
  const strokePixels = new Uint8ClampedArray(LARGE_PIXEL_BYTES);
  const blankPixels = strokePixels.slice();
  const strokeContext: ToolContext = {
    pixels: strokePixels,
    width: LARGE_WIDTH,
    height: LARGE_HEIGHT,
    color: DRAW_COLOR,
  };
  const strokePath = createStrokePath(LARGE_WIDTH, LARGE_HEIGHT, 192);

  await bench(
    "pencil stroke on 1024x1024 RGBA buffer",
    {
      beforeEach() {
        strokePixels.set(blankPixels);
      },
    },
    () => {
      const gesture = beginTool(strokeContext, "pencil", strokePath[0]);
      for (let index = 1; index < strokePath.length; index += 1) {
        moveTool(strokeContext, gesture, strokePath[index]);
      }
      finishTool(strokeContext, gesture, strokePath[strokePath.length - 1]);
      benchmarkSink ^= strokePixels[strokePixels.length - 4] ?? 0;
    },
  ).run(BENCHMARK_RUN_OPTIONS);

  const fillPixels = new Uint8ClampedArray(LARGE_PIXEL_BYTES);
  const fillBasePixels = fillPixels.slice();
  const fillContext: ToolContext = {
    pixels: fillPixels,
    width: LARGE_WIDTH,
    height: LARGE_HEIGHT,
    color: FILL_COLOR,
  };

  await bench(
    "scanline flood fill on 1024x1024 RGBA buffer",
    {
      beforeEach() {
        fillPixels.set(fillBasePixels);
      },
    },
    () => {
      const result = beginTool(fillContext, "fill", {x: 0, y: 0});
      benchmarkSink ^= result.changed ? fillPixels[fillPixels.length - 4] ?? 0 : 0;
    },
  ).run(BENCHMARK_RUN_OPTIONS);
});

test("layered compositing workload", async ({bench}) => {
  const document = createLayeredDocument({
    width: 512,
    height: 512,
    layerCount: 10,
  });

  await bench(
    "source-over composite of 10 RGBA layers at 512x512",
    () => {
      const output = compositeFrame(document);
      benchmarkSink ^= output[0] ?? 0;
      benchmarkSink ^= output[output.length - 4] ?? 0;
    },
  ).run(BENCHMARK_RUN_OPTIONS);

  const cache = new FrameCompositeCache();
  const activeCel = getCel(document, document.activeLayerId, document.activeFrameId);
  if (!activeCel) throw new Error("Benchmark document is missing an active Cel");
  cache.get(document);
  let toggle = false;
  await bench(
    "dirty 8x8 repair of 10 RGBA layers at 512x512",
    () => {
      toggle = !toggle;
      const channel = toggle ? 24 : 232;
      for (let y = 248; y < 256; y += 1) {
        for (let x = 248; x < 256; x += 1) {
          const index = (y * activeCel.width + x) * 4;
          activeCel.pixels[index] = channel;
          activeCel.pixels[index + 3] = 255;
        }
      }
      const output = cache.repair(document, document.activeFrameId, {x: 248, y: 248, width: 8, height: 8});
      benchmarkSink ^= output[(248 * document.width + 248) * 4] ?? 0;
    },
  ).run(BENCHMARK_RUN_OPTIONS);
});

function createStrokePath(width: number, height: number, pointCount: number): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    const progress = index / (pointCount - 1);
    const x = Math.round(32 + progress * (width - 64));
    const y = Math.round(
      height / 2 + Math.sin(progress * Math.PI * 8) * (height / 3),
    );
    points.push({x, y});
  }
  return points;
}

function createLayeredDocument({
  width,
  height,
  layerCount,
}: {
  width: number;
  height: number;
  layerCount: number;
}): PixelDocument {
  const document = createDocument({width, height});
  for (let layerIndex = 0; layerIndex < layerCount - 1; layerIndex += 1) {
    addLayer(document, `Benchmark layer ${layerIndex + 2}`);
  }

  for (let layerIndex = 0; layerIndex < document.layers.length; layerIndex += 1) {
    const layer = document.layers[layerIndex];
    layer.opacity = 0.55 + (layerIndex % 4) * 0.1;
    const cel = getCel(document, layer.id, document.activeFrameId);
    if (!cel) throw new Error(`Missing benchmark cel for ${layer.id}`);
    fillLayerPixels(cel.pixels, width, height, layerIndex);
  }
  return document;
}

function fillLayerPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  layerIndex: number,
) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = (x * 3 + layerIndex * 29) % 256;
      pixels[index + 1] = (y * 5 + layerIndex * 17) % 256;
      pixels[index + 2] = (x + y + layerIndex * 43) % 256;
      pixels[index + 3] = (x + y + layerIndex * 7) % 11 === 0
        ? 0
        : 96 + (layerIndex * 19) % 128;
    }
  }
}

// Keep the sink observable so the benchmark body cannot be reduced to dead work.
void benchmarkSink;
