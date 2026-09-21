import {type ToolID} from "./tools";

export const toolGroupIDs = [
  "drawing",
  "retouch",
  "navigation",
  "paths",
  "shapes",
  "fill",
  "selection",
  "crop",
  "eyedropper",
  "text",
] as const;

export type ToolGroupID = typeof toolGroupIDs[number];

export interface ToolGroup {
  readonly id: ToolGroupID;
  readonly tools: readonly ToolID[];
  readonly defaultTool: ToolID;
}

type ToolGroupDefinition<T extends readonly ToolID[]> = {
  readonly id: ToolGroupID;
  readonly tools: T;
  readonly defaultTool: T[number];
};

function defineToolGroup<const T extends readonly ToolID[]>(id: ToolGroupID, tools: T, defaultTool: T[number]): ToolGroupDefinition<T> {
  return {id, tools, defaultTool};
}

const toolGroupDefinitions = [
  defineToolGroup("drawing", ["pencil", "eraser", "spray"] as const, "pencil"),
  defineToolGroup("retouch", ["blur", "jumble", "contour", "replace-color"] as const, "blur"),
  defineToolGroup("navigation", ["move", "hand", "zoom"] as const, "move"),
  defineToolGroup("paths", ["line", "curve", "polyline"] as const, "line"),
  defineToolGroup("shapes", ["rectangle", "ellipse", "polygon"] as const, "rectangle"),
  defineToolGroup("fill", ["fill", "gradient"] as const, "fill"),
  defineToolGroup("selection", ["selection", "transform"] as const, "selection"),
  defineToolGroup("crop", ["crop", "slice"] as const, "crop"),
  defineToolGroup("eyedropper", ["eyedropper"] as const, "eyedropper"),
  defineToolGroup("text", ["text"] as const, "text"),
] as const;

type GroupedToolID = typeof toolGroupDefinitions[number]["tools"][number];
type MissingToolID = Exclude<ToolID, GroupedToolID>;
const allToolIDsAreGrouped: MissingToolID extends never ? true : never = true;

void allToolIDsAreGrouped;

export const toolGroups: readonly ToolGroup[] = toolGroupDefinitions;

function resolveToolGroup(group: ToolGroup | ToolGroupID): ToolGroup {
  if (typeof group !== "string") return group;

  const resolved = toolGroups.find((candidate) => candidate.id === group);
  if (!resolved) throw new Error(`Unknown tool group: ${group}`);
  return resolved;
}

/** Returns the group containing a tool, or undefined for an unknown runtime value. */
export function getToolGroup(tool: ToolID): ToolGroup | undefined {
  return toolGroups.find((group) => group.tools.includes(tool));
}

/** Returns the group's configured default tool. */
export function getDefaultTool(group: ToolGroup | ToolGroupID): ToolID {
  return resolveToolGroup(group).defaultTool;
}

/** Returns the active tool when it belongs to the group, otherwise the group default. */
export function getCurrentTool(group: ToolGroup | ToolGroupID, activeTool?: ToolID | null): ToolID {
  const resolved = resolveToolGroup(group);
  return activeTool && resolved.tools.includes(activeTool) ? activeTool : resolved.defaultTool;
}

export const findToolGroup = getToolGroup;
export const getDisplayedTool = getCurrentTool;
