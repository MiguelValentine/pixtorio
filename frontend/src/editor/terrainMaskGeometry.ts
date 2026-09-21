import {cellNeighbors, cellPolygon, type HexOrientation, type TileGridKind, type TileGridLayout, type TilePoint} from "./tileGrid";
import type {TerrainNeighborMode} from "./terrain";

export function getTerrainMaskGeometry(
  mode: TerrainNeighborMode,
  gridKind: TileGridKind = "orthogonal",
  hexOrientation: HexOrientation = "pointy",
) {
  const layout: TileGridLayout = mode === "edge6"
    ? {kind: "hexagonal", orientation: hexOrientation, offset: hexOrientation === "pointy" ? "odd-r" : "odd-q",
      tileWidth: hexOrientation === "pointy" ? 40 : 46, tileHeight: hexOrientation === "pointy" ? 46 : 40}
    : gridKind === "isometric"
      ? {kind: "isometric", tileWidth: 48, tileHeight: 24}
      : {kind: "orthogonal", tileWidth: 32, tileHeight: 32};
  const origin = {column: 2, row: 2};
  const neighbors = mode === "blob8"
    ? [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
      .map(([column, row]) => ({column: origin.column + column, row: origin.row + row}))
    : cellNeighbors(layout, origin);
  const labels = mode === "edge6"
    ? hexOrientation === "pointy" ? ["E", "NE", "NW", "W", "SW", "SE"] : ["SE", "NE", "N", "NW", "SW", "S"]
    : mode === "blob8" ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] : ["N", "E", "S", "W"];
  const center = cellPolygon(layout, origin);
  const entries = neighbors.map((cell, bit) => ({bit, label: labels[bit], polygon: cellPolygon(layout, cell)}));
  const points = [center, ...entries.map((entry) => entry.polygon)].flat();
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const width = Math.max(...points.map((point) => point.x)) - minX;
  const height = Math.max(...points.map((point) => point.y)) - minY;
  const translate = (point: TilePoint) => ({x: point.x - minX, y: point.y - minY});
  return {
    width,
    height,
    entries: entries.map((entry) => ({...entry, polygon: entry.polygon.map(translate)})),
    center: center.map(translate),
    corners: mode === "edge6" ? center.map((point) => ({
      point: translate(point),
      bits: entries.filter((entry) => entry.polygon.some((vertex) =>
        Math.abs(vertex.x - point.x) < 1e-6 && Math.abs(vertex.y - point.y) < 1e-6))
        .map((entry) => entry.bit),
    })) : [],
  };
}
