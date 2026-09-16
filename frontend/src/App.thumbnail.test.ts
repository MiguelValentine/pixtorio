import {describe, expect, it} from "vitest";

import {combinePixelBounds, createEditorTab, touchAllTabThumbnails, touchTabThumbnailCels} from "./App";
import {addLayer, createDocument, getCel} from "./editor/document";

describe("thumbnail revisions", () => {
  it("invalidates only the Cel that changed during a pixel edit", () => {
    const document = createDocument({width: 2, height: 2});
    const bottom = getCel(document, document.activeLayerId, document.activeFrameId)!;
    const layer = addLayer(document, "Top");
    const top = getCel(document, layer.id, document.activeFrameId)!;
    const tab = createEditorTab(document, "tab");

    touchTabThumbnailCels(tab, [top.id]);

    expect(tab.thumbnailRevisions.get(top.id)).toBe(1);
    expect(tab.thumbnailRevisions.get(bottom.id)).toBeUndefined();
  });

  it("invalidates every Cel after a structural document command", () => {
    const document = createDocument({width: 2, height: 2});
    const layer = addLayer(document, "Top");
    const tab = createEditorTab(document, "tab");

    touchAllTabThumbnails(tab);

    for (const cel of Object.values(document.cels)) expect(tab.thumbnailRevisions.get(cel.id)).toBe(1);
    expect(tab.thumbnailRevisions.size).toBe(2);
    expect(layer.id).toBeTruthy();
  });
});

describe("pixel invalidation bounds", () => {
  it("merges multiple edits into one rectangle for an animation frame", () => {
    const first = {x: 8, y: 12, width: 4, height: 3};
    const merged = combinePixelBounds(first, {x: 5, y: 10, width: 7, height: 8});

    expect(merged).toEqual({x: 5, y: 10, width: 7, height: 8});
    expect(combinePixelBounds(merged, {x: 12, y: 16, width: 2, height: 2})).toEqual({x: 5, y: 10, width: 9, height: 8});
  });
});
