import {describe, expect, it} from "vitest";
import {
  addLayerGroup,
  celKey,
  compositeFrame,
  compositeFrameRegion,
  createCel,
  createDocument,
  getActiveCel,
  getCel,
  type Layer,
  type PixelDocument,
} from "./document";
import {setPixel} from "./pixels";

describe("compositeFrame", () => {
  it("composites a clipped region exactly like the matching full-frame pixels", () => {
    const document = createDocument({width: 4, height: 3});
    const bottom = getActiveCel(document);
    setPixel(bottom.pixels, bottom.width, bottom.height, 1, 1, [20, 40, 80, 255]);
    const top = addTestLayer(document, "region-top", 0.7);
    setPixel(top.pixels, top.width, top.height, 1, 1, [240, 120, 30, 200]);
    setPixel(top.pixels, top.width, top.height, 2, 2, [90, 180, 45, 255]);

    const full = compositeFrame(document);
    const expected = new Uint8ClampedArray(2 * 2 * 4);
    for (let row = 0; row < 2; row += 1) {
      expected.set(full.subarray(((row + 1) * 4 + 1) * 4, ((row + 1) * 4 + 3) * 4), row * 2 * 4);
    }

    expect(Array.from(compositeFrameRegion(document, {x: 1, y: 1, width: 2, height: 2}))).toEqual(Array.from(expected));
  });

  it("keeps nested group compositing correct inside a clipped region", () => {
    const document = createDocument({width: 3, height: 2});
    const base = getActiveCel(document);
    setPixel(base.pixels, 3, 2, 1, 0, [30, 70, 110, 255]);
    const group = addLayerGroup(document, "Group");
    group.opacity = 0.6;
    const child = addTestLayer(document, "Child");
    document.layers.at(-1)!.parentId = group.id;
    setPixel(child.pixels, 3, 2, 1, 0, [220, 90, 40, 200]);

    const full = compositeFrame(document);
    expect(Array.from(compositeFrameRegion(document, {x: 1, y: 0, width: 1, height: 1}))).toEqual(Array.from(full.subarray(4, 8)));
  });

  it("composites multiple layers from bottom to top across the canvas", () => {
    const document = createDocument({width: 2, height: 2});
    const bottom = getActiveCel(document);
    setPixel(bottom.pixels, bottom.width, bottom.height, 0, 0, [20, 30, 40, 255]);
    setPixel(bottom.pixels, bottom.width, bottom.height, 1, 1, [50, 60, 70, 255]);

    const middle = addTestLayer(document, "layer-middle");
    setPixel(middle.pixels, middle.width, middle.height, 0, 0, [100, 110, 120, 255]);
    setPixel(middle.pixels, middle.width, middle.height, 1, 0, [130, 140, 150, 255]);

    const top = addTestLayer(document, "layer-top");
    setPixel(top.pixels, top.width, top.height, 0, 0, [200, 210, 220, 255]);

    expect(Array.from(compositeFrame(document))).toEqual([
      200, 210, 220, 255,
      130, 140, 150, 255,
      0, 0, 0, 0,
      50, 60, 70, 255,
    ]);
  });

  it("skips hidden layers while preserving visible pixels below them", () => {
    const document = createDocument({width: 2, height: 1});
    const bottom = getActiveCel(document);
    setPixel(bottom.pixels, bottom.width, bottom.height, 0, 0, [18, 36, 54, 255]);
    setPixel(bottom.pixels, bottom.width, bottom.height, 1, 0, [72, 90, 108, 255]);

    const hidden = addTestLayer(document, "layer-hidden", 1, false);
    setPixel(hidden.pixels, hidden.width, hidden.height, 0, 0, [240, 220, 200, 255]);
    setPixel(hidden.pixels, hidden.width, hidden.height, 1, 0, [200, 220, 240, 255]);

    expect(Array.from(compositeFrame(document))).toEqual([
      18, 36, 54, 255,
      72, 90, 108, 255,
    ]);
  });

  it("applies layer opacity to source alpha during RGBA source-over blending", () => {
    const document = createDocument({width: 1, height: 1});
    const bottom = getActiveCel(document);
    setPixel(bottom.pixels, bottom.width, bottom.height, 0, 0, [255, 0, 0, 255]);

    const top = addTestLayer(document, "layer-alpha", 0.5);
    setPixel(top.pixels, top.width, top.height, 0, 0, [0, 0, 255, 128]);

    expect(Array.from(compositeFrame(document))).toEqual([191, 0, 64, 255]);
  });

  it.each([
    {mode: "normal" as const, expected: [50, 100, 150, 255]},
    {mode: "multiply" as const, expected: [20, 59, 118, 255]},
    {mode: "screen" as const, expected: [130, 191, 232, 255]},
    {mode: "overlay" as const, expected: [39, 127, 210, 255]},
  ])("supports the $mode blend mode", ({mode, expected}) => {
    const document = createDocument({width: 1, height: 1});
    const bottom = getActiveCel(document);
    setPixel(bottom.pixels, bottom.width, bottom.height, 0, 0, [100, 150, 200, 255]);
    const top = addTestLayer(document, `layer-${mode}`);
    document.layers[1].blendMode = mode;
    setPixel(top.pixels, top.width, top.height, 0, 0, [50, 100, 150, 255]);

    expect(Array.from(compositeFrame(document))).toEqual(expected);
  });

  it.each([
    {mode: "hue" as const, expected: [77, 77, 77, 255]},
    {mode: "saturation" as const, expected: [77, 77, 77, 255]},
    {mode: "color" as const, expected: [77, 77, 77, 255]},
    {mode: "luminosity" as const, expected: [255, 74, 74, 255]},
  ])("supports the non-separable $mode blend mode", ({mode, expected}) => {
    const document = createDocument({width: 1, height: 1});
    setPixel(getActiveCel(document).pixels, 1, 1, 0, 0, [255, 0, 0, 255]);
    const top = addTestLayer(document, `layer-${mode}`);
    document.layers[1].blendMode = mode;
    setPixel(top.pixels, 1, 1, 0, 0, [128, 128, 128, 255]);

    expect(Array.from(compositeFrame(document))).toEqual(expected);
  });

  it.each([
    {
      mode: "normal" as const,
      expected: [
        120, 90, 85, 255, 10, 220, 180, 192, 200, 100, 50, 128,
        19, 120, 126, 255, 158, 56, 60, 255, 99, 88, 77, 128,
      ],
    },
    {
      mode: "multiply" as const,
      expected: [
        36, 56, 72, 255, 10, 220, 180, 192, 200, 100, 50, 128,
        19, 75, 109, 255, 70, 19, 55, 255, 99, 88, 77, 128,
      ],
    },
    {
      mode: "screen" as const,
      expected: [
        125, 114, 133, 255, 10, 220, 180, 192, 200, 100, 50, 128,
        25, 120, 141, 255, 178, 82, 184, 255, 99, 88, 77, 128,
      ],
    },
    {
      mode: "overlay" as const,
      expected: [
        51, 71, 83, 255, 10, 220, 180, 192, 200, 100, 50, 128,
        19, 94, 125, 255, 118, 27, 132, 255, 99, 88, 77, 128,
      ],
    },
  ])("matches the $mode RGBA pixel-matrix golden output", ({mode, expected}) => {
    const document = createDocument({width: 3, height: 2});
    const bottom = getActiveCel(document);
    bottom.pixels.set([
      40, 80, 120, 255, 0, 0, 0, 0, 200, 100, 50, 128,
      25, 75, 125, 255, 90, 45, 180, 255, 12, 34, 56, 0,
    ]);

    const top = addTestLayer(document, `matrix-${mode}`);
    document.layers[1].blendMode = mode;
    top.pixels.set([
      200, 100, 50, 128, 10, 220, 180, 192, 255, 255, 255, 0,
      0, 255, 128, 64, 180, 60, 20, 192, 99, 88, 77, 128,
    ]);

    expect(Array.from(compositeFrame(document))).toEqual(expected);
  });

  it("matches complete-frame crops with stacked blend modes and partial alpha", () => {
    const document = createDocument({width: 5, height: 4});
    const base = getActiveCel(document);
    fillDeterministicPixels(base.pixels, document.width, document.height, 17);
    for (const [index, mode] of (["normal", "multiply", "screen", "overlay"] as const).entries()) {
      const cel = addTestLayer(document, `region-${mode}`, 0.45 + index * 0.1);
      document.layers.at(-1)!.blendMode = mode;
      fillDeterministicPixels(cel.pixels, document.width, document.height, 61 + index * 37);
    }
    const full = compositeFrame(document);
    const regions = [
      {x: 0, y: 0, width: 3, height: 2},
      {x: 1, y: 1, width: 3, height: 3},
      {x: 4, y: 0, width: 1, height: 4},
    ];

    for (const region of regions) {
      expect(Array.from(compositeFrameRegion(document, region))).toEqual(Array.from(cropPixels(full, document.width, region)));
    }
  });

  it("composites children recursively through nested groups", () => {
    const document = createDocument({width: 1, height: 1});
    const base = document.layers[0];
    const outer: Layer = {
      id: "group-outer",
      name: "Outer",
      visible: true,
      locked: false,
      opacity: 1,
      kind: "group",
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    };
    const middle: Layer = {
      id: "layer-middle-group",
      name: "Middle",
      visible: true,
      locked: false,
      opacity: 1,
      kind: "group",
      parentId: outer.id,
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    };
    const top: Layer = {
      id: "layer-nested-top",
      name: "Nested top",
      visible: true,
      locked: false,
      opacity: 1,
      kind: "image",
      parentId: middle.id,
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    };
    const topCel = createCel(top.id, document.activeFrameId, 1, 1);
    setPixel(topCel.pixels, 1, 1, 0, 0, [80, 90, 100, 255]);
    document.layers.push(outer, middle, top);
    document.cels[celKey(top.id, document.activeFrameId)] = topCel;

    expect(Array.from(compositeFrame(document))).toEqual([80, 90, 100, 255]);
    middle.visible = false;
    setPixel(getActiveCel(document).pixels, 1, 1, 0, 0, [20, 30, 40, 255]);
    expect(Array.from(compositeFrame(document))).toEqual([20, 30, 40, 255]);
    expect(base.parentId).toBeUndefined();
  });

  it("matches nested group opacity across the complete RGBA pixel matrix", () => {
    const document = createDocument({width: 2, height: 2});
    const bottom = getActiveCel(document);
    bottom.pixels.set([
      10, 20, 30, 255, 200, 100, 50, 128,
      0, 0, 0, 0, 90, 90, 90, 255,
    ]);

    const outer: Layer = {
      id: "matrix-group-outer",
      name: "Outer",
      visible: true,
      locked: false,
      opacity: 0.5,
      kind: "group",
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    };
    const inner: Layer = {
      id: "matrix-group-inner",
      name: "Inner",
      visible: true,
      locked: false,
      opacity: 0.75,
      kind: "group",
      parentId: outer.id,
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    };
    const child: Layer = {
      id: "matrix-group-child",
      name: "Child",
      visible: true,
      locked: false,
      opacity: 1,
      kind: "image",
      parentId: inner.id,
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    };
    const childCel = createCel(child.id, document.activeFrameId, 2, 2);
    childCel.pixels.set([
      210, 40, 80, 255, 20, 220, 100, 128,
      100, 150, 200, 192, 250, 250, 250, 255,
    ]);
    document.layers.push(outer, inner, child);
    document.cels[celKey(child.id, document.activeFrameId)] = childCel;

    expect(Array.from(compositeFrame(document))).toEqual([
      85, 27, 49, 255, 143, 138, 66, 152,
      100, 150, 200, 72, 150, 150, 150, 255,
    ]);
  });

  it("keeps normal source-over byte-identical for clipped and empty cels", () => {
    const document = createDocument({width: 4, height: 3});
    const base = getActiveCel(document);
    base.pixels.set([
      17, 17, 17, 255, 31, 47, 63, 255, 80, 90, 100, 255, 120, 130, 140, 255,
      15, 30, 45, 255, 70, 85, 100, 255, 150, 160, 170, 255, 200, 210, 220, 255,
      4, 8, 12, 255, 24, 48, 72, 255, 100, 110, 120, 255, 230, 235, 240, 255,
    ]);

    const clipped = addTestLayer(document, "clipped", 0.01);
    clipped.x = -1;
    clipped.y = -1;
    clipped.width = 4;
    clipped.height = 3;
    clipped.pixels = new Uint8ClampedArray([
      187, 34, 51, 75, 11, 22, 33, 128, 44, 55, 66, 0, 77, 88, 99, 255,
      100, 110, 120, 17, 130, 140, 150, 64, 160, 170, 180, 192, 190, 200, 210, 32,
      220, 225, 230, 255, 2, 4, 6, 1, 20, 40, 60, 80, 90, 100, 110, 160,
    ]);

    const outside = addTestLayer(document, "outside", 1);
    outside.x = document.width;
    outside.y = document.height;
    outside.width = 2;
    outside.height = 2;
    outside.pixels = new Uint8ClampedArray(2 * 2 * 4).fill(255);

    const expected = referenceCompositeFrame(document);
    expect(Array.from(compositeFrame(document))).toEqual(Array.from(expected));
  });

  it("keeps normal source-over byte-identical across randomized cels and groups", () => {
    const document = createDocument({width: 7, height: 5});
    const random = createRandomSource(0x1a2b3c4d);
    randomizeCel(getActiveCel(document), random, document.width, document.height);
    document.layers[0].opacity = 0.25;

    for (let index = 0; index < 12; index += 1) {
      const layer = addTestLayer(document, `random-${index}`, [0.01, 0.2, 0.5, 0.73, 1][index % 5]);
      randomizeCel(layer, random, document.width, document.height);
      const owner = document.layers.at(-1)!;
      owner.visible = index % 7 !== 0;
    }

    const group: Layer = {
      id: "group-random",
      name: "Random group",
      visible: true,
      locked: false,
      opacity: 0.61,
      kind: "group",
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    };
    document.layers.push(group);
    for (let index = 0; index < 3; index += 1) {
      const layer: Layer = {
        id: `group-layer-${index}`,
        name: `Group layer ${index}`,
        visible: true,
        locked: false,
        opacity: [0.13, 0.47, 0.89][index],
        kind: "image",
        parentId: group.id,
        blendMode: "normal",
        role: "standard",
        continuous: false,
        alphaLock: false,
      };
      document.layers.push(layer);
      const cel = createCel(layer.id, document.activeFrameId, 1, 1);
      randomizeCel(cel, random, document.width, document.height);
      document.cels[celKey(layer.id, document.activeFrameId)] = cel;
    }

    const expected = referenceCompositeFrame(document);
    expect(Array.from(compositeFrame(document))).toEqual(Array.from(expected));
  });
});

function addTestLayer(
  document: ReturnType<typeof createDocument>,
  id: string,
  opacity = 1,
  visible = true,
) {
  const layer: Layer = {
    id,
    name: id,
    visible,
    locked: false,
    opacity,
    kind: "image",
    blendMode: "normal",
    role: "standard",
    continuous: false,
    alphaLock: false,
  };
  const cel = createCel(layer.id, document.activeFrameId, document.width, document.height);
  document.layers.push(layer);
  document.cels[celKey(layer.id, document.activeFrameId)] = cel;
  return cel;
}

function fillDeterministicPixels(pixels: Uint8ClampedArray, width: number, height: number, seed: number) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = (seed + x * 31 + y * 17) % 256;
      pixels[index + 1] = (seed * 3 + x * 13 + y * 29) % 256;
      pixels[index + 2] = (seed * 5 + x * 23 + y * 7) % 256;
      pixels[index + 3] = (seed + x * 41 + y * 19) % 256;
    }
  }
}

function cropPixels(pixels: Uint8ClampedArray, canvasWidth: number, region: {x: number; y: number; width: number; height: number}) {
  const output = new Uint8ClampedArray(region.width * region.height * 4);
  for (let row = 0; row < region.height; row += 1) {
    const sourceStart = ((region.y + row) * canvasWidth + region.x) * 4;
    output.set(pixels.subarray(sourceStart, sourceStart + region.width * 4), row * region.width * 4);
  }
  return output;
}

function createRandomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomizeCel(
  cel: ReturnType<typeof createCel>,
  random: () => number,
  canvasWidth: number,
  canvasHeight: number,
) {
  cel.width = 1 + random() % 11;
  cel.height = 1 + random() % 9;
  cel.x = -5 + random() % (canvasWidth + 8);
  cel.y = -4 + random() % (canvasHeight + 7);
  cel.pixels = new Uint8ClampedArray(cel.width * cel.height * 4);
  for (let index = 0; index < cel.pixels.length; index += 1) {
    cel.pixels[index] = random() & 0xff;
  }
}

function referenceCompositeFrame(document: PixelDocument) {
  return referenceCompositeChildren(document, document.activeFrameId, undefined, new Set<string>());
}

function referenceCompositeChildren(
  document: PixelDocument,
  frameId: string,
  parentId: string | undefined,
  visiting: Set<string>,
) {
  const output = new Uint8ClampedArray(document.width * document.height * 4);
  for (const layer of document.layers) {
    if (layer.parentId !== parentId || !layer.visible || layer.opacity <= 0) continue;
    if (layer.kind === "group") {
      if (visiting.has(layer.id)) continue;
      visiting.add(layer.id);
      const groupPixels = referenceCompositeChildren(document, frameId, layer.id, visiting);
      visiting.delete(layer.id);
      referenceCompositeBuffer(output, groupPixels, layer.opacity);
      continue;
    }
    const cel = getCel(document, layer.id, frameId);
    if (cel) referenceCompositeCel(output, document.width, document.height, cel, layer.opacity);
  }
  return output;
}

function referenceCompositeCel(
  output: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  cel: ReturnType<typeof createCel>,
  opacity: number,
) {
  const layerOpacity = Math.max(0, Math.min(1, opacity));
  for (let celY = 0; celY < cel.height; celY += 1) {
    const canvasY = cel.y + celY;
    if (canvasY < 0 || canvasY >= canvasHeight) continue;
    for (let celX = 0; celX < cel.width; celX += 1) {
      const canvasX = cel.x + celX;
      if (canvasX < 0 || canvasX >= canvasWidth) continue;
      referenceBlendNormalPixel(
        output,
        (canvasY * canvasWidth + canvasX) * 4,
        cel.pixels,
        (celY * cel.width + celX) * 4,
        layerOpacity,
      );
    }
  }
}

function referenceCompositeBuffer(target: Uint8ClampedArray, source: Uint8ClampedArray, opacity: number) {
  for (let offset = 0; offset < target.length; offset += 4) {
    referenceBlendNormalPixel(target, offset, source, offset, opacity);
  }
}

function referenceBlendNormalPixel(
  target: Uint8ClampedArray,
  targetIndex: number,
  source: Uint8ClampedArray,
  sourceIndex: number,
  opacity: number,
) {
  const sourceAlpha = (source[sourceIndex + 3] / 255) * opacity;
  if (sourceAlpha <= 0) return;
  const targetAlpha = target[targetIndex + 3] / 255;
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);

  for (let channel = 0; channel < 3; channel += 1) {
    const sourceValue = source[sourceIndex + channel] / 255;
    const targetValue = target[targetIndex + channel] / 255;
    target[targetIndex + channel] = Math.round(
      255 * (
        sourceValue * sourceAlpha * (1 - targetAlpha)
        + targetValue * targetAlpha * (1 - sourceAlpha)
        + sourceValue * sourceAlpha * targetAlpha
      ) / outputAlpha,
    );
  }
  target[targetIndex + 3] = Math.round(outputAlpha * 255);
}
