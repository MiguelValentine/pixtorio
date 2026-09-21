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
import {createTerrainMapData, recalculateTerrainCells, type TerrainDefinition} from "./terrain";
import {createTileset, tilesetGridLayout} from "./tilemap";

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

test("Terrain recalculation workloads", async ({bench}) => {
  const orthogonalTileset = createTileset({tileWidth: 16, tileHeight: 16});
  orthogonalTileset.terrains = [benchmarkTerrain("edge4", 0x0f)];
  const orthogonalMap = createTerrainMapData(256, 256, 17);
  orthogonalMap.terrains.fill(1);
  const orthogonalTiles = new Uint32Array(orthogonalMap.terrains.length);
  const allOrthogonalCells = Array.from({length: orthogonalMap.terrains.length}, (_, index) => ({
    column: index % orthogonalMap.columns,
    row: Math.floor(index / orthogonalMap.columns),
  }));
  await bench("full orthogonal Terrain rebuild at 256x256", () => {
    recalculateTerrainCells(
      orthogonalMap,
      orthogonalTileset.terrains,
      tilesetGridLayout(orthogonalTileset, orthogonalMap.columns, orthogonalMap.rows),
      orthogonalTiles,
      allOrthogonalCells,
    );
    benchmarkSink ^= orthogonalTiles[orthogonalTiles.length - 1] ?? 0;
  }).run(BENCHMARK_RUN_OPTIONS);

  const isometricTileset = createTileset({
    tileWidth: 16,
    tileHeight: 24,
    grid: {kind: "isometric", cellWidth: 16, cellHeight: 8, anchorX: 8, anchorY: 24},
  });
  isometricTileset.terrains = [benchmarkTerrain("edge4", 0x0f)];
  const isometricMap = createTerrainMapData(256, 256, 19);
  isometricMap.terrains.fill(1);
  const isometricTiles = new Uint32Array(isometricMap.terrains.length);
  const allIsometricCells = Array.from({length: isometricMap.terrains.length}, (_, index) => ({
    column: index % isometricMap.columns,
    row: Math.floor(index / isometricMap.columns),
  }));
  await bench("full high-isometric Terrain rebuild at 256x256", () => {
    recalculateTerrainCells(
      isometricMap,
      isometricTileset.terrains,
      tilesetGridLayout(isometricTileset, isometricMap.columns, isometricMap.rows),
      isometricTiles,
      allIsometricCells,
    );
    benchmarkSink ^= isometricTiles[isometricTiles.length - 1] ?? 0;
  }).run(BENCHMARK_RUN_OPTIONS);

  const hexTileset = createTileset({
    tileWidth: 16,
    tileHeight: 16,
    grid: {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
  });
  hexTileset.terrains = [benchmarkTerrain("edge6", 0x3f)];
  const hexMap = createTerrainMapData(512, 512, 23);
  hexMap.terrains.fill(1);
  const hexTiles = new Uint32Array(hexMap.terrains.length);
  const allHexCells = Array.from({length: hexMap.terrains.length}, (_, index) => ({
    column: index % hexMap.columns,
    row: Math.floor(index / hexMap.columns),
  }));
  await bench("full pointy-hex Terrain rebuild at 512x512", () => {
    recalculateTerrainCells(
      hexMap,
      hexTileset.terrains,
      tilesetGridLayout(hexTileset, hexMap.columns, hexMap.rows),
      hexTiles,
      allHexCells,
    );
    benchmarkSink ^= hexTiles[hexTiles.length - 1] ?? 0;
  }).run(BENCHMARK_RUN_OPTIONS);

  const center = [{column: 256, row: 256}];
  await bench("local pointy-hex Terrain rebuild at 512x512", () => {
    recalculateTerrainCells(
      hexMap,
      hexTileset.terrains,
      tilesetGridLayout(hexTileset, hexMap.columns, hexMap.rows),
      hexTiles,
      center,
    );
    benchmarkSink ^= hexTiles[256 * hexMap.columns + 256] ?? 0;
  }).run(BENCHMARK_RUN_OPTIONS);
});

function benchmarkTerrain(neighborMode: TerrainDefinition["neighborMode"], maximumMask: number): TerrainDefinition {
  return {
    id: 1,
    name: "Benchmark",
    color: "#ffffffff",
    neighborMode,
    boundary: "same",
    rules: Array.from({length: maximumMask + 1}, (_, mask) => ({
      mask,
      candidates: [{tileId: 1, flags: 0, weight: 1}],
    })),
  };
}

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
