import { Raster, palette, backed } from './raster.mjs';

function merge(name, ...parts) {
  const result = new Raster(name);
  for (const part of parts) result.stamp(part);
  return result;
}

function named(layer, name) {
  layer.name = name;
  return layer;
}

function ring(name, x, y, width, height, thickness, color) {
  return new Raster(name)
    .rect(x, y, width, thickness, color)
    .rect(x, y + height - thickness, width, thickness, color)
    .rect(x, y + thickness, thickness, height - thickness * 2, color)
    .rect(x + width - thickness, y + thickness, thickness, height - thickness * 2, color);
}

function makeAnimationFrames() {
  const backFrame = ring('Motion frame', 11, 18, 28, 31, 5, palette.mint);
  const frontFrame = ring('Front frame', 19, 10, 28, 31, 5, palette.coral);
  const shape = merge('Animation mark silhouette', backFrame, frontFrame,
    new Raster('Play silhouette').polygon([[29, 18], [29, 34], [42, 26]], palette.ink));

  const edge = named(backed(shape, 2, palette.tealDark), '06 - Frame edge and depth');
  const rear = named(backFrame, '06 - Mint motion frame');
  const front = named(frontFrame, '06 - Coral front frame');
  const play = named(new Raster('Play mark')
    .polygon([[29, 18], [29, 34], [42, 26]], palette.mint)
    .rect(20, 14, 4, 3, palette.coralLight), '06 - Play and frame glint');
  return [edge, rear, front, play];
}

function makePixelCursor() {
  const pointer = new Raster('Cursor silhouette').polygon([
    [16, 9], [16, 46], [25, 38], [31, 52], [38, 48], [31, 34], [45, 34],
  ], palette.blue);
  const spark = new Raster('Spark silhouette')
    .rect(43, 17, 11, 5, palette.yellow)
    .rect(46, 11, 5, 17, palette.yellow);
  const shape = merge('Cursor and spark silhouette', pointer, spark);

  const edge = named(backed(shape, 1, palette.blueDark), '07 - Cursor edge and depth');
  const cursor = named(pointer, '07 - Blue pixel cursor');
  const highlights = named(new Raster('Cursor highlights')
    .polygon([[20, 16], [20, 37], [25, 33], [31, 44], [34, 42], [27, 29], [39, 29]], palette.blueLight)
    .rect(18, 13, 3, 10, palette.white), '07 - Cursor highlight');
  const sparkLayer = named(new Raster('Yellow spark')
    .rect(43, 17, 11, 5, palette.yellow)
    .rect(46, 11, 5, 17, palette.yellow)
    .rect(48, 13, 2, 4, palette.yellowLight), '07 - Yellow pixel spark');
  return [edge, cursor, highlights, sparkLayer];
}

function makeFoldedCanvas() {
  const page = new Raster('Canvas silhouette').polygon([
    [13, 10], [42, 10], [52, 20], [52, 39], [39, 52], [13, 52],
  ], palette.mint);
  const edge = named(backed(page, 2, palette.tealDark), '08 - Canvas edge and depth');
  const canvas = named(page, '08 - Mint canvas');
  const fold = named(new Raster('Folded corner')
    .polygon([[42, 10], [52, 20], [42, 20]], palette.coral)
    .line(42, 10, 42, 20, 2, palette.coralDark)
    .rect(45, 17, 4, 3, palette.coralLight), '08 - Coral folded corner');
  const pixels = named(new Raster('Canvas pixels')
    .rect(20, 24, 5, 5, palette.coral)
    .rect(27, 24, 5, 5, palette.teal)
    .rect(20, 31, 5, 5, palette.teal)
    .rect(27, 31, 5, 5, palette.coral)
    .rect(20, 41, 17, 4, palette.tealDark), '08 - Pixel canvas detail');
  return [edge, canvas, fold, pixels];
}

function makeIsometricCube() {
  const silhouette = new Raster('Cube silhouette').polygon([
    [32, 8], [53, 19], [53, 43], [32, 55], [11, 43], [11, 19],
  ], palette.ink);
  const edge = named(backed(silhouette, 1, palette.blueDark), '09 - Cube edge and depth');
  const top = named(new Raster('Golden top face')
    .polygon([[32, 11], [49, 20], [32, 29], [15, 20]], palette.yellow)
    .rect(30, 15, 4, 3, palette.yellowLight), '09 - Golden top face');
  const left = named(new Raster('Coral left face')
    .polygon([[15, 23], [31, 32], [31, 51], [15, 41]], palette.coral)
    .rect(18, 28, 3, 7, palette.coralLight), '09 - Coral left face');
  const right = named(new Raster('Blue right face')
    .polygon([[33, 32], [49, 23], [49, 41], [33, 51]], palette.blue)
    .rect(42, 28, 3, 7, palette.blueLight), '09 - Blue right face');
  return [edge, top, left, right];
}

function makePXMonogram() {
  const p = new Raster('P block').rect(13, 13, 7, 39, palette.coral)
    .rect(20, 13, 15, 7, palette.coral)
    .rect(30, 17, 8, 13, palette.coral)
    .rect(20, 27, 17, 7, palette.coral)
    .cut(20, 20, 10, 7);
  const x = new Raster('X block')
    .line(32, 14, 51, 50, 5, palette.yellow)
    .line(51, 14, 32, 50, 5, palette.yellow);
  const shape = merge('PX silhouette', p, x);
  const edge = named(backed(shape, 1, palette.coralDark), '10 - Monogram edge and depth');
  const coral = named(p, '10 - Coral P');
  const yellow = named(x, '10 - Golden X');
  const accents = named(new Raster('Monogram highlights')
    .rect(16, 17, 2, 14, palette.coralLight)
    .rect(42, 25, 3, 3, palette.yellowLight), '10 - Monogram highlights');
  return [edge, coral, yellow, accents];
}

export const optionsB = [
  { number: 6, slug: 'animation-frames', title: 'FRAME PLAY', layers: makeAnimationFrames() },
  { number: 7, slug: 'pixel-cursor', title: 'PIXEL CURSOR', layers: makePixelCursor() },
  { number: 8, slug: 'folded-canvas', title: 'FOLD CANVAS', layers: makeFoldedCanvas() },
  { number: 9, slug: 'isometric-cube', title: 'ISO CUBE', layers: makeIsometricCube() },
  { number: 10, slug: 'px-monogram', title: 'PX MARK', layers: makePXMonogram() },
];
