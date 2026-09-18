import {describe, expect, it} from "vitest";

import {
  calculatePanelResizeValue,
  captureTabTimeline,
  createEditorTab,
  EditorDocumentStateCommand,
  extendTimelineLoopAfterInsertion,
  getTimelineHorizontalScrollbarHeight,
  getTimelineScrollTopForPeer,
  normalizeTabTimeline,
  shouldExtendTimelineLoopAfterInsertion,
  syncTimelineScrollPositions,
  syncPlaybackFrameSelection,
} from "./App";
import {
  addFrame,
  addFrameTag,
  cloneDocument,
  createDocument,
  deleteFrameTag,
  duplicateFrames,
  updateFrameTag,
} from "./editor/document";

describe("timeline history state", () => {
  it("restores tag selection and loop bounds across undo and redo", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const third = addFrame(document);
    const fourth = addFrame(document);
    const tag = addFrameTag(document, "Walk", first.id, second.id)!;
    const tab = createEditorTab(document, "tab");
    tab.activeTagId = tag.id;
    normalizeTabTimeline(tab, true);
    const beforeDocument = cloneDocument(document);
    const beforeTimeline = captureTabTimeline(tab);

    expect(updateFrameTag(document, tag.id, {fromFrameId: third.id, toFrameId: fourth.id, direction: "reverse"})).toBe(true);
    document.activeFrameId = fourth.id;
    normalizeTabTimeline(tab, true);
    const command = new EditorDocumentStateCommand(
      beforeDocument,
      document,
      "Edit Frame Tag",
      tab,
      beforeTimeline,
      captureTabTimeline(tab),
    );

    command.undo(document);
    normalizeTabTimeline(tab, true);
    expect(tab.activeTagId).toBe(tag.id);
    expect(tab.selectedFrameIds).toEqual([first.id, second.id]);
    expect([tab.loopStartFrameId, tab.loopEndFrameId]).toEqual([first.id, second.id]);
    expect(document.activeFrameId).toBe(first.id);

    command.redo(document);
    normalizeTabTimeline(tab, true);
    expect(tab.activeTagId).toBe(tag.id);
    expect(tab.selectedFrameIds).toEqual([third.id, fourth.id]);
    expect([tab.loopStartFrameId, tab.loopEndFrameId]).toEqual([third.id, fourth.id]);
    expect(document.activeFrameId).toBe(fourth.id);
  });

  it("reactivates a deleted tag when its deletion is undone", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const tag = addFrameTag(document, "Idle", first.id, second.id)!;
    const tab = createEditorTab(document, "tab");
    tab.activeTagId = tag.id;
    normalizeTabTimeline(tab, true);
    const beforeDocument = cloneDocument(document);
    const beforeTimeline = captureTabTimeline(tab);

    expect(deleteFrameTag(document, tag.id)).toBe(true);
    normalizeTabTimeline(tab);
    const command = new EditorDocumentStateCommand(
      beforeDocument,
      document,
      "Delete Frame Tag",
      tab,
      beforeTimeline,
      captureTabTimeline(tab),
    );

    command.undo(document);
    normalizeTabTimeline(tab, true);
    expect(tab.activeTagId).toBe(tag.id);
    expect(tab.selectedFrameIds).toEqual([first.id, second.id]);

    command.redo(document);
    normalizeTabTimeline(tab, true);
    expect(tab.activeTagId).toBeUndefined();
  });
});

describe("timeline playback and insertion state", () => {
  it("syncs playback to one frame and clears cel command state", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const tab = createEditorTab(document, "tab");
    tab.commandScope = "cels";
    tab.selectedCelKeys = ["layer-1:frame-1"];
    tab.celSelectionAnchor = {layerId: document.activeLayerId, frameId: first.id};

    expect(syncPlaybackFrameSelection(tab, first.id)).toBe(true);
    expect(document.activeFrameId).toBe(first.id);
    expect(tab.selectedFrameIds).toEqual([first.id]);
    expect(tab.frameSelectionAnchorId).toBe(first.id);
    expect(tab.commandScope).toBe("frame");
    expect(tab.selectedCelKeys).toEqual([]);
    expect(tab.celSelectionAnchor).toBeNull();

    expect(syncPlaybackFrameSelection(tab, second.id)).toBe(true);
    expect(document.activeFrameId).toBe(second.id);
    expect(tab.selectedFrameIds).toEqual([second.id]);
    expect(tab.frameSelectionAnchorId).toBe(second.id);
  });

  it.each([
    ["add", (document: ReturnType<typeof createDocument>) => addFrame(document)],
    ["duplicate", (document: ReturnType<typeof createDocument>) => duplicateFrames(document, [document.activeFrameId])[0]],
  ])("extends a full loop after %s frame insertion", (_operation, insertFrame) => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    addFrame(document);
    const lastBeforeInsert = addFrame(document);
    const tab = createEditorTab(document, "tab");
    tab.loopStartFrameId = first.id;
    tab.loopEndFrameId = lastBeforeInsert.id;

    const shouldExtend = shouldExtendTimelineLoopAfterInsertion(tab);
    const inserted = insertFrame(document);
    expect(inserted).toBeDefined();
    extendTimelineLoopAfterInsertion(tab, shouldExtend);

    expect([tab.loopStartFrameId, tab.loopEndFrameId]).toEqual([
      document.frames[0].id,
      document.frames.at(-1)!.id,
    ]);
  });

  it("keeps a custom loop range when a frame is inserted", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const third = addFrame(document);
    const tab = createEditorTab(document, "tab");
    tab.loopStartFrameId = second.id;
    tab.loopEndFrameId = third.id;

    const shouldExtend = shouldExtendTimelineLoopAfterInsertion(tab);
    addFrame(document);
    extendTimelineLoopAfterInsertion(tab, shouldExtend);

    expect(shouldExtend).toBe(false);
    expect([tab.loopStartFrameId, tab.loopEndFrameId]).toEqual([second.id, third.id]);
    expect(tab.loopStartFrameId).not.toBe(first.id);
  });
});

describe("timeline scrolling and panel resizing", () => {
  it("keeps both timeline columns at one scroll position within the peer range", () => {
    const layers = {scrollTop: 0, scrollHeight: 1000, clientHeight: 400};
    const frames = {scrollTop: 615, scrollHeight: 1000, clientHeight: 385};

    expect(getTimelineScrollTopForPeer(frames, layers)).toBe(600);
    expect(syncTimelineScrollPositions(frames, layers)).toBe(600);
    expect(frames.scrollTop).toBe(600);
    expect(layers.scrollTop).toBe(600);
  });

  it("uses the frame pane horizontal scrollbar height as layer bottom padding", () => {
    expect(getTimelineHorizontalScrollbarHeight({offsetHeight: 300, clientHeight: 285})).toBe(15);
    expect(getTimelineHorizontalScrollbarHeight({offsetHeight: 300, clientHeight: 300})).toBe(0);
  });

  it("converts pointer deltas from scaled UI coordinates before clamping", () => {
    expect(calculatePanelResizeValue(254, 200, 100, 100, 150, 520)).toBe(354);
    expect(calculatePanelResizeValue(254, 200, 100, 200, 150, 520)).toBe(304);
    expect(calculatePanelResizeValue(254, 200, 1000, 200, 150, 520)).toBe(150);
  });

  it("rounds fractional scaled resize values to integer CSS pixels while clamping", () => {
    const resized = calculatePanelResizeValue(254, 200.5, 100.25, 150, 150, 520);

    expect(resized).toBe(321);
    expect(Number.isInteger(resized)).toBe(true);
    expect(calculatePanelResizeValue(500, 300.25, 0.5, 125, 150, 520)).toBe(520);
    expect(calculatePanelResizeValue(170, 100.25, 400.5, 150, 150, 520)).toBe(150);
  });
});
