import {describe, expect, it} from "vitest";
import {addFrame, addFrameTag, createDocument} from "./document";
import {adjacentFocusedFrameId, focusedFrameIdAtEntry, focusedFrameRange, focusTagIdForFrame, tagContainsFrame} from "./timelineFocus";

describe("timeline tag focus", () => {
  it("resolves a focused tag to an inclusive frame range", () => {
    const document = createDocument({width: 1, height: 1});
    const second = addFrame(document);
    const third = addFrame(document);
    const fourth = addFrame(document);
    const tag = addFrameTag(document, "Walk", second.id, fourth.id, "forward")!;

    expect(focusedFrameRange(document, {tagId: tag.id})).toEqual({startIndex: 1, endIndex: 3, frameIds: [second.id, third.id, fourth.id]});
    expect(tagContainsFrame(document, tag.id, third.id)).toBe(true);
    expect(tagContainsFrame(document, tag.id, document.frames[0].id)).toBe(false);
    expect(focusedFrameIdAtEntry(document, {tagId: tag.id})).toBe(second.id);
  });

  it("uses the reverse tag endpoint as the playback entry frame", () => {
    const document = createDocument({width: 1, height: 1});
    const second = addFrame(document);
    const third = addFrame(document);
    const tag = addFrameTag(document, "Reverse", second.id, third.id, "reverse")!;
    expect(focusedFrameIdAtEntry(document, {tagId: tag.id})).toBe(third.id);
  });

  it("clamps navigation to focused or manual loop bounds", () => {
    const document = createDocument({width: 1, height: 1});
    const second = addFrame(document);
    const third = addFrame(document);
    const fourth = addFrame(document);
    const tag = addFrameTag(document, "Middle", second.id, third.id)!;

    expect(adjacentFocusedFrameId(document, second.id, -1, {tagId: tag.id})).toBe(null);
    expect(adjacentFocusedFrameId(document, second.id, 1, {tagId: tag.id})).toBe(third.id);
    expect(adjacentFocusedFrameId(document, third.id, 1, {tagId: tag.id})).toBe(null);
    expect(adjacentFocusedFrameId(document, second.id, -1, {}, document.frames[0].id, fourth.id)).toBe(document.frames[0].id);
  });

  it("finds a containing tag for an active frame and falls back cleanly", () => {
    const document = createDocument({width: 1, height: 1});
    const second = addFrame(document);
    const tag = addFrameTag(document, "Idle", document.frames[0].id, second.id)!;
    expect(focusTagIdForFrame(document, second.id)).toBe(tag.id);
    expect(focusTagIdForFrame(document, "missing")).toBeUndefined();
    expect(focusTagIdForFrame(document, second.id, tag.id)).toBe(tag.id);
  });
});
