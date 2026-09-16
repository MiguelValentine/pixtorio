import {describe, expect, it} from "vitest";

import {celKey, cloneDocument, createDocument, getActiveCel, type Cel} from "./document";
import type {OutlineOptions} from "./effects";
import {CommandHistory, DocumentStateCommand} from "./history";
import {commitDocumentOutline, renderDocumentOutline} from "./outlineDocument";
import {decodeProject, encodeProject} from "./serialization";

type DocumentOutlineOptions = Omit<OutlineOptions, "width" | "height">;

const TRANSPARENT = [0, 0, 0, 0] as const;
const WHITE = [255, 255, 255, 255] as const;
const RED = [255, 0, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;

function outlineOptions(overrides: Partial<DocumentOutlineOptions> = {}): DocumentOutlineOptions {
  return {
    color: RED,
    position: "outside",
    shape: "square",
    ...overrides,
  };
}

function setCelGeometry(
  cel: Cel,
  x: number,
  y: number,
  width: number,
  height: number,
  pixels: readonly number[],
  indexes?: readonly number[],
) {
  cel.x = x;
  cel.y = y;
  cel.width = width;
  cel.height = height;
  cel.pixels = new Uint8ClampedArray(pixels);
  if (indexes) cel.indexes = new Uint8Array(indexes);
  else delete cel.indexes;
}

function pixelAt(cel: Cel, x: number, y: number) {
  const offset = (y * cel.width + x) * 4;
  return [...cel.pixels.subarray(offset, offset + 4)];
}

describe("document-space outline", () => {
  it("expands a partial Cel around its source without changing the source", () => {
    const document = createDocument({width: 5, height: 5});
    const cel = getActiveCel(document);
    setCelGeometry(cel, 2, 2, 1, 1, [...WHITE]);
    const sourcePixels = cel.pixels.slice();

    const result = renderDocumentOutline(document, cel, outlineOptions());

    expect(result).not.toBe(cel);
    expect({x: result.x, y: result.y, width: result.width, height: result.height}).toEqual({
      x: 1,
      y: 1,
      width: 3,
      height: 3,
    });
    expect([...result.pixels]).toEqual([
      ...RED, ...RED, ...RED,
      ...RED, ...WHITE, ...RED,
      ...RED, ...RED, ...RED,
    ]);
    expect({x: cel.x, y: cel.y, width: cel.width, height: cel.height}).toEqual({x: 2, y: 2, width: 1, height: 1});
    expect(cel.pixels).toEqual(sourcePixels);
  });

  it("returns the original Cel and reports no change when the kernel is a no-op", () => {
    const document = createDocument({width: 5, height: 5});
    const cel = getActiveCel(document);
    setCelGeometry(cel, 2, 2, 1, 1, [...WHITE]);

    expect(renderDocumentOutline(document, cel, outlineOptions({directions: []}))).toBe(cel);
    expect(commitDocumentOutline(document, cel, outlineOptions({directions: []}))).toBe(false);
    expect(cel.pixels).toEqual(new Uint8ClampedArray([...WHITE]));
  });

  it("uses document edges for tiled sampling instead of the partial Cel edges", () => {
    const document = createDocument({width: 5, height: 1});
    const cel = getActiveCel(document);
    setCelGeometry(cel, 0, 0, 1, 1, [...WHITE]);

    const result = renderDocumentOutline(document, cel, outlineOptions({directions: ["w"], tileX: true}));

    expect({x: result.x, y: result.y, width: result.width, height: result.height}).toEqual({x: 0, y: 0, width: 5, height: 1});
    expect(pixelAt(result, 0, 0)).toEqual(WHITE);
    expect(pixelAt(result, 4, 0)).toEqual(RED);
    expect(pixelAt(result, 1, 0)).toEqual(TRANSPARENT);
  });

  it("clips generated pixels using selection coordinates in document space", () => {
    const document = createDocument({width: 5, height: 5});
    const cel = getActiveCel(document);
    setCelGeometry(cel, 2, 2, 1, 1, [...WHITE]);

    const result = renderDocumentOutline(document, cel, outlineOptions({
      selection: {x: 3, y: 3, width: 1, height: 1},
    }));

    expect({x: result.x, y: result.y, width: result.width, height: result.height}).toEqual({x: 2, y: 2, width: 2, height: 2});
    expect(pixelAt(result, 0, 0)).toEqual(WHITE);
    expect(pixelAt(result, 1, 1)).toEqual(RED);
    expect(pixelAt(result, 1, 0)).toEqual(TRANSPARENT);
    expect(pixelAt(result, 0, 1)).toEqual(TRANSPARENT);
  });

  it("preserves opaque source pixels outside the document after expansion", () => {
    const document = createDocument({width: 5, height: 1});
    const cel = getActiveCel(document);
    setCelGeometry(cel, 4, 0, 2, 1, [...WHITE, ...BLUE]);

    const result = renderDocumentOutline(document, cel, outlineOptions({directions: ["w"]}));

    expect({x: result.x, y: result.y, width: result.width, height: result.height}).toEqual({x: 3, y: 0, width: 3, height: 1});
    expect(pixelAt(result, 0, 0)).toEqual(RED);
    expect(pixelAt(result, 1, 0)).toEqual(WHITE);
    expect(pixelAt(result, 2, 0)).toEqual(BLUE);
  });

  it("commits one expanded indexed buffer to linked aliases while preserving relative offsets", () => {
    const document = createDocument({
      width: 5,
      height: 5,
      colorMode: "indexed",
      palette: ["#00000000", "#ffffffff", "#ff0000ff"],
    });
    const source = getActiveCel(document);
    setCelGeometry(source, 2, 2, 1, 1, [...WHITE], [1]);
    const alias: Cel = {
      ...source,
      id: "alias-cel",
      frameId: "alias-frame",
      x: 0,
      y: 1,
      pixels: source.pixels,
      indexes: source.indexes,
    };
    document.cels[celKey(alias.layerId, alias.frameId)] = alias;
    document.frames.push({id: alias.frameId, durationMs: 100});
    const relativeOffset = {x: alias.x - source.x, y: alias.y - source.y};

    expect(commitDocumentOutline(document, source, outlineOptions())).toBe(true);

    expect({x: source.x, y: source.y, width: source.width, height: source.height}).toEqual({x: 1, y: 1, width: 3, height: 3});
    expect({x: alias.x, y: alias.y, width: alias.width, height: alias.height}).toEqual({x: -1, y: 0, width: 3, height: 3});
    expect({x: alias.x - source.x, y: alias.y - source.y}).toEqual(relativeOffset);
    expect(alias.pixels).toBe(source.pixels);
    expect(alias.indexes).toBe(source.indexes);
    expect([...source.indexes!]).toEqual([2, 2, 2, 2, 1, 2, 2, 2, 2]);
    expect([...alias.indexes!]).toEqual([...source.indexes!]);
    expect(pixelAt(alias, 1, 1)).toEqual(WHITE);
    const decoded = decodeProject(encodeProject(document));
    const loadedSource = decoded.cels[celKey(source.layerId, source.frameId)];
    const loadedAlias = decoded.cels[celKey(alias.layerId, alias.frameId)];
    expect(loadedSource.pixels).toEqual(source.pixels);
    expect(loadedAlias.pixels).toBe(loadedSource.pixels);
    expect(loadedAlias.indexes).toBe(loadedSource.indexes);
    expect({x: loadedAlias.x - loadedSource.x, y: loadedAlias.y - loadedSource.y}).toEqual(relativeOffset);
  });

  it("round-trips an outline through document history", () => {
    const document = createDocument({width: 5, height: 5});
    const source = getActiveCel(document);
    setCelGeometry(source, 2, 2, 1, 1, [...WHITE]);
    const before = cloneDocument(document);
    expect(commitDocumentOutline(document, source, outlineOptions())).toBe(true);
    const after = cloneDocument(document);
    const history = new CommandHistory<typeof document>();
    history.commit(new DocumentStateCommand(before, after, "Outline"));

    expect(history.undo(document)?.label).toBe("Outline");
    expect({x: getActiveCel(document).x, y: getActiveCel(document).y, width: getActiveCel(document).width, height: getActiveCel(document).height}).toEqual({
      x: 2,
      y: 2,
      width: 1,
      height: 1,
    });
    expect(history.redo(document)?.label).toBe("Outline");
    expect({x: getActiveCel(document).x, y: getActiveCel(document).y, width: getActiveCel(document).width, height: getActiveCel(document).height}).toEqual({
      x: 1,
      y: 1,
      width: 3,
      height: 3,
    });
    expect(pixelAt(getActiveCel(document), 1, 1)).toEqual(WHITE);
  });

  it("rejects an oversized expanded Cel without changing the document", () => {
    const document = createDocument({width: 2048, height: 1});
    const cel = getActiveCel(document);
    cel.x = 1;
    cel.pixels = new Uint8ClampedArray(document.width * 4);
    cel.pixels.set(WHITE, 0);
    const beforePixels = cel.pixels.slice();
    const beforeGeometry = {x: cel.x, y: cel.y, width: cel.width, height: cel.height};

    expect(() => commitDocumentOutline(document, cel, outlineOptions())).toThrow("2048-pixel Cel limit");
    expect(cel.pixels).toEqual(beforePixels);
    expect({x: cel.x, y: cel.y, width: cel.width, height: cel.height}).toEqual(beforeGeometry);
  });
});
