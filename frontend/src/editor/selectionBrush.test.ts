import {describe, expect, it} from "vitest";
import {createDocument, getActiveCel} from "./document";
import {captureSelectionBrush} from "./selectionBrush";

describe("selection brush capture", () => {
  it("uses partial Cel offsets and preserves color with selection coverage in alpha", () => {
    const cel = getActiveCel(createDocument({width: 8, height: 8}));
    Object.assign(cel, {x: 3, y: 4, width: 2, height: 1, pixels: new Uint8ClampedArray([200, 40, 60, 128, 20, 100, 220, 255])});
    const captured = captureSelectionBrush(cel, {x: 2, y: 4, width: 3, height: 1, mask: new Uint8Array([255, 128, 255])})!;
    expect([...captured.pattern.pixels]).toEqual([0,0,0,0,200,40,60,64,20,100,220,255]);
    expect([...captured.bitmap.mask]).toEqual([0,1,1]);
    expect(captured.pattern).toMatchObject({sourceX:2,sourceY:4,width:3,height:1});
    cel.pixels.fill(0);
    expect(captured.pattern.pixels[7]).toBe(64);
  });
  it("does not manufacture color from empty selected pixels and rejects oversized footprints", () => {
    const cel = getActiveCel(createDocument({width: 64, height: 64}));
    expect(captureSelectionBrush(cel, {x:0,y:0,width:65,height:1})).toBeNull();
    const empty = captureSelectionBrush(cel, {x:0,y:0,width:2,height:2})!;
    expect(empty.pattern.pixels.some(Boolean)).toBe(false);
    expect(empty.bitmap.mask.some(Boolean)).toBe(false);
  });
});
