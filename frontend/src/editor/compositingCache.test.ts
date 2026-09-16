import {describe, expect, it} from "vitest";

import {FrameCompositeCache} from "./compositingCache";
import {addFrame, addLayer, compositeFrame, createDocument, getCel} from "./document";
import {setPixel} from "./pixels";

describe("FrameCompositeCache", () => {
  it("repairs only the invalidated rectangle with the same result as a full composite", () => {
    const document = createDocument({width: 4, height: 3});
    const bottom = document.layers[0];
    const top = addLayer(document, "Top");
    const frameId = document.activeFrameId;
    const cache = new FrameCompositeCache();
    const initial = cache.get(document, frameId);

    setPixel(getCel(document, bottom.id, frameId)!.pixels, 4, 3, 1, 1, [20, 40, 80, 255]);
    setPixel(getCel(document, top.id, frameId)!.pixels, 4, 3, 1, 1, [240, 120, 30, 160]);
    const repaired = cache.repair(document, frameId, {x: 1, y: 1, width: 1, height: 1});

    expect(repaired).toBe(initial);
    expect(Array.from(repaired)).toEqual(Array.from(compositeFrame(document, frameId)));
  });

  it("does not carry cached pixels across an explicit structural invalidation", () => {
    const document = createDocument({width: 2, height: 1});
    const cache = new FrameCompositeCache();
    const before = cache.get(document);
    setPixel(getCel(document, document.activeLayerId, document.activeFrameId)!.pixels, 2, 1, 0, 0, [1, 2, 3, 255]);
    cache.clear();

    const after = cache.get(document);
    expect(after).not.toBe(before);
    expect(Array.from(after)).toEqual(Array.from(compositeFrame(document)));
  });

  it("bounds retained frames and evicts the least recently used result", () => {
    const document = createDocument({width: 2, height: 2});
    const firstFrameId = document.activeFrameId;
    const cache = new FrameCompositeCache(16);
    const first = cache.get(document, firstFrameId);
    const secondFrame = addFrame(document);
    cache.get(document, secondFrame.id);

    expect(cache.byteSize).toBe(16);
    const reloadedFirst = cache.get(document, firstFrameId);
    expect(reloadedFirst).not.toBe(first);
    expect(cache.byteSize).toBe(16);
  });

  it("does not retain an individual frame that exceeds the cache budget", () => {
    const document = createDocument({width: 2, height: 2});
    const cache = new FrameCompositeCache(15);
    const first = cache.get(document);
    const second = cache.get(document);

    expect(cache.byteSize).toBe(0);
    expect(second).not.toBe(first);
  });
});
