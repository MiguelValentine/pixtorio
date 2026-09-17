import {describe, expect, it} from "vitest";

import {createDocument, getActiveCel} from "./document";
import {layerOpaqueContentSelection, opaqueContentSelection} from "./contentSelection";

describe("opaque content selections", () => {
  it("maps sparse cel bounds into document coordinates and preserves the mask", () => {
    const document = createDocument({width: 8, height: 7});
    const cel = getActiveCel(document);
    cel.x = 2;
    cel.y = 3;
    cel.width = 3;
    cel.height = 2;
    cel.pixels = new Uint8ClampedArray(cel.width * cel.height * 4);
    cel.pixels[3] = 255;
    cel.pixels[(1 * cel.width + 2) * 4 + 3] = 255;

    expect(opaqueContentSelection(cel, document.width, document.height)).toEqual({
      x: 2,
      y: 3,
      width: 3,
      height: 2,
      mask: Uint8Array.from([1, 0, 0, 0, 0, 1]),
    });
  });

  it("clips content that extends outside the canvas", () => {
    const document = createDocument({width: 4, height: 3});
    const cel = getActiveCel(document);
    cel.x = -2;
    cel.y = 1;
    cel.width = 3;
    cel.height = 2;
    cel.pixels = new Uint8ClampedArray(cel.width * cel.height * 4);
    cel.pixels[(0 * cel.width + 2) * 4 + 3] = 255;
    cel.pixels[(1 * cel.width + 2) * 4 + 3] = 255;

    expect(opaqueContentSelection(cel, document.width, document.height)).toEqual({
      x: 0,
      y: 1,
      width: 1,
      height: 2,
    });
  });

  it("uses indexed authority instead of a stale RGBA cache", () => {
    const document = createDocument({width: 2, height: 2, colorMode: "indexed"});
    const cel = getActiveCel(document);
    cel.indexes = Uint8Array.from([0, 1, 0, 0]);
    cel.pixels.fill(255);

    expect(layerOpaqueContentSelection(document)).toEqual({x: 1, y: 0, width: 1, height: 1});
  });

  it.each([
    ["empty", (document: ReturnType<typeof createDocument>) => {
      const cel = getActiveCel(document);
      cel.pixels.fill(0);
    }],
    ["tilemap", (document: ReturnType<typeof createDocument>) => {
      const cel = getActiveCel(document);
      cel.tilemap = {columns: 1, rows: 1, tiles: new Uint32Array(1)};
      cel.pixels.fill(255);
    }],
  ] as const)("returns no selection for %s content", (_name, setup) => {
    const document = createDocument({width: 2, height: 2});
    setup(document);
    expect(layerOpaqueContentSelection(document)).toBeNull();
  });

  it.each(["locked", "reference"] as const)("rejects %s image layers", (kind) => {
    const document = createDocument({width: 2, height: 2});
    const layer = document.layers[0];
    layer.locked = kind === "locked";
    layer.role = kind === "reference" ? "reference" : "standard";
    getActiveCel(document).pixels[3] = 255;
    expect(layerOpaqueContentSelection(document)).toBeNull();
  });
});
