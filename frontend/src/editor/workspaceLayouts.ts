export interface WorkspaceLayout {
  name: string;
  inspectorWidth: number;
  timelineHeight: number;
}

export interface WorkspaceVisibility {
  inspectorVisible: boolean;
  timelineVisible: boolean;
}

export const defaultWorkspaceDimensions = {
  inspectorWidth: 228,
  timelineHeight: 254,
};

export const defaultWorkspaceVisibility: WorkspaceVisibility = {
  inspectorVisible: true,
  timelineVisible: true,
};

const workspaceLayoutsStorageKey = "pixtorio-workspace-layouts";
const workspaceVisibilityStorageKey = "pixtorio-workspace-visibility";
const inspectorWidthRange = {min: 190, max: 420};
const timelineHeightRange = {min: 150, max: 520};

type WorkspaceLayoutReadStorage = Pick<Storage, "getItem">;
type WorkspaceLayoutWriteStorage = Pick<Storage, "getItem" | "setItem">;
type WorkspaceVisibilityStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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

export function readWorkspaceVisibility(storage: WorkspaceLayoutReadStorage): WorkspaceVisibility {
  let raw: string | null;
  try {
    raw = storage.getItem(workspaceVisibilityStorageKey);
  } catch {
    return {...defaultWorkspaceVisibility};
  }
  if (!raw) return {...defaultWorkspaceVisibility};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isWorkspaceVisibility(parsed)) return {...defaultWorkspaceVisibility};
    return {
      inspectorVisible: parsed.inspectorVisible,
      timelineVisible: parsed.timelineVisible,
    };
  } catch {
    return {...defaultWorkspaceVisibility};
  }
}

export function saveWorkspaceVisibility(storage: WorkspaceVisibilityStorage, visibility: WorkspaceVisibility): void {
  if (!isWorkspaceVisibility(visibility)) throw new Error("Invalid workspace visibility");
  storage.setItem(workspaceVisibilityStorageKey, JSON.stringify(visibility));
}

export function resetWorkspaceVisibility(storage: WorkspaceVisibilityStorage): WorkspaceVisibility {
  storage.removeItem(workspaceVisibilityStorageKey);
  return {...defaultWorkspaceVisibility};
}

function isWorkspaceVisibility(value: unknown): value is WorkspaceVisibility {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<WorkspaceVisibility>;
  return typeof candidate.inspectorVisible === "boolean" && typeof candidate.timelineVisible === "boolean";
}
