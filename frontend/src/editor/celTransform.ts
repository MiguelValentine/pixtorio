import {
  getCel,
  getLayerByID,
  isCelLayer,
  isLayerEffectivelyLocked,
  orderedFrameLayers,
  type Layer,
  type Cel,
  type PixelDocument,
} from "./document";

export interface CelTransformOptions {
  angleDegrees: number;
  offsetX: number;
  offsetY: number;
}

export interface CelTransformAddress {
  layerId: string;
  frameId: string;
}

export function findTopmostMovableCelAt(
  document: PixelDocument,
  frameId: string,
  x: number,
  y: number,
): CelTransformAddress | null {
  const layers: Layer[] = [];
  const visit = (parentId?: string) => {
    for (const layer of orderedFrameLayers(document, frameId, parentId)) {
      if (layer.kind === "group") visit(layer.id);
      else layers.push(layer);
    }
  };
  visit();
  for (const layer of layers.reverse()) {
    if (!isCelLayer(layer) || layer.role === "background" || !isLayerEffectivelyVisible(document, layer.id)
      || isLayerEffectivelyLocked(document, layer)) continue;
    const cel = getCel(document, layer.id, frameId);
    if (!cel || cel.opacity <= 0) continue;
    const localX = x - cel.x;
    const localY = y - cel.y;
    if (localX < 0 || localY < 0 || localX >= cel.width || localY >= cel.height) continue;
    if (cel.pixels[(localY * cel.width + localX) * 4 + 3] === 0) continue;
    return {layerId: layer.id, frameId};
  }
  return null;
}

export function moveCels(
  document: PixelDocument,
  addresses: readonly CelTransformAddress[],
  offsetX: number,
  offsetY: number,
) {
  const dx = normalizeOffset(offsetX);
  const dy = normalizeOffset(offsetY);
  if (dx === 0 && dy === 0) return false;
  const seen = new Set<string>();
  let changed = false;
  for (const {layerId, frameId} of addresses) {
    const layer = getLayerByID(document, layerId);
    if (!layer || !isCelLayer(layer) || layer.role === "background" || isLayerEffectivelyLocked(document, layer)) continue;
    const cel = getCel(document, layerId, frameId);
    if (!cel || seen.has(cel.id)) continue;
    seen.add(cel.id);
    cel.x += dx;
    cel.y += dy;
    changed = true;
  }
  return changed;
}

function isLayerEffectivelyVisible(document: PixelDocument, layerId: string) {
  let layer = getLayerByID(document, layerId);
  const visited = new Set<string>();
  while (layer) {
    if (!layer.visible || layer.opacity <= 0 || visited.has(layer.id)) return false;
    visited.add(layer.id);
    layer = layer.parentId ? getLayerByID(document, layer.parentId) : null;
  }
  return true;
}

export function transformCels(
  document: PixelDocument,
  addresses: readonly CelTransformAddress[],
  options: CelTransformOptions,
) {
  const angle = normalizeAngle(options.angleDegrees);
  const offsetX = normalizeOffset(options.offsetX);
  const offsetY = normalizeOffset(options.offsetY);
  if (angle === 0 && offsetX === 0 && offsetY === 0) return false;

  const selected = new Set(addresses.map(({layerId, frameId}) => `${layerId}:${frameId}`));
  const selectedCels = addresses
    .map(({layerId, frameId}) => getCel(document, layerId, frameId))
    .filter((cel): cel is Cel => Boolean(cel));
  if (selectedCels.length === 0) return false;

  const selectedLinks = new Map<string, Cel[]>();
  for (const cel of selectedCels) {
    const group = selectedLinks.get(cel.linkId) ?? [];
    group.push(cel);
    selectedLinks.set(cel.linkId, group);
  }
  const rotatedBuffers = new Map<string, Uint8ClampedArray>();
  for (const [linkId, cels] of selectedLinks) {
    const allLinkedSelected = Object.values(document.cels).every((candidate) => (
      candidate.linkId !== linkId || selected.has(`${candidate.layerId}:${candidate.frameId}`)
    ));
    const nextLinkId = allLinkedSelected ? linkId : createTransformLinkID(linkId);
    let pixels = allLinkedSelected ? cels[0].pixels : cels[0].pixels.slice();
    if (angle !== 0) pixels = rotatePixelsNearestNeighbor(pixels, cels[0].width, cels[0].height, angle);
    rotatedBuffers.set(nextLinkId, pixels);
    for (const cel of cels) {
      cel.linkId = nextLinkId;
      cel.pixels = rotatedBuffers.get(nextLinkId)!;
      cel.x += offsetX;
      cel.y += offsetY;
    }
  }
  return true;
}

export function rotatePixelsNearestNeighbor(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  angleDegrees: number,
) {
  if (source.length !== width * height * 4) throw new Error("Invalid pixel buffer");
  const angle = normalizeAngle(angleDegrees);
  if (angle === 0) return source.slice();
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(-radians);
  const sine = Math.sin(-radians);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const translatedX = x - centerX;
      const translatedY = y - centerY;
      const sourceX = Math.round(translatedX * cosine - translatedY * sine + centerX);
      const sourceY = Math.round(translatedX * sine + translatedY * cosine + centerY);
      if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) continue;
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      output.set(source.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return output;
}

export function rasterizeCelsToCanvas(document: PixelDocument, addresses: readonly CelTransformAddress[]) {
  const converted = new Map<string, {pixels: Uint8ClampedArray; linkId: string}>();
  let changed = false;
  for (const {layerId, frameId} of addresses) {
    const cel = getCel(document, layerId, frameId);
    if (!cel || (cel.x === 0 && cel.y === 0 && cel.width === document.width && cel.height === document.height)) continue;
    const geometryKey = `${cel.linkId}:${cel.x}:${cel.y}:${cel.width}:${cel.height}`;
    let conversion = converted.get(geometryKey);
    if (!conversion) {
      const pixels = new Uint8ClampedArray(document.width * document.height * 4);
      for (let sourceY = 0; sourceY < cel.height; sourceY += 1) {
        const targetY = cel.y + sourceY;
        if (targetY < 0 || targetY >= document.height) continue;
        for (let sourceX = 0; sourceX < cel.width; sourceX += 1) {
          const targetX = cel.x + sourceX;
          if (targetX < 0 || targetX >= document.width) continue;
          const sourceOffset = (sourceY * cel.width + sourceX) * 4;
          const targetOffset = (targetY * document.width + targetX) * 4;
          pixels.set(cel.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        }
      }
      conversion = {pixels, linkId: createTransformLinkID(cel.linkId)};
      converted.set(geometryKey, conversion);
    }
    cel.x = 0;
    cel.y = 0;
    cel.width = document.width;
    cel.height = document.height;
    cel.pixels = conversion.pixels;
    cel.linkId = conversion.linkId;
    changed = true;
  }
  return changed;
}

function normalizeAngle(value: number) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10) / 10;
  return ((rounded % 360) + 360) % 360;
}

function normalizeOffset(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-4096, Math.min(4096, Math.round(value)));
}

function createTransformLinkID(source: string) {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${source}-transform-${suffix}`;
}
