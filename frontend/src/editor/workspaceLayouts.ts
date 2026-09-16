export interface WorkspaceLayout {
  name: string;
  inspectorWidth: number;
  timelineHeight: number;
}

export const defaultWorkspaceDimensions = {
  inspectorWidth: 228,
  timelineHeight: 254,
};

const workspaceLayoutsStorageKey = "pixtorio-workspace-layouts";
const inspectorWidthRange = {min: 190, max: 420};
const timelineHeightRange = {min: 150, max: 520};

type WorkspaceLayoutReadStorage = Pick<Storage, "getItem">;
type WorkspaceLayoutWriteStorage = Pick<Storage, "getItem" | "setItem">;

function normalizeWorkspaceLayout(value: unknown): WorkspaceLayout | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<WorkspaceLayout>;
  if (typeof candidate.name !== "string") return null;

  const name = candidate.name.trim();
  if (!name || name.length > 64) return null;
  if (!isDimension(candidate.inspectorWidth, inspectorWidthRange.min, inspectorWidthRange.max)) return null;
  if (!isDimension(candidate.timelineHeight, timelineHeightRange.min, timelineHeightRange.max)) return null;

  return {
    name,
    inspectorWidth: candidate.inspectorWidth,
    timelineHeight: candidate.timelineHeight,
  };
}

function isDimension(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max;
}

function copyWorkspaceLayout(layout: WorkspaceLayout): WorkspaceLayout {
  return {
    name: layout.name,
    inspectorWidth: layout.inspectorWidth,
    timelineHeight: layout.timelineHeight,
  };
}

export function readWorkspaceLayouts(storage: WorkspaceLayoutReadStorage): WorkspaceLayout[] {
  const raw = storage.getItem(workspaceLayoutsStorageKey);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map(normalizeWorkspaceLayout)
    .filter((layout): layout is WorkspaceLayout => layout !== null)
    .map(copyWorkspaceLayout);
}

export function saveWorkspaceLayout(storage: WorkspaceLayoutWriteStorage, layout: WorkspaceLayout): WorkspaceLayout[] {
  const normalized = normalizeWorkspaceLayout(layout);
  if (!normalized) throw new Error("Invalid workspace layout");

  const layouts = readWorkspaceLayouts(storage);
  const existingIndex = layouts.findIndex((candidate) => candidate.name === normalized.name);
  if (existingIndex >= 0) layouts[existingIndex] = normalized;
  else layouts.push(normalized);

  storage.setItem(workspaceLayoutsStorageKey, JSON.stringify(layouts));
  return layouts.map(copyWorkspaceLayout);
}

export function deleteWorkspaceLayout(storage: WorkspaceLayoutWriteStorage, name: string): WorkspaceLayout[] {
  const targetName = name.trim();
  const layouts = readWorkspaceLayouts(storage).filter((layout) => layout.name !== targetName);
  storage.setItem(workspaceLayoutsStorageKey, JSON.stringify(layouts));
  return layouts.map(copyWorkspaceLayout);
}
