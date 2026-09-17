import {frameIDsInRange, type FrameTag, type PixelDocument} from "./document";

/**
 * Frame-tag focus is editor-tab state, not document data. A focused tag keeps
 * its range active for navigation and playback while the project format
 * continues to persist only the tag definition itself.
 */
export interface TimelineTagFocus {
  tagId?: string;
}

export interface TimelineFrameRange {
  startIndex: number;
  endIndex: number;
  frameIds: string[];
}

export function focusedTag(document: PixelDocument, focus: TimelineTagFocus): FrameTag | null {
  if (!focus.tagId) return null;
  return document.tags.find((tag) => tag.id === focus.tagId) ?? null;
}

export function tagContainsFrame(document: PixelDocument, tagId: string | undefined, frameId: string): boolean {
  if (!tagId) return false;
  const tag = document.tags.find((candidate) => candidate.id === tagId);
  return Boolean(tag && frameIDsInRange(document, tag.fromFrameId, tag.toFrameId).includes(frameId));
}

export function focusedFrameRange(
  document: PixelDocument,
  focus: TimelineTagFocus,
  loopStartFrameId?: string,
  loopEndFrameId?: string,
): TimelineFrameRange {
  const tag = focusedTag(document, focus);
  const fromFrameId = tag?.fromFrameId ?? loopStartFrameId ?? document.frames[0]?.id;
  const toFrameId = tag?.toFrameId ?? loopEndFrameId ?? document.frames.at(-1)?.id;
  const fromIndex = document.frames.findIndex((frame) => frame.id === fromFrameId);
  const toIndex = document.frames.findIndex((frame) => frame.id === toFrameId);
  if (fromIndex < 0 || toIndex < 0) {
    return {
      startIndex: 0,
      endIndex: Math.max(0, document.frames.length - 1),
      frameIds: document.frames.map((frame) => frame.id),
    };
  }
  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);
  return {
    startIndex,
    endIndex,
    frameIds: document.frames.slice(startIndex, endIndex + 1).map((frame) => frame.id),
  };
}

export function focusedFrameIdAtEntry(document: PixelDocument, focus: TimelineTagFocus): string | null {
  const tag = focusedTag(document, focus);
  if (!tag) return null;
  return tag.direction === "reverse" ? tag.toFrameId : tag.fromFrameId;
}

export function adjacentFocusedFrameId(
  document: PixelDocument,
  frameId: string,
  direction: -1 | 1,
  focus: TimelineTagFocus,
  loopStartFrameId?: string,
  loopEndFrameId?: string,
): string | null {
  const range = focusedFrameRange(document, focus, loopStartFrameId, loopEndFrameId);
  const index = document.frames.findIndex((frame) => frame.id === frameId);
  if (index < range.startIndex || index > range.endIndex) return null;
  const nextIndex = index + direction;
  if (nextIndex < range.startIndex || nextIndex > range.endIndex) return null;
  return document.frames[nextIndex]?.id ?? null;
}

export function focusTagIdForFrame(document: PixelDocument, frameId: string, preferredTagId?: string): string | undefined {
  if (preferredTagId && tagContainsFrame(document, preferredTagId, frameId)) return preferredTagId;
  return document.tags.find((tag) => tagContainsFrame(document, tag.id, frameId))?.id;
}
