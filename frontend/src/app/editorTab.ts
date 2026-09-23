import type {CelAddress} from "../editor/celClipboard";
import {FrameCompositeCache} from "../editor/compositingCache";
import {
  frameIDsInRange,
  getLayerByID,
  isCelLayer,
  type PixelBounds,
  type PixelDocument,
} from "../editor/document";
import {CommandHistory, DocumentStateCommand, defaultHistoryLimitBytes} from "../editor/history";
import {readPreferences} from "../editor/preferences";
import type {Selection} from "../editor/selection";
import {focusedFrameIdAtEntry} from "../editor/timelineFocus";
import {normalizeCelSelection} from "../editor/timelineSelection";

export type CommandScope = "canvas" | "layer" | "frame" | "cels";

export interface EditorTab {
  id: string;
  filePath?: string;
  document: PixelDocument;
  history: CommandHistory<PixelDocument>;
  selection: Selection | null;
  transformPivot: {x: number; y: number} | null;
  lastSelection: Selection | null;
  selectedCelKeys: string[];
  celSelectionAnchor: CelAddress | null;
  selectedLayerIds: string[];
  layerSelectionAnchorId: string;
  commandScope: CommandScope;
  selectedFrameIds: string[];
  frameSelectionAnchorId: string;
  loopStartFrameId: string;
  loopEndFrameId: string;
  activeTagId?: string;
  collapsedGroupIds: Set<string>;
  zoom: number;
  cursor: {x: number; y: number} | null;
  status: string;
  compositeCache: FrameCompositeCache;
  thumbnailRevision: number;
  thumbnailRevisions: Map<string, number>;
}

export function createTabID() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `document-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function storedHistoryLimitBytes() {
  if (typeof localStorage === "undefined") return defaultHistoryLimitBytes;
  return Math.round(readPreferences(localStorage).undo.memoryLimitMB) * 1024 * 1024;
}

export function createEditorTab(document: PixelDocument, id = createTabID(), filePath?: string, isDirty = false): EditorTab {
  const firstFrameId = document.frames[0].id;
  const lastFrameId = document.frames.at(-1)!.id;
  const history = new CommandHistory<PixelDocument>(storedHistoryLimitBytes());
  if (isDirty) history.markDirty();
  return {
    id,
    filePath,
    document,
    history,
    selection: null,
    transformPivot: null,
    lastSelection: null,
    selectedCelKeys: [],
    celSelectionAnchor: null,
    selectedLayerIds: [document.activeLayerId],
    layerSelectionAnchorId: document.activeLayerId,
    commandScope: "canvas",
    selectedFrameIds: [document.activeFrameId],
    frameSelectionAnchorId: document.activeFrameId,
    loopStartFrameId: firstFrameId,
    loopEndFrameId: lastFrameId,
    collapsedGroupIds: new Set<string>(),
    zoom: 12,
    cursor: null,
    status: "Ready",
    compositeCache: new FrameCompositeCache(),
    thumbnailRevision: 0,
    thumbnailRevisions: new Map<string, number>(),
  };
}

export function touchTabThumbnailCels(tab: EditorTab, celIDs: Iterable<string>) {
  const revision = ++tab.thumbnailRevision;
  for (const celID of celIDs) tab.thumbnailRevisions.set(celID, revision);
}

export function touchAllTabThumbnails(tab: EditorTab) {
  touchTabThumbnailCels(tab, Object.values(tab.document.cels).map((cel) => cel.id));
}

export function combinePixelBounds(current: PixelBounds | null, next: PixelBounds) {
  if (!current) return next;
  const x = Math.min(current.x, next.x);
  const y = Math.min(current.y, next.y);
  return {
    x,
    y,
    width: Math.max(current.x + current.width, next.x + next.width) - x,
    height: Math.max(current.y + current.height, next.y + next.height) - y,
  };
}

export function projectPathKey(path: string) {
  return path.replace(/\//g, "\\").toLocaleLowerCase("en-US");
}

export interface TabTimelineHistoryState {
  selectedFrameIds: string[];
  frameSelectionAnchorId: string;
  loopStartFrameId: string;
  loopEndFrameId: string;
  activeTagId?: string;
  selectedCelKeys: string[];
  celSelectionAnchor: CelAddress | null;
  commandScope: CommandScope;
  selectedLayerIds: string[];
  layerSelectionAnchorId: string;
}

export function captureTabTimeline(tab: EditorTab): TabTimelineHistoryState {
  return {
    selectedFrameIds: [...tab.selectedFrameIds],
    frameSelectionAnchorId: tab.frameSelectionAnchorId,
    loopStartFrameId: tab.loopStartFrameId,
    loopEndFrameId: tab.loopEndFrameId,
    activeTagId: tab.activeTagId,
    selectedCelKeys: [...tab.selectedCelKeys],
    celSelectionAnchor: tab.celSelectionAnchor ? {...tab.celSelectionAnchor} : null,
    commandScope: tab.commandScope,
    selectedLayerIds: [...tab.selectedLayerIds],
    layerSelectionAnchorId: tab.layerSelectionAnchorId,
  };
}

function restoreTabTimeline(tab: EditorTab, state: TabTimelineHistoryState) {
  tab.selectedFrameIds = [...state.selectedFrameIds];
  tab.frameSelectionAnchorId = state.frameSelectionAnchorId;
  tab.loopStartFrameId = state.loopStartFrameId;
  tab.loopEndFrameId = state.loopEndFrameId;
  tab.activeTagId = state.activeTagId;
  tab.selectedCelKeys = [...state.selectedCelKeys];
  tab.celSelectionAnchor = state.celSelectionAnchor ? {...state.celSelectionAnchor} : null;
  tab.commandScope = state.commandScope;
  tab.selectedLayerIds = [...state.selectedLayerIds];
  tab.layerSelectionAnchorId = state.layerSelectionAnchorId;
}

export function syncTabToActiveTag(tab: EditorTab) {
  const tag = tab.activeTagId ? tab.document.tags.find((candidate) => candidate.id === tab.activeTagId) : undefined;
  if (!tag) return false;
  const frameIds = frameIDsInRange(tab.document, tag.fromFrameId, tag.toFrameId);
  if (frameIds.length === 0) return false;
  tab.selectedFrameIds = frameIds;
  tab.frameSelectionAnchorId = tag.fromFrameId;
  tab.loopStartFrameId = tag.fromFrameId;
  tab.loopEndFrameId = tag.toFrameId;
  setTabCommandScope(tab, "frame");
  if (!frameIds.includes(tab.document.activeFrameId)) {
    tab.document.activeFrameId = focusedFrameIdAtEntry(tab.document, {tagId: tag.id}) ?? tag.fromFrameId;
  }
  return true;
}

export function normalizeTabTimeline(tab: EditorTab, syncActiveTag = false) {
  const frameIds = tab.document.frames.map((frame) => frame.id);
  const valid = new Set(frameIds);
  tab.selectedFrameIds = tab.selectedFrameIds.filter((frameId) => valid.has(frameId));
  if (tab.selectedFrameIds.length === 0) tab.selectedFrameIds = [tab.document.activeFrameId];
  if (!valid.has(tab.frameSelectionAnchorId)) tab.frameSelectionAnchorId = tab.document.activeFrameId;
  if (!valid.has(tab.loopStartFrameId)) tab.loopStartFrameId = frameIds[0];
  if (!valid.has(tab.loopEndFrameId)) tab.loopEndFrameId = frameIds.at(-1)!;
  if (tab.activeTagId && !tab.document.tags.some((tag) => tag.id === tab.activeTagId)) tab.activeTagId = undefined;
  else if (syncActiveTag) syncTabToActiveTag(tab);

  const activeLayer = getLayerByID(tab.document, tab.document.activeLayerId);
  const validLayerIds = new Set(tab.document.layers.map((layer) => layer.id));
  tab.selectedLayerIds = tab.selectedLayerIds.filter((layerId) => validLayerIds.has(layerId));
  if (tab.selectedLayerIds.length === 0) tab.selectedLayerIds = [tab.document.activeLayerId];
  if (!validLayerIds.has(tab.layerSelectionAnchorId)) tab.layerSelectionAnchorId = tab.document.activeLayerId;
  if (tab.commandScope === "cels" && activeLayer && isCelLayer(activeLayer)) {
    const normalized = normalizeCelSelection(
      tab.document,
      tab.selectedCelKeys,
      tab.celSelectionAnchor,
      tab.commandScope,
    );
    tab.selectedCelKeys = normalized.keys;
    tab.celSelectionAnchor = normalized.anchor;
  } else {
    tab.selectedCelKeys = [];
    tab.celSelectionAnchor = null;
    if (tab.commandScope === "cels") tab.commandScope = "layer";
  }
}

export function setTabCommandScope(tab: EditorTab, scope: CommandScope) {
  tab.commandScope = scope;
  if (scope !== "cels") {
    tab.selectedCelKeys = [];
    tab.celSelectionAnchor = null;
  }
  if (scope !== "canvas") tab.selection = null;
  if (scope === "layer" && !tab.selectedLayerIds.includes(tab.document.activeLayerId)) {
    tab.selectedLayerIds = [tab.document.activeLayerId];
    tab.layerSelectionAnchorId = tab.document.activeLayerId;
  }
}

export function syncPlaybackFrameSelection(tab: EditorTab, frameId = tab.document.activeFrameId) {
  if (!tab.document.frames.some((frame) => frame.id === frameId)) return false;
  tab.document.activeFrameId = frameId;
  tab.selectedFrameIds = [frameId];
  tab.frameSelectionAnchorId = frameId;
  setTabCommandScope(tab, "frame");
  return true;
}

export function shouldExtendTimelineLoopAfterInsertion(tab: EditorTab) {
  if (tab.activeTagId) return false;
  return frameIDsInRange(tab.document, tab.loopStartFrameId, tab.loopEndFrameId).length === tab.document.frames.length;
}

export function extendTimelineLoopAfterInsertion(tab: EditorTab, shouldExtend: boolean) {
  if (!shouldExtend || tab.document.frames.length === 0) return;
  tab.loopStartFrameId = tab.document.frames[0].id;
  tab.loopEndFrameId = tab.document.frames.at(-1)!.id;
}

export class EditorDocumentStateCommand extends DocumentStateCommand {
  constructor(
    before: PixelDocument,
    after: PixelDocument,
    label: string,
    private readonly tab: EditorTab,
    private readonly beforeTimeline: TabTimelineHistoryState,
    private readonly afterTimeline: TabTimelineHistoryState,
  ) {
    super(before, after, label);
  }

  override undo(document: PixelDocument) {
    super.undo(document);
    restoreTabTimeline(this.tab, this.beforeTimeline);
  }

  override redo(document: PixelDocument) {
    super.redo(document);
    restoreTabTimeline(this.tab, this.afterTimeline);
  }
}
