import {describe, expect, it} from "vitest";
import {addFrame, addFrameTag, createDocument, ensureCel, getActiveCel, getCel, linkCels} from "./document";
import {decodeProject, encodeProject} from "./serialization";
import {convertImageLayerToTilemap} from "./tilemap";

describe("project bridge serialization", () => {
  it("round trips RGBA pixels as base64 across multiple cels", () => {
    const document = createDocument({width: 2, height: 1});
    document.layers[0].continuous = true;
    getActiveCel(document).pixels.set([255, 0, 0, 128, 0, 255, 0, 0]);
    addFrame(document);
    getActiveCel(document).pixels.set([1, 2, 3, 4, 5, 6, 7, 8]);

    const payload = encodeProject(document);
    const raw = JSON.parse(payload) as {formatVersion: number; cels: Array<{pixels: unknown}>};
    expect(raw.formatVersion).toBe(4);
    expect(raw.cels).toHaveLength(2);
    expect(raw.cels.every((cel) => typeof cel.pixels === "string")).toBe(true);

    const decoded = decodeProject(payload);
    expect(decoded.frames).toEqual(document.frames);
    expect(Object.keys(decoded.cels)).toEqual(Object.keys(document.cels));
    for (const key of Object.keys(document.cels)) {
      expect(Array.from(decoded.cels[key].pixels)).toEqual(Array.from(document.cels[key].pixels));
    }
  });

  it("round trips palette colors with alpha", () => {
    const document = createDocument({width: 1, height: 1, palette: ["#ef476f80"]});
    const decoded = decodeProject(encodeProject(document));
    expect(decoded.palette.colors).toEqual(["#ef476f80"]);
  });

  it("rejects cel buffers that do not match their dimensions", () => {
    const document = createDocument({width: 1, height: 1});
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{pixels: string}>};
    payload.cels[0].pixels = btoa("short");
    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project cel dimensions are invalid");
  });

  it("uses stable errors for malformed project JSON", () => {
    expect(() => decodeProject("not-json")).toThrow("Project JSON is invalid");
    expect(() => decodeProject("null")).toThrow("Unsupported .pixio format version");
  });

  it("round trips frame tags and restores shared linked cel buffers", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    ensureCel(document, document.layers[0].id, second.id);
    getCel(document, document.layers[0].id, first.id)!.pixels.set([9, 8, 7, 255]);
    expect(linkCels(document, document.layers[0].id, [first.id, second.id], first.id)).toBe(true);
    const tag = addFrameTag(document, "Loop", first.id, second.id, "reverse", "#abcdef");

    const decoded = decodeProject(encodeProject(document));
    expect(decoded.tags).toEqual([tag]);
    const firstCel = decoded.cels[`${document.layers[0].id}:${first.id}`];
    const secondCel = decoded.cels[`${document.layers[0].id}:${second.id}`];
    expect(secondCel.linkId).toBe(firstCel.linkId);
    expect(secondCel.pixels).toBe(firstCel.pixels);
    expect(Array.from(secondCel.pixels)).toEqual([9, 8, 7, 255]);
  });

  it("round trips partial and offset v4 cels", () => {
    const document = createDocument({width: 4, height: 3});
    const firstCel = getActiveCel(document);
    firstCel.x = -2;
    firstCel.y = 1;
    firstCel.width = 2;
    firstCel.height = 2;
    firstCel.pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]);

    const decoded = decodeProject(encodeProject(document));
    const cel = getActiveCel(decoded);
    expect({x: cel.x, y: cel.y, width: cel.width, height: cel.height}).toEqual({x: -2, y: 1, width: 2, height: 2});
    expect([...cel.pixels]).toEqual([...firstCel.pixels]);
  });

  it.each([
    ["width", 0],
    ["height", 3],
    ["width", 1.5],
    ["width", 1],
    ["height", 1],
  ] as const)("rejects cel dimensions that do not match the canvas: %s=%s", (field, value) => {
    const document = createDocument({width: 2, height: 2});
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{width: number; height: number}>};
    payload.cels[0][field] = value;

    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project cel dimensions are invalid");
  });

  it.each([["x", 3], ["y", -3], ["x", 1], ["y", -1]] as const)("accepts integer cel offsets: %s=%s", (field, value) => {
    const document = createDocument({width: 2, height: 2});
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{x: number; y: number}>};
    payload.cels[0][field] = value;
    expect(decodeProject(JSON.stringify(payload)).cels[`${document.activeLayerId}:${document.activeFrameId}`][field]).toBe(value);
  });

  it("rejects fractional cel offsets", () => {
    const document = createDocument({width: 2, height: 2});
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{x: number; y: number}>};
    payload.cels[0].x = 1.5;
    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project cel pixels are invalid");
  });

  it("rejects linked cels whose dimensions and pixels do not match", () => {
    const document = createDocument({width: 2, height: 2});
    document.layers[0].continuous = true;
    addFrame(document);
    const payload = JSON.parse(encodeProject(document)) as {
      cels: Array<{linkId: string; width: number; height: number; pixels: string}>;
    };
    payload.cels[1].linkId = payload.cels[0].linkId;
    payload.cels[1].width = 1;
    payload.cels[1].pixels = bytesToBase64(new Uint8ClampedArray(1 * 2 * 4));

    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Linked cel pixels do not match");
  });

  it("rejects linked cels with mismatched pixels", () => {
    const document = createDocument({width: 2, height: 2});
    document.layers[0].continuous = true;
    addFrame(document);
    const payload = JSON.parse(encodeProject(document)) as {
      cels: Array<{linkId: string; width: number; height: number; pixels: string}>;
    };
    payload.cels[1].linkId = payload.cels[0].linkId;
    payload.cels[1].pixels = bytesToBase64(new Uint8ClampedArray(2 * 2 * 4).fill(1));

    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Linked cel pixels do not match");
  });

  it.each([".", "..", "../cel", "..\\cel", "cel..part"] as const)("rejects unsafe cel and link IDs: %s", (unsafeID) => {
    for (const field of ["id", "linkId"] as const) {
      const document = createDocument({width: 1, height: 1});
      const payload = JSON.parse(encodeProject(document)) as {cels: Array<{id: string; linkId: string}>};
      payload.cels[0][field] = unsafeID;

      expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project cel pixels are invalid");
    }
  });

  it("rejects v1 payloads because only the current strict v4 format is supported", () => {
    const payload = JSON.parse(encodeProject(createDocument({width: 1, height: 1}))) as Record<string, unknown>;
    payload.formatVersion = 1;

    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Unsupported .pixio format version");
  });

  it("uses a stable error for invalid cel Base64", () => {
    const document = createDocument({width: 1, height: 1});
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{pixels: string}>};
    payload.cels[0].pixels = "not-base64!";
    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project cel pixels are invalid");
  });

  it("round trips tilemaps, tilesets, embedded profiles, and pixel aspect ratio", () => {
    const document = createDocument({width: 2, height: 1});
    getActiveCel(document).pixels.set([255, 0, 0, 255, 0, 255, 0, 255]);
    document.colorProfile = {type: "embedded", name: "Test ICC", data: new Uint8Array([1, 2, 3, 4])};
    document.pixelAspectRatio = {width: 2, height: 1};
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 1, tileHeight: 1});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    for (const cel of converted.cels) document.cels[`${cel.layerId}:${cel.frameId}`] = cel;

    const decoded = decodeProject(encodeProject(document));
    expect(decoded.colorProfile).toMatchObject({type: "embedded", name: "Test ICC"});
    expect([...decoded.colorProfile.data!]).toEqual([1, 2, 3, 4]);
    expect(decoded.pixelAspectRatio).toEqual({width: 2, height: 1});
    expect(decoded.layers[0]).toMatchObject({kind: "tilemap", tilesetId: converted.tileset.id});
    expect(decoded.tilesets[0].tiles).toHaveLength(2);
    expect([...getActiveCel(decoded).tilemap!.tiles]).toEqual([1, 2]);
    expect([...getActiveCel(decoded).pixels]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it("strictly rejects missing color configuration and unknown tile references", () => {
    const document = createDocument({width: 1, height: 1});
    const missingProfile = JSON.parse(encodeProject(document)) as Record<string, unknown>;
    delete missingProfile.colorProfile;
    expect(() => decodeProject(JSON.stringify(missingProfile))).toThrow("Project color profile is invalid");

    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 1, tileHeight: 1});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    for (const cel of converted.cels) document.cels[`${cel.layerId}:${cel.frameId}`] = cel;
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{tilemap: {tiles: string}}>};
    payload.cels[0].tilemap.tiles = bytesToBase64(new Uint8ClampedArray([99, 0, 0, 0]));
    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project tilemap references an unknown tile");
  });
});

function bytesToBase64(bytes: Uint8ClampedArray) {
  return btoa(String.fromCharCode(...bytes));
}
