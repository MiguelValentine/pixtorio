import {describe, expect, it} from "vitest";

import {toolNames, type ToolID} from "./tools";
import {
  findToolGroup,
  getCurrentTool,
  getDefaultTool,
  getDisplayedTool,
  getToolGroup,
  toolGroups,
} from "./toolGroups";

const expectedGroups = [
  {id: "drawing", tools: ["pencil", "eraser", "spray"], defaultTool: "pencil"},
  {id: "retouch", tools: ["blur", "jumble", "contour", "replace-color"], defaultTool: "blur"},
  {id: "navigation", tools: ["move", "hand", "zoom"], defaultTool: "move"},
  {id: "paths", tools: ["line", "curve", "polyline"], defaultTool: "line"},
  {id: "shapes", tools: ["rectangle", "ellipse", "polygon"], defaultTool: "rectangle"},
  {id: "fill", tools: ["fill", "gradient"], defaultTool: "fill"},
  {id: "selection", tools: ["selection", "transform"], defaultTool: "selection"},
  {id: "crop", tools: ["crop", "slice"], defaultTool: "crop"},
  {id: "eyedropper", tools: ["eyedropper"], defaultTool: "eyedropper"},
  {id: "text", tools: ["text"], defaultTool: "text"},
] as const;

describe("tool groups", () => {
  it("contains every ToolID exactly once", () => {
    const allToolIDs = Object.keys(toolNames) as ToolID[];
    const groupedToolIDs = toolGroups.flatMap((group) => group.tools);

    expect(groupedToolIDs).toHaveLength(allToolIDs.length);
    expect(new Set(groupedToolIDs).size).toBe(groupedToolIDs.length);
    expect([...groupedToolIDs].sort()).toEqual([...allToolIDs].sort());
  });

  it("keeps group and tool order stable", () => {
    expect(toolGroups).toEqual(expectedGroups);
  });

  it("finds the owning group for every ToolID", () => {
    for (const group of toolGroups) {
      for (const tool of group.tools) {
        expect(getToolGroup(tool)).toBe(group);
        expect(findToolGroup(tool)).toBe(group);
      }
    }
  });

  it("returns group defaults and preserves an active tool inside its group", () => {
    for (const group of toolGroups) {
      const lastTool = group.tools[group.tools.length - 1];

      expect(getDefaultTool(group)).toBe(group.defaultTool);
      expect(getDefaultTool(group.id)).toBe(group.defaultTool);
      expect(getCurrentTool(group)).toBe(group.defaultTool);
      expect(getCurrentTool(group, null)).toBe(group.defaultTool);
      expect(getCurrentTool(group, lastTool)).toBe(lastTool);
      expect(getDisplayedTool(group, lastTool)).toBe(lastTool);
    }
  });

  it("falls back to the group default when the active tool belongs elsewhere", () => {
    const drawing = getToolGroup("pencil")!;
    const outsideTool = getToolGroup("blur")!.tools[0];

    expect(getCurrentTool(drawing, outsideTool)).toBe(drawing.defaultTool);
  });
});
