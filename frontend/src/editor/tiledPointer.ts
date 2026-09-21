import type {Point} from "./tools";

export function wrapTiledPoint(point: Point, width: number, height: number, tiledX: boolean, tiledY: boolean): Point | null {
  let {x, y} = point;
  if (x < 0 || x >= width) {
    if (!tiledX) return null;
    x = ((x % width) + width) % width;
  }
  if (y < 0 || y >= height) {
    if (!tiledY) return null;
    y = ((y % height) + height) % height;
  }
  return {x, y};
}

export function crossesTiledBoundary(from: Point, to: Point, width: number, height: number, tiledX: boolean, tiledY: boolean) {
  return (tiledX && Math.floor(from.x / width) !== Math.floor(to.x / width))
    || (tiledY && Math.floor(from.y / height) !== Math.floor(to.y / height));
}

/** Interpolate in unwrapped space, then wrap each sample, never the two endpoints. */
export function* wrappedLinePoints(
  from: Point,
  to: Point,
  width: number,
  height: number,
  tiledX: boolean,
  tiledY: boolean,
): IterableIterator<Point> {
  if (![from.x, from.y, to.x, to.y, width, height].every(Number.isSafeInteger) || width <= 0 || height <= 0) {
    throw new Error("Tiled pointer coordinates and dimensions must be valid integers");
  }
  let {x, y} = from;
  const deltaX = Math.abs(to.x - from.x);
  const deltaY = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = deltaX - deltaY;
  while (true) {
    const sample = wrapTiledPoint({x, y}, width, height, tiledX, tiledY);
    if (sample) yield sample;
    if (x === to.x && y === to.y) break;
    const doubled = error * 2;
    if (doubled > -deltaY) { error -= deltaY; x += stepX; }
    if (doubled < deltaX) { error += deltaX; y += stepY; }
  }
}
