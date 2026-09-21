export const commandShortcutIDs = [
  "new", "newFromSelection", "open", "importPNG", "importSpriteSheet", "importPNGSequence", "save", "saveAs", "exportPNG", "exportGIF", "exportSpriteSheet", "exportPNGSequence", "closeDocument",
  "undo", "redo", "selectAll", "deselect", "reselect", "copy", "copyMerged", "cut", "paste", "pasteSpecialNewSprite", "pasteSpecialNewLayer", "pasteSpecialReferenceLayer", "fillSelection", "strokeSelection", "copySelectionToLayer", "cutSelectionToLayer", "copySelectedFramesToDocument", "copySelectedLayersToDocument", "shiftPixelsLeft", "shiftPixelsRight", "shiftPixelsUp", "shiftPixelsDown",
  "selectOpaque", "selectColor", "selectAllLayerCels", "selectLinkedCels", "invertSelection", "growSelection", "shrinkSelection", "borderSelection", "featherSelection", "scaleSelection", "rotateSelectionCCW", "rotateSelectionCW", "flipSelectionHorizontal", "flipSelectionVertical", "applySelectionPosition", "applySelectionRotation", "createBrushFromSelection", "createPatternFromSelection", "createSliceFromSelection",
  "duplicateSprite", "spriteSize", "canvasSize", "trimCanvas", "rotateSpriteCW", "rotateSpriteCCW", "rotateSprite180", "flipSpriteHorizontal", "flipSpriteVertical", "colorConfiguration", "adjustmentBrightnessContrast", "adjustmentHSL", "adjustmentInvert", "adjustmentConvolution", "adjustmentMedian", "adjustmentDespeckle", "adjustmentCurves", "adjustmentHSVHSL", "adjustmentChannels", "effectOutline", "effectShading",
  "addPaletteColor", "updatePaletteColor", "removePaletteColor", "extractPalette", "sortPalette", "saveDefaultPalette", "applyDefaultPalette", "resetDefaultPalette", "importPalette", "exportGPL", "exportJASCPAL",
  "addLayer", "addGroup", "addTilemapLayer", "convertLayerToTilemap", "duplicateLayer", "layerProperties", "moveLayerUp", "moveLayerDown", "mergeLayerDown", "mergeSelectedLayers", "flattenVisibleLayers", "toggleLayerVisibility", "toggleLayerLock", "toggleAlphaLock", "toggleContinuous",
  "addFrame", "newEmptyFrame", "duplicateFrame", "deleteFrame", "moveFrameBackward", "moveFrameForward", "previousFrame", "nextFrame", "reverseFrames", "createCels", "duplicateCels", "duplicateLinkedCels", "deleteCels", "linkCels", "unlinkCels", "celProperties", "applyCelTransform", "rasterizeCels", "togglePlayback", "addTag", "editTag", "deleteTag", "focusTag",
  "toggleInspector", "toggleTimeline", "togglePixelGrid", "toggleOnionSkin", "toggleCanvasOnly", "showAllPanels", "toggleFullscreen", "detachedPreview", "resetWorkspace", "showHistory", "openPreferences", "toggleTheme", "switchLanguage",
  "toggleGridSnap", "toggleMirrorX", "toggleMirrorY", "toggleTileX", "toggleTileY", "addVerticalGuide", "addHorizontalGuide", "setRGBA", "setGrayscale", "setIndexed", "setBitmap", "zoomIn", "zoomOut", "delete",
] as const;

export type CommandShortcutID = typeof commandShortcutIDs[number];

export const defaultCommandShortcuts: Record<CommandShortcutID, string> = {
  new: "Ctrl+N",
  newFromSelection: "Ctrl+Alt+N",
  open: "Ctrl+O",
  importPNG: "Ctrl+Alt+O",
  importSpriteSheet: "Ctrl+Alt+Shift+O",
  importPNGSequence: "Ctrl+Alt+Shift+I",
  save: "Ctrl+S",
  saveAs: "Ctrl+Shift+S",
  exportPNG: "Ctrl+Alt+E",
  exportGIF: "Ctrl+Alt+Shift+E",
  exportSpriteSheet: "Ctrl+Alt+Shift+S",
  exportPNGSequence: "Ctrl+Alt+Shift+P",
  closeDocument: "Ctrl+W",
  undo: "Ctrl+Z",
  redo: "Ctrl+Shift+Z",
  selectAll: "Ctrl+A",
  deselect: "Ctrl+D",
  reselect: "Ctrl+Shift+D",
  copy: "Ctrl+C",
  copyMerged: "Ctrl+Shift+C",
  cut: "Ctrl+X",
  paste: "Ctrl+V",
  pasteSpecialNewSprite: "Ctrl+Alt+V",
  pasteSpecialNewLayer: "Ctrl+Shift+V",
  pasteSpecialReferenceLayer: "Ctrl+Alt+Shift+V",
  fillSelection: "Shift+Backspace",
  strokeSelection: "Ctrl+Shift+Backspace",
  copySelectionToLayer: "Ctrl+Shift+J",
  cutSelectionToLayer: "Ctrl+Alt+J",
  copySelectedFramesToDocument: "Ctrl+Alt+Shift+J",
  copySelectedLayersToDocument: "Ctrl+Alt+Shift+K",
  shiftPixelsLeft: "Ctrl+Alt+ArrowLeft",
  shiftPixelsRight: "Ctrl+Alt+ArrowRight",
  shiftPixelsUp: "Ctrl+Alt+ArrowUp",
  shiftPixelsDown: "Ctrl+Alt+ArrowDown",
  selectOpaque: "Ctrl+Shift+O",
  selectColor: "Ctrl+Shift+P",
  selectAllLayerCels: "Alt+Shift+A",
  selectLinkedCels: "Alt+Shift+C",
  invertSelection: "Ctrl+I",
  growSelection: "Ctrl+Alt+]",
  shrinkSelection: "Ctrl+Alt+[",
  borderSelection: "",
  featherSelection: "",
  scaleSelection: "Ctrl+Alt+R",
  rotateSelectionCCW: "",
  rotateSelectionCW: "",
  flipSelectionHorizontal: "Ctrl+Alt+H",
  flipSelectionVertical: "Ctrl+Alt+Y",
  applySelectionPosition: "",
  applySelectionRotation: "",
  createBrushFromSelection: "",
  createPatternFromSelection: "",
  createSliceFromSelection: "",
  duplicateSprite: "Ctrl+Alt+D",
  spriteSize: "Ctrl+Alt+Shift+R",
  canvasSize: "Ctrl+Alt+C",
  trimCanvas: "Ctrl+Alt+T",
  rotateSpriteCW: "",
  rotateSpriteCCW: "",
  rotateSprite180: "",
  flipSpriteHorizontal: "",
  flipSpriteVertical: "",
  colorConfiguration: "",
  adjustmentBrightnessContrast: "",
  adjustmentHSL: "",
  adjustmentInvert: "",
  adjustmentConvolution: "",
  adjustmentMedian: "",
  adjustmentDespeckle: "",
  adjustmentCurves: "",
  adjustmentHSVHSL: "",
  adjustmentChannels: "",
  effectOutline: "",
  effectShading: "",
  addPaletteColor: "",
  updatePaletteColor: "",
  removePaletteColor: "",
  extractPalette: "",
  sortPalette: "",
  saveDefaultPalette: "",
  applyDefaultPalette: "",
  resetDefaultPalette: "",
  importPalette: "",
  exportGPL: "",
  exportJASCPAL: "",
  addLayer: "Ctrl+Shift+N",
  addGroup: "Ctrl+Shift+G",
  addTilemapLayer: "Ctrl+Alt+G",
  convertLayerToTilemap: "",
  duplicateLayer: "Ctrl+Shift+L",
  layerProperties: "Alt+Shift+Enter",
  moveLayerUp: "Ctrl+Alt+Shift+ArrowUp",
  moveLayerDown: "Ctrl+Alt+Shift+ArrowDown",
  mergeLayerDown: "Ctrl+E",
  mergeSelectedLayers: "Ctrl+Shift+E",
  flattenVisibleLayers: "Ctrl+Alt+F",
  toggleLayerVisibility: "Ctrl+Alt+L",
  toggleLayerLock: "Ctrl+Alt+Shift+L",
  toggleAlphaLock: "",
  toggleContinuous: "",
  addFrame: "Alt+N",
  newEmptyFrame: "Alt+Shift+N",
  duplicateFrame: "Alt+D",
  deleteFrame: "Alt+Delete",
  moveFrameBackward: "Alt+ArrowLeft",
  moveFrameForward: "Alt+ArrowRight",
  previousFrame: ",",
  nextFrame: ".",
  reverseFrames: "Alt+R",
  createCels: "Alt+C",
  duplicateCels: "Alt+Shift+D",
  duplicateLinkedCels: "Alt+Shift+K",
  deleteCels: "Alt+Shift+Delete",
  linkCels: "Alt+L",
  unlinkCels: "Alt+Shift+L",
  celProperties: "Alt+Enter",
  applyCelTransform: "Alt+Shift+T",
  rasterizeCels: "Alt+Shift+R",
  togglePlayback: "Enter",
  addTag: "Alt+T",
  editTag: "Alt+Shift+G",
  deleteTag: "Alt+Shift+Backspace",
  focusTag: "Alt+F",
  toggleInspector: "",
  toggleTimeline: "",
  togglePixelGrid: "",
  toggleOnionSkin: "Alt+O",
  toggleCanvasOnly: "Tab",
  showAllPanels: "",
  toggleFullscreen: "F11",
  detachedPreview: "Alt+P",
  resetWorkspace: "",
  showHistory: "Ctrl+H",
  openPreferences: "Ctrl+,",
  toggleTheme: "",
  switchLanguage: "",
  toggleGridSnap: "",
  toggleMirrorX: "",
  toggleMirrorY: "",
  toggleTileX: "",
  toggleTileY: "",
  addVerticalGuide: "",
  addHorizontalGuide: "",
  setRGBA: "",
  setGrayscale: "",
  setIndexed: "",
  setBitmap: "",
  zoomIn: "Ctrl+=",
  zoomOut: "Ctrl+-",
  delete: "Delete",
};

export const documentOptionalCommandIDs: ReadonlySet<CommandShortcutID> = new Set([
  "new", "open", "importPNG", "importSpriteSheet", "importPNGSequence", "toggleInspector", "toggleTimeline", "togglePixelGrid", "toggleCanvasOnly", "showAllPanels", "toggleFullscreen", "resetWorkspace", "openPreferences", "toggleTheme", "switchLanguage", "zoomIn", "zoomOut",
]);

export interface ShortcutEventLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export function shortcutFromEvent(event: ShortcutEventLike) {
  const raw = normalizeEventKey(event);
  if (["Control", "Shift", "Alt", "Meta"].includes(raw)) return "";
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(raw);
  return parts.join("+");
}

export function isUnmodifiedDeletionKey(event: ShortcutEventLike) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  const key = normalizeEventKey(event);
  return key === "Backspace" || key === "Delete";
}

export function normalizeShortcut(value: string) {
  const tokens = value.split("+").map((token) => token.trim()).filter(Boolean);
  const modifiers = new Set(tokens.slice(0, -1).map((token) => token.toLowerCase()));
  const key = normalizeKeyName(tokens.at(-1) ?? "");
  if (!key) return "";
  const result: string[] = [];
  if (modifiers.has("ctrl") || modifiers.has("control") || modifiers.has("cmd") || modifiers.has("meta")) result.push("Ctrl");
  if (modifiers.has("alt") || modifiers.has("option")) result.push("Alt");
  if (modifiers.has("shift")) result.push("Shift");
  result.push(key.length === 1 ? key.toUpperCase() : key);
  return result.join("+");
}

export function formatShortcutForPlatform(value: string, platform = typeof navigator !== "undefined" ? navigator.platform : "") {
  const normalized = normalizeShortcut(value);
  if (!normalized) return "";
  return /^Mac/i.test(platform) ? normalized.replace(/^Ctrl(?=\+|$)/, "Cmd") : normalized;
}

export function commandForShortcutEvent(event: ShortcutEventLike, assignments: Readonly<Record<CommandShortcutID, string>>) {
  const shortcut = shortcutFromEvent(event);
  if (!shortcut) return null;
  return (Object.keys(assignments) as CommandShortcutID[]).find((command) => normalizeShortcut(assignments[command]) === shortcut) ?? null;
}

export function assignCommandShortcut(assignments: Readonly<Record<CommandShortcutID, string>>, command: CommandShortcutID, shortcut: string) {
  const normalized = normalizeShortcut(shortcut);
  const next = {...assignments, [command]: normalized};
  for (const candidate of Object.keys(next) as CommandShortcutID[]) {
    if (candidate !== command && normalized && next[candidate] === normalized) next[candidate] = "";
  }
  return next;
}

function normalizeKeyName(key: string) {
  const aliases: Record<string, string> = {
    " ": "Space", escape: "Escape", esc: "Escape", del: "Delete", delete: "Delete", backspace: "Backspace", enter: "Enter", tab: "Tab",
    arrowleft: "ArrowLeft", arrowright: "ArrowRight", arrowup: "ArrowUp", arrowdown: "ArrowDown",
    bracketleft: "BracketLeft", bracketright: "BracketRight", ",": ",", "-": "-", "=": "=",
  };
  return aliases[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key);
}

function normalizeEventKey(event: ShortcutEventLike) {
  const codeAliases: Record<string, string> = {
    ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown",
    BracketLeft: "[", BracketRight: "]", Equal: "=", Minus: "-", Comma: ",",
  };
  return codeAliases[event.code ?? ""] ?? (event.key.length === 1 ? event.key.toUpperCase() : normalizeKeyName(event.key));
}
