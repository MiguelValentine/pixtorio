import {describe, expect, it} from "vitest";

import {copyThumbnailPixels} from "./LayerThumbnail";
import {convertDocumentColorMode, refreshTilemapCaches} from "./colorModes";
import {
  celKey,
  compositeFrameForExport,
  compositeFrameWithOnionSkin,
  createCel,
  createDocument,
  type TilesetGrid,
} from "./document";
import {buildSpriteSheet, packAtlas} from "./gameAssets";
import {decodeProject, encodeProject} from "./serialization";
import {createTerrainMapData, recalculateTerrainCells} from "./terrain";
import {createTilemapData, createTileset} from "./tilemap";
import {tilemapPixelSize, tilesetGridLayout} from "./tilemapGeometry";

const grids: TilesetGrid[] = [
  {kind: "orthogonal"},
  {kind: "isometric", cellWidth: 2, cellHeight: 2, anchorX: 1, anchorY: 2},
  {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
  {kind: "hexagonal", orientation: "flat", offset: "even-q"},
];

describe("tilemap display and export pipeline", () => {
  it("keeps Terrain frames identical through animation, onion skin, thumbnails, sheets, atlases, and strict v5", () => {
    for (const grid of grids) {
      for (const colorMode of ["rgba", "grayscale", "indexed"] as const) {
        const tileset = createTileset({
          id: "pipeline",
          name: "Pipeline",
          tileWidth: 2,
          tileHeight: 2,
          grid,
          tiles: [
            {id: 1, pixels: solidTile([240, 40, 60, 255])},
            {id: 2, pixels: solidTile([40, 220, 90, 255])},
            {id: 3, pixels: solidTile([50, 80, 240, 255])},
          ],
          terrains: [{
            id: 7,
            name: "Ground",
            color: "#44aa66ff",
            neighborMode: grid.kind === "hexagonal" ? "edge6" : "edge4",
            boundary: "wrap",
            rules: Array.from({length: grid.kind === "hexagonal" ? 64 : 16}, (_, mask) => ({
              mask,
              candidates: [{tileId: 2, flags: 0, weight: 1}],
            })),
          }],
        });
        const geometry = createTilemapData(2, 2);
        const size = tilemapPixelSize(tileset, geometry);
        const document = createDocument({width: size.width, height: size.height});
        const layer = document.layers[0];
        Object.assign(layer, {kind: "tilemap", tilesetId: tileset.id});
        document.tilesets = [tileset];
        document.frames = [
          {id: "previous", durationMs: 80},
          {id: "current", durationMs: 120},
          {id: "next", durationMs: 160},
        ];
        document.activeLayerId = layer.id;
        document.activeFrameId = "current";
        document.cels = {};

        const previous = createPipelineCel(layer.id, "previous", tileset, 1);
        const current = createPipelineCel(layer.id, "current", tileset, 0);
        current.terrainmap = createTerrainMapData(2, 2, 91);
        current.terrainmap.terrains.fill(7);
        recalculateTerrainCells(
          current.terrainmap,
          tileset.terrains,
          tilesetGridLayout(tileset, current.tilemap!),
          current.tilemap!.tiles,
          allCells(2, 2),
        );
        current.opacity = 0.5;
        const next = createPipelineCel(layer.id, "next", tileset, 3);
        document.cels[celKey(layer.id, "previous")] = previous;
        document.cels[celKey(layer.id, "current")] = current;
        document.cels[celKey(layer.id, "next")] = next;
        refreshTilemapCaches(document);
        if (colorMode !== "rgba") convertDocumentColorMode(document, colorMode);

        const frames = document.frames.map((frame) => compositeFrameForExport(document, frame.id));
        expect(frames[0]).toEqual(previous.pixels);
        const opaqueOffset = firstOpaqueOffset(current.pixels);
        expect([...frames[1].slice(opaqueOffset, opaqueOffset + 4)]).toEqual([
          ...current.pixels.slice(opaqueOffset, opaqueOffset + 3),
          128,
        ]);
        expect(frames[2]).toEqual(next.pixels);
        expect(frames.every((pixels) => pixels.length === document.width * document.height * 4)).toBe(true);

        const onion = compositeFrameWithOnionSkin(document, "previous", "next");
        expect(onion).toHaveLength(document.width * document.height * 4);
        expect(onion).not.toEqual(frames[1]);

        const thumbnail = new Uint8ClampedArray(current.pixels.length);
        expect(copyThumbnailPixels(thumbnail, current.pixels)).toBe(true);
        expect(thumbnail).toEqual(current.pixels);

        const sheet = buildSpriteSheet(frames, document.width, document.height, {
          layout: "horizontal",
          scale: 1,
          borderPadding: 1,
          framePadding: 1,
        });
        sheet.frames.forEach((rectangle, index) => {
          expect(extractRectangle(sheet.pixels, sheet.width, rectangle)).toEqual(frames[index]);
        });

        const atlas = packAtlas(
          frames,
          document.width,
          document.height,
          document.frames.map((frame) => frame.id),
          document.frames.map((frame) => frame.durationMs),
          1,
        );
        atlas.frames.forEach((rectangle, index) => {
          expect(extractAtlasFrame(atlas.pixels, atlas.width, rectangle)).toEqual(frames[index]);
        });

        const decoded = decodeProject(encodeProject(document));
        expect(decoded).toEqual(document);
        expect(decoded.cels[celKey(layer.id, "current")].terrainmap?.seed).toBe(91);
      }
    }
  });
});

function createPipelineCel(
  layerId: string,
  frameId: string,
  tileset: ReturnType<typeof createTileset>,
  tileId: number,
) {
  const tilemap = createTilemapData(2, 2);
  tilemap.tiles.fill(tileId);
  const size = tilemapPixelSize(tileset, tilemap);
  const cel = createCel(layerId, frameId, size.width, size.height);
  cel.tilemap = tilemap;
  return cel;
}

function solidTile(color: readonly number[]) {
  const pixels = new Uint8ClampedArray(2 * 2 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(color, offset);
  return pixels;
}

function allCells(columns: number, rows: number) {
  return Array.from({length: columns * rows}, (_, index) => ({
    column: index % columns,
    row: Math.floor(index / columns),
  }));
}

function firstOpaqueOffset(pixels: Uint8ClampedArray) {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] !== 0) return offset;
  }
  throw new Error("Expected an opaque tilemap pixel");
}

function extractRectangle(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  rectangle: {x: number; y: number; width: number; height: number},
) {
  const output = new Uint8ClampedArray(rectangle.width * rectangle.height * 4);
  for (let row = 0; row < rectangle.height; row += 1) {
    const source = ((rectangle.y + row) * imageWidth + rectangle.x) * 4;
    output.set(pixels.subarray(source, source + rectangle.width * 4), row * rectangle.width * 4);
  }
  return output;
}

function extractAtlasFrame(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  entry: {
    frame: {x: number; y: number; width: number; height: number};
    sourceSize: {width: number; height: number};
    spriteSourceSize: {x: number; y: number; width: number; height: number};
  },
) {
  const cropped = extractRectangle(pixels, imageWidth, entry.frame);
  const output = new Uint8ClampedArray(entry.sourceSize.width * entry.sourceSize.height * 4);
  for (let row = 0; row < entry.spriteSourceSize.height; row += 1) {
    const source = row * entry.spriteSourceSize.width * 4;
    const target = ((entry.spriteSourceSize.y + row) * entry.sourceSize.width + entry.spriteSourceSize.x) * 4;
    output.set(cropped.subarray(source, source + entry.spriteSourceSize.width * 4), target);
  }
  return output;
}
