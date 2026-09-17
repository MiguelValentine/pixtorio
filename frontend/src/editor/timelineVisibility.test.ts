import {describe, expect, it} from "vitest";
import {shouldAutoShowTimeline, timelineStructure} from "./timelineVisibility";

describe("timeline auto-show", () => {
  const before = timelineStructure("tab-1", 1, 1);

  it.each([
    ["a layer", timelineStructure("tab-1", 2, 1)],
    ["a frame", timelineStructure("tab-1", 1, 2)],
    ["a layer and a frame", timelineStructure("tab-1", 2, 2)],
  ])("shows the timeline when the active document gains %s", (_change, current) => {
    expect(shouldAutoShowTimeline(before, current, true)).toBe(true);
  });

  it.each([
    ["the preference is disabled", timelineStructure("tab-1", 2, 2), false],
    ["the active document changes", timelineStructure("tab-2", 2, 2), true],
    ["a layer or frame is removed", timelineStructure("tab-1", 1, 1), true],
    ["the structure is unchanged", timelineStructure("tab-1", 1, 1), true],
  ])("does not show the timeline when %s", (_change, current, enabled) => {
    expect(shouldAutoShowTimeline(before, current, enabled)).toBe(false);
  });
});
