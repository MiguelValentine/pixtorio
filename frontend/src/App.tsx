import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode} from "react";
import {GIFEncoder, applyPalette, quantize} from "gifenc";
import {createPortal, flushSync} from "react-dom";
import {
  Blend,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Hand,
  X,
  BoxSelect,
  Circle,
  ClipboardPaste,
  Copy,
  Crop,
  Diamond,
  Droplets,
  Download,
  Eraser,
  FolderOpen,
  Grid2X2,
  History as HistoryIcon,
  Layers,
  Eye,
  EyeOff,
  Fullscreen,
  FileImage,
  FileDown,
  FilePlus,
  FileUp,
  FlipHorizontal2,
  FlipVertical2,
  FolderPlus,
  Folder,
  Lock,
  Languages,
  Link2,
  Merge,
  MoreHorizontal,
  Move,
  PanelTopOpen,
  Minus,
  PaintBucket,
  Pause,
  Pentagon,
  Play,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  Replace,
  RotateCcw,
  RotateCw,
  Save,
  SaveAll,
  Scissors,
  Scaling,
  Settings,
  Slash,
  SlidersHorizontal,
  Spline,
  SprayCan,
  Square,
  SquaresUnite,
  Sun,
  Target,
  Type,
  ZoomIn,
  Slice as SliceIcon,
  Shuffle,
  Trash2,
  Undo2,
  Unlink2,
  Unlock,
  Waypoints,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import {ClearRecovery, ClipboardReadImage, ClipboardWriteImage, ImportPNG, ImportPNGSequence, LoadRecovery, OpenPixio, OpenPixioPath, OpenStartupProject, OpenTilemapData, SaveGIFWithOptions, SavePackedAtlas, SavePixio, SavePixioPath, SavePNGWithOptions, SavePNGSequence, SaveRecovery, SaveTilemapData, SetWindowCloseState} from "../wailsjs/go/main/App";
import {ClipboardGetText, ClipboardSetText, EventsOn, WindowFullscreen, WindowIsFullscreen, WindowUnfullscreen} from "../wailsjs/runtime/runtime";
import {useConstrainedMenuStyle} from "./menuPositioning";
import {ClaimMCPCommand, CompleteMCPCommand, SetMCPReady} from "../wailsjs/go/main/App";
import {handleMCPWorkspaceCommand, type MCPWorkspaceTab} from "./editor/mcpWorkspace";
import {defaultWorkspaceDimensions, defaultWorkspaceVisibility, readWorkspaceCanvasOnly, readWorkspaceLayouts, readWorkspaceVisibility, saveWorkspaceCanvasOnly, saveWorkspaceLayout, saveWorkspaceVisibility, deleteWorkspaceLayout} from "./editor/workspaceLayouts";
import {applyNewDocumentPreferenceDefaults, readPreferences, savePreferences, type AppPreferences} from "./editor/preferences";
import {shouldAutoShowTimeline, timelineStructure} from "./editor/timelineVisibility";
import {readDefaultPalette, saveDefaultPalette, resetDefaultPalette} from "./editor/defaultPalette";
import {applyDocumentPalette, relocateTransparentIndex} from "./editor/paletteOperations";
import {applyPixelAspectRatio, normalizePixelAspectRatio, resizePixels} from "./editor/pixelAspectRatio";
import {CurveEditor} from "./CurveEditor";
import {BrushPresetPanel} from "./BrushPresetPanel";
import {BrushDynamicsPanel} from "./BrushDynamicsPanel";
import {ColorSelector} from "./ColorSelector";
import {PreferencesPanel} from "./PreferencesPanel";
import type {ColorSelectorMode} from "./editor/colorSelector";
import type {BrushPresetSettings} from "./editor/brushPresets";
import {captureSelectionBrush} from "./editor/selectionBrush";
import {patternBrushTools, type PatternBrush, type PatternAlignment} from "./editor/tools";
import {getToolGroup, toolGroups, type ToolGroup} from "./editor/toolGroups";
import {identityCurvePoints} from "./editor/curveEditor";
import type {CurvePoint} from "./editor/adjustments";
import "./App.css";
import {
  addLayer,
  addLayerGroup,
  addTilemapLayer,
  addFrame,
  addEmptyFrame,
  adjacentFrameID,
  addFrameTag,
  addSlice,
  addSliceKey,
  cloneDocument,
  compositeFrame,
  compositeFrameForExport,
  compositeFrameWithOnionSkin,
  createDocument,
  cropDocument,
  resizeDocument,
  deleteFrames,
  deleteFrameTag,
  deleteSlice,
  deleteSliceKey,
  deleteLayer,
  deleteCel,
  duplicateDocument,
  duplicateLayer,
  flattenVisibleLayers,
  duplicateFrames,
  ensureCel,
  frameIDsInRange,
  getActiveCel,
  getActiveLayer,
  getCel,
  getLayerByID,
  isCelLinked,
  isCelLayer,
  isImageLayer,
  isEditableImageLayer,
  isTilemapLayer,
  isLayerEffectivelyLocked,
  linkCels,
  mergeLayerDown,
  moveLayer,
  moveFrames,
  reverseFrames,
  nextCopyName,
  nextLayerName,
  nextGroupName,
  nextTagName,
  renameLayer,
  setLayerLocked,
  setLayerBlendMode,
  setLayerAlphaLock,
  setLayerContinuous,
  setLayerRole,
  setLayerOpacity,
  setCelProperties,
  setLayerVisibility,
  setPixelAspectRatio,
  setFramesDuration,
  timelineLayerEntries,
  unlinkCels,
  updateFrameTag,
  updateSlice,
  updateSliceKey,
  type BlendMode,
  type ColorMode,
  type PixelBounds,
  type SliceKeyUpdate,
  type TagDirection,
  type PixelDocument,
  type Tileset,
  type TilemapData,
  type LayerRole,
} from "./editor/document";
import {
  addTileInPlace,
  cleanupTilesetInPlace,
  convertImageLayerToTilemap,
  createTileset,
  deleteTileInPlace,
  drawTilemapPixelInPlace,
  renderTilemapCelIntoCache,
  setTileCellInPlace,
  sourcePixelForTileValue,
  tileFlipDiagonal,
  tileFlipX,
  tileFlipY,
  tileValueFlags,
  tileValueIndex,
  tileCellsPixelBounds,
  tileCellImageOrigin,
  tilemapCellAtPixel,
  tilemapPixelSize,
  tilesetGridLayout,
  type TilePixelSyncMode,
} from "./editor/tilemap";
import {cellPolygon, compareCellsForRendering, expandCellRegion, gridLineSegments, type TileCell, type TileGridLayout} from "./editor/tileGrid";
import {
  applyTileStamp,
  copyTilemapSelection,
  createTileStamp,
  createTilemapSelection,
  cutTilemapSelection,
  flipTileStamp,
  flipTilemapSelection,
  floodFillTilemap,
  moveTilemapSelection,
  pasteTilemapClipboard,
  pickTileCell,
  rotateTileStamp,
  rotateTilemapSelection,
  tileLineCells,
  tileRectangleCells,
  type TilemapClipboard,
  type TilemapEditResult,
  type TilemapSelection,
  type TileStamp,
} from "./editor/tilemapTools";
import {transformTilemapGrid} from "./editor/tilemapTransforms";
import {replaceCelTerrainAuthority} from "./editor/tilemapAuthority";
import {createTilemapSelectionPredicate} from "./editor/tilemapSelectionClip";
import {crossesTiledBoundary, wrappedLinePoints, wrapTiledPoint} from "./editor/tiledPointer";
import {normalizeImportedTilePixels} from "./editor/tilemapImportColors";
import {
  exportTilemapCsv,
  exportTilemapJson,
  importTilemapCsv,
  importTilemapJson,
} from "./editor/tilemapInterchange";
import {importTilesetBundleIntoDocument} from "./editor/tilesetBundle";
import {
  createTerrainMapData,
  createTerrainRuleTemplate,
  normalizeBlobMask,
  recalculateTerrainCells,
  terrainAffectedCells,
  terrainEmpty,
  terrainRuleDiagnostic,
  type TerrainBoundary,
  type TerrainNeighborMode,
} from "./editor/terrain";
import {
  createTerrainStamp,
  flipTerrainStamp,
  rotateTerrainStamp,
  terrainFloodFill,
  terrainLineCells,
  terrainPicker,
  terrainRectangleCells,
  transformTerrainSelection,
  type TerrainStamp,
} from "./editor/terrainTools";
import {mapTiledCellTargets, mapTiledTerrainStampTargets, mapTiledTileStampTargets} from "./editor/tilemapTiledStamp";
import {TerrainPreviewPanel} from "./editor/TerrainPreviewPanel";
import {TilesetReferencesPanel} from "./editor/TilesetReferencesPanel";
import {collectTilesetReferences} from "./editor/tilesetReferences";
import {constrainColorToMode, convertDocumentColorMode, exportPaletteText, extractPalette, indexPixels, parsePaletteText, refreshIndexedDocument, refreshTilemapCaches, sortPalette, syncIndexedCel, type DitherMode, type PaletteFileFormat} from "./editor/colorModes";
import {
  alphaDisplayMaximum,
  alphaFromDisplay,
  alphaToDisplay,
  clampByte,
  clampPercent,
  hslaToRgba,
  parseHexColor as parseEditorHexColor,
  rgbToHsla,
  rgbaToHex as editorColorToHex,
  type HSLAColor,
  type RGBAColor,
} from "./editor/colorEditor";
import {findTopmostMovableCelAt, moveCels, rasterizeCelsToCanvas, transformCels, type CelTransformAddress} from "./editor/celTransform";
import {flipDocument, resizeSpriteContent, rotateDocument, trimDocument} from "./editor/documentTransforms";
import {assignDocumentColorProfile, convertDocumentColorProfile, type ConvertibleColorProfile} from "./editor/colorProfiles";
import {rasterizeText, stampRasterizedText, type TextAlign, type TextHinting} from "./editor/textTool";
import {shadePixelsInPlace, type OutlineDirection, type OutlineShape} from "./editor/effects";
import {applyRenderedOutline, rasterizeOutlineCel, renderDocumentOutline} from "./editor/outlineDocument";
import {
  adjustBrightnessContrastInPlace,
  adjustHslInPlace,
  adjustHsvHslInPlace,
  applyColorCurvesInPlace,
  applyConvolutionInPlace,
  applyMedianInPlace,
  createCurveLut,
  invertPixelsInPlace,
  maskChannelsInPlace,
  type ChannelMask,
} from "./editor/adjustments";
import {buildSpriteSheet, exportAtlasMetadata, exportSpriteSheetMetadata, packAtlas, sliceSpriteSheet, validPNGImportDimensions, type SpriteSheetImportLayout} from "./editor/gameAssets";
import {deleteSlices, moveSlices, resizeSliceKeys, reuseSliceColor, scaleSlices} from "./editor/sliceOperations";
import {touchedSliceIds} from "./editor/sliceHitTesting";
import {DocumentStateCommand, CommandHistory, defaultHistoryLimitBytes, PixelEditCommand, TerrainCellsCommand, TilemapCellsCommand} from "./editor/history";
import {assignCommandShortcut, commandForShortcutEvent, defaultCommandShortcuts, documentOptionalCommandIDs, formatShortcutForPlatform, isUnmodifiedDeletionKey, normalizeShortcut, shortcutFromEvent, type CommandShortcutID} from "./editor/shortcuts";
import {adjacentFocusedFrameId, focusTagIdForFrame, focusedFrameIdAtEntry, focusedFrameRange, tagContainsFrame} from "./editor/timelineFocus";
import {deserializePixelClipboard, enqueueSerialTask, orderFrameIDs, serializePixelClipboard} from "./editor/appHelpers";
import {clearCelSelection, copyCelSelection, pasteCelSelection, type CelAddress, type CelClipboard} from "./editor/celClipboard";
import {canCopyFramesToDocument, canCopyLayersToDocument, copyFramesToDocument, copyLayersToDocument} from "./editor/crossDocumentCopy";
import {pasteClipboardAsNewLayer, selectionToNewLayer as applySelectionToNewLayer} from "./editor/editOperations";
import {applyLayerProperties, existingCelsForLayers, linkedCelsForSelection, type LayerPropertyUpdate} from "./editor/layerProperties";
import {LayerThumbnail} from "./editor/LayerThumbnail";
import {TerrainMaskEditor} from "./editor/TerrainMaskEditor";
import {FrameCompositeCache} from "./editor/compositingCache";
import {PixelCanvas, type CanvasContextTarget, type SelectionMode} from "./editor/PixelCanvas";
import {createPatch, hexToRGBA, rgbaToHex} from "./editor/pixels";
import {
  clearSelection,
  cloneSelection,
  combineSelections,
  clippedSelection,
  copySelection,
  flipClipboard,
  flipSelection,
  borderSelection,
  fillSelection,
  growSelection,
  invertSelection,
  moveSelection,
  maskForSelection,
  selectByColor,
  shrinkSelection,
  selectionCoverageAt,
  shiftPixelsWrapped,
  strokeSelection,
  featherSelection,
  pasteClipboard,
  resizeClipboard,
  resizeSelection,
  rotateClipboard,
  rotateSelection,
  type PixelClipboard,
  type Selection,
  type SelectionOperation,
  type TransformAxis,
  type RotationDirection,
} from "./editor/selection";
import {bytesToBase64, decodeProject, encodeProject} from "./editor/serialization";
import {celSelectionKey, normalizeCelSelection, selectTimelineCel, selectedCelAddresses} from "./editor/timelineSelection";
import {duplicateLinkedTimelineCels, duplicateTimelineCels, transferTimelineCels} from "./editor/timelineCelOperations";
import {MAX_BRUSH_SIZE, MIN_BRUSH_SIZE, createBitmapBrush, toolShortcuts, type BitmapBrush, type BrushDynamicsOptions, type BrushShape, type GradientDither, type GradientType, type ShapeFillMode, type InkMode, type RGBA, type ToolID} from "./editor/tools";
import {rotateClipboardWithPivot, type TransformMode} from "./editor/transform";
import {layerOpaqueContentSelection} from "./editor/contentSelection";

const zoomLevels = [1, 2, 4, 6, 8, 12, 16, 24, 32];
const tools: Array<{id: ToolID; icon: LucideIcon}> = [
  {id: "pencil", icon: Pencil},
  {id: "eraser", icon: Eraser},
  {id: "eyedropper", icon: Pipette},
  {id: "zoom", icon: ZoomIn},
  {id: "hand", icon: Hand},
  {id: "move", icon: Move},
  {id: "line", icon: Slash},
  {id: "rectangle", icon: Square},
  {id: "ellipse", icon: Circle},
  {id: "curve", icon: Spline},
  {id: "polyline", icon: Waypoints},
  {id: "polygon", icon: Pentagon},
  {id: "fill", icon: PaintBucket},
  {id: "gradient", icon: Blend},
  {id: "spray", icon: SprayCan},
  {id: "blur", icon: Droplets},
  {id: "jumble", icon: Shuffle},
  {id: "contour", icon: SquaresUnite},
  {id: "replace-color", icon: Replace},
  {id: "selection", icon: BoxSelect},
  {id: "transform", icon: Scaling},
  {id: "crop", icon: Crop},
  {id: "slice", icon: SliceIcon},
  {id: "text", icon: Type},
];
const toolDefinitionByID = new Map(tools.map((tool) => [tool.id, tool]));

type EditorContextTarget =
  | {kind: "document"; tabId: string}
  | {kind: "layer"; layerId: string}
  | {kind: "frame"; frameId: string}
  | {kind: "cel"; layerId: string; frameId: string}
  | {kind: "slice"; sliceId: string}
  | {kind: "tile"; tileId: number}
  | {kind: "guide"; guideId: string}
  | {kind: "tag"; tagId: string}
  | {kind: "panel"; panel: "inspector" | "timeline"};

interface EditorContextMenuState {
  target: EditorContextTarget;
  left: number;
  top: number;
}

const brushSizeTools = new Set<ToolID>([
  "pencil", "eraser", "line", "rectangle", "ellipse", "curve", "polyline", "polygon", "spray", "blur", "jumble", "contour",
]);
const brushShapeTools = new Set<ToolID>([
  "pencil", "eraser", "line", "rectangle", "ellipse", "curve", "polyline", "polygon", "blur", "jumble", "contour",
]);
const freehandBrushTools = new Set<ToolID>(["pencil", "eraser"]);
const defaultBrushDynamics = (size = 1): BrushDynamicsOptions => ({
  size: {enabled: true, source: "pressure", min: 1, max: size, threshold: 0, invert: false, curve: "linear"},
  opacity: {enabled: true, source: "pressure", min: 0.08, max: 1, threshold: 0, invert: false, curve: "linear"},
  angle: {enabled: false, source: "pressure", min: 0, max: 360, threshold: 0, invert: false, curve: "linear"},
  gradient: {enabled: false, source: "pressure", min: 0, max: 1, threshold: 0, invert: false, curve: "linear"},
});
const builtInTextFontFamilies = ["Arial", "Segoe UI", "Tahoma", "Verdana", "Times New Roman", "Georgia", "Courier New", "Consolas"];
const allBlendModes: BlendMode[] = ["normal", "darken", "multiply", "color-burn", "lighten", "screen", "color-dodge", "overlay", "soft-light", "hard-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "addition", "subtract", "divide"];
const blendModeText: Record<Language, Record<BlendMode, string>> = {
  en: {normal: "Normal", darken: "Darken", multiply: "Multiply", "color-burn": "Color burn", lighten: "Lighten", screen: "Screen", "color-dodge": "Color dodge", overlay: "Overlay", "soft-light": "Soft light", "hard-light": "Hard light", difference: "Difference", exclusion: "Exclusion", hue: "Hue", saturation: "Saturation", color: "Color", luminosity: "Luminosity", addition: "Addition", subtract: "Subtract", divide: "Divide"},
  zh: {normal: "正常", darken: "变暗", multiply: "正片叠底", "color-burn": "颜色加深", lighten: "变亮", screen: "滤色", "color-dodge": "颜色减淡", overlay: "叠加", "soft-light": "柔光", "hard-light": "强光", difference: "差值", exclusion: "排除", hue: "色相", saturation: "饱和度", color: "颜色", luminosity: "明度", addition: "相加", subtract: "减去", divide: "划分"},
};
const layerRoleText: Record<Language, Record<LayerRole, string>> = {
  en: {standard: "Standard", background: "Background", reference: "Reference"},
  zh: {standard: "普通", background: "背景", reference: "参考"},
};

type Language = "en" | "zh";
type ColorEditorMode = "rgba" | "hsla";
type ColorTarget = "foreground" | "background";
type CommandScope = "canvas" | "layer" | "frame" | "cels";
type ToolShortcutAssignments = Record<ToolID, string>;

const commandShortcutLabels: Record<Language, Record<CommandShortcutID, string>> = {
  en: {
    new: "New", newFromSelection: "New from selection", open: "Open", importPNG: "Import PNG", importSpriteSheet: "Import sprite sheet", importPNGSequence: "Import PNG sequence", save: "Save", saveAs: "Save as", exportPNG: "Export PNG", exportGIF: "Export animated GIF", exportSpriteSheet: "Export sprite sheet", exportPNGSequence: "Export PNG sequence", closeDocument: "Close document",
    undo: "Undo", redo: "Redo", selectAll: "Select all", deselect: "Deselect", reselect: "Reselect", copy: "Copy", copyMerged: "Copy merged", cut: "Cut", paste: "Paste", pasteSpecialNewSprite: "Paste as new sprite", pasteSpecialNewLayer: "Paste as new layer", pasteSpecialReferenceLayer: "Paste as reference layer", fillSelection: "Fill selection", strokeSelection: "Stroke selection", copySelectionToLayer: "Copy selection to new layer", cutSelectionToLayer: "Cut selection to new layer", copySelectedFramesToDocument: "Copy selected frames to another document", copySelectedLayersToDocument: "Copy selected layers to another document", shiftPixelsLeft: "Shift pixels left", shiftPixelsRight: "Shift pixels right", shiftPixelsUp: "Shift pixels up", shiftPixelsDown: "Shift pixels down",
    selectOpaque: "Select opaque pixels", selectColor: "Select foreground color", selectAllLayerCels: "Select all cels in layer", selectLinkedCels: "Select linked cels", invertSelection: "Invert selection", growSelection: "Grow selection", shrinkSelection: "Shrink selection", borderSelection: "Selection border", featherSelection: "Feather selection", scaleSelection: "Scale selection", rotateSelectionCCW: "Rotate selection counterclockwise", rotateSelectionCW: "Rotate selection clockwise", flipSelectionHorizontal: "Flip selection horizontally", flipSelectionVertical: "Flip selection vertically", applySelectionPosition: "Apply selection position", applySelectionRotation: "Rotate selection", createBrushFromSelection: "Create brush from selection", createPatternFromSelection: "Create pattern from selection", createSliceFromSelection: "Create slice from selection",
    duplicateSprite: "Duplicate sprite", spriteSize: "Sprite size", canvasSize: "Canvas size", trimCanvas: "Trim transparent borders", rotateSpriteCW: "Rotate sprite clockwise", rotateSpriteCCW: "Rotate sprite counterclockwise", rotateSprite180: "Rotate sprite 180 degrees", flipSpriteHorizontal: "Flip sprite horizontally", flipSpriteVertical: "Flip sprite vertically", colorConfiguration: "Color configuration", adjustmentBrightnessContrast: "Brightness / contrast", adjustmentHSL: "Hue / saturation", adjustmentInvert: "Invert", adjustmentConvolution: "Convolution", adjustmentMedian: "Median", adjustmentDespeckle: "Despeckle", adjustmentCurves: "Curves", adjustmentHSVHSL: "HSV / HSL", adjustmentChannels: "Channels", effectOutline: "Outline", effectShading: "Shading",
    addPaletteColor: "Add palette color", updatePaletteColor: "Edit palette color", removePaletteColor: "Remove palette color", extractPalette: "Extract palette", sortPalette: "Sort palette", saveDefaultPalette: "Save default palette", applyDefaultPalette: "Apply default palette", resetDefaultPalette: "Restore built-in palette", importPalette: "Import palette", exportGPL: "Export GPL palette", exportJASCPAL: "Export JASC-PAL palette",
    addLayer: "Add layer", addGroup: "Add layer group", addTilemapLayer: "Add tilemap layer", convertLayerToTilemap: "Convert layer to tilemap", duplicateLayer: "Duplicate layer", layerProperties: "Layer properties", moveLayerUp: "Move layer up", moveLayerDown: "Move layer down", mergeLayerDown: "Merge layer down", mergeSelectedLayers: "Merge selected layers", flattenVisibleLayers: "Flatten visible layers", toggleLayerVisibility: "Toggle layer visibility", toggleLayerLock: "Toggle layer lock", toggleAlphaLock: "Toggle alpha lock", toggleContinuous: "Toggle continuous cel",
    addFrame: "Add frame", newEmptyFrame: "New empty frame", duplicateFrame: "Duplicate frame", deleteFrame: "Delete frame", moveFrameBackward: "Move frame earlier", moveFrameForward: "Move frame later", previousFrame: "Previous frame", nextFrame: "Next frame", reverseFrames: "Reverse selected frames", createCels: "Create cels", duplicateCels: "Duplicate cels", duplicateLinkedCels: "Duplicate linked cels", deleteCels: "Delete cels", linkCels: "Link cels", unlinkCels: "Unlink cels", celProperties: "Cel properties", applyCelTransform: "Apply cel transform", rasterizeCels: "Rasterize cels", togglePlayback: "Play / pause animation", addTag: "Add frame tag", editTag: "Edit frame tag", deleteTag: "Delete frame tag", focusTag: "Focus active tag",
    toggleInspector: "Toggle inspector", toggleTimeline: "Toggle timeline", togglePixelGrid: "Toggle pixel grid", toggleOnionSkin: "Toggle onion skin", toggleCanvasOnly: "Canvas-only mode", showAllPanels: "Show all panels", toggleFullscreen: "Toggle full screen", detachedPreview: "Detached animation preview", resetWorkspace: "Reset workspace layout", showHistory: "Show history", openPreferences: "Open preferences", toggleTheme: "Toggle theme", switchLanguage: "Switch language",
    toggleGridSnap: "Toggle grid snapping", toggleMirrorX: "Toggle horizontal mirror", toggleMirrorY: "Toggle vertical mirror", toggleTileX: "Toggle horizontal tiling", toggleTileY: "Toggle vertical tiling", addVerticalGuide: "Add vertical guide", addHorizontalGuide: "Add horizontal guide", setRGBA: "Use RGBA mode", setGrayscale: "Use grayscale mode", setIndexed: "Use indexed mode", setBitmap: "Use bitmap mode", zoomIn: "Zoom in", zoomOut: "Zoom out", delete: "Delete",
  },
  zh: {
    new: "新建", newFromSelection: "从选区新建", open: "打开", importPNG: "导入 PNG", importSpriteSheet: "导入精灵图", importPNGSequence: "导入 PNG 序列", save: "保存", saveAs: "另存为", exportPNG: "导出 PNG", exportGIF: "导出 GIF 动画", exportSpriteSheet: "导出精灵图", exportPNGSequence: "导出 PNG 序列", closeDocument: "关闭文件",
    undo: "撤销", redo: "重做", selectAll: "全选", deselect: "取消选择", reselect: "重新选择", copy: "复制", copyMerged: "复制合并结果", cut: "剪切", paste: "粘贴", pasteSpecialNewSprite: "粘贴为新项目", pasteSpecialNewLayer: "粘贴为新图层", pasteSpecialReferenceLayer: "粘贴为参考图层", fillSelection: "填充选区", strokeSelection: "描边选区", copySelectionToLayer: "复制选区到新图层", cutSelectionToLayer: "剪切选区到新图层", copySelectedFramesToDocument: "复制所选帧到其他文件", copySelectedLayersToDocument: "复制所选图层到其他文件", shiftPixelsLeft: "向左环绕平移像素", shiftPixelsRight: "向右环绕平移像素", shiftPixelsUp: "向上环绕平移像素", shiftPixelsDown: "向下环绕平移像素",
    selectOpaque: "选择不透明像素", selectColor: "选择前景色", selectAllLayerCels: "选择当前图层全部动画格", selectLinkedCels: "选择链接动画格", invertSelection: "反选", growSelection: "扩展选区", shrinkSelection: "收缩选区", borderSelection: "选区边框", featherSelection: "羽化选区", scaleSelection: "缩放选区", rotateSelectionCCW: "逆时针旋转选区", rotateSelectionCW: "顺时针旋转选区", flipSelectionHorizontal: "水平翻转选区", flipSelectionVertical: "垂直翻转选区", applySelectionPosition: "应用选区位置", applySelectionRotation: "旋转选区", createBrushFromSelection: "从选区创建笔刷", createPatternFromSelection: "从选区创建图案", createSliceFromSelection: "从选区创建切片",
    duplicateSprite: "复制精灵", spriteSize: "缩放图像内容", canvasSize: "画布尺寸", trimCanvas: "裁去透明边缘", rotateSpriteCW: "顺时针旋转图像", rotateSpriteCCW: "逆时针旋转图像", rotateSprite180: "旋转图像 180 度", flipSpriteHorizontal: "水平翻转图像", flipSpriteVertical: "垂直翻转图像", colorConfiguration: "颜色配置", adjustmentBrightnessContrast: "亮度 / 对比度", adjustmentHSL: "色相 / 饱和度", adjustmentInvert: "反相", adjustmentConvolution: "卷积", adjustmentMedian: "中值滤波", adjustmentDespeckle: "去斑", adjustmentCurves: "曲线", adjustmentHSVHSL: "HSV / HSL", adjustmentChannels: "通道", effectOutline: "轮廓", effectShading: "着色",
    addPaletteColor: "添加调色板颜色", updatePaletteColor: "编辑调色板颜色", removePaletteColor: "移除调色板颜色", extractPalette: "提取调色板", sortPalette: "整理调色板", saveDefaultPalette: "保存默认调色板", applyDefaultPalette: "应用默认调色板", resetDefaultPalette: "恢复内置调色板", importPalette: "导入调色板", exportGPL: "导出 GPL 调色板", exportJASCPAL: "导出 JASC-PAL 调色板",
    addLayer: "新建图层", addGroup: "新建图层组", addTilemapLayer: "新建图块地图图层", convertLayerToTilemap: "将图层转换为图块地图", duplicateLayer: "复制图层", layerProperties: "图层属性", moveLayerUp: "上移图层", moveLayerDown: "下移图层", mergeLayerDown: "向下合并图层", mergeSelectedLayers: "合并所选图层", flattenVisibleLayers: "拼合可见图层", toggleLayerVisibility: "切换图层可见性", toggleLayerLock: "切换图层锁定", toggleAlphaLock: "切换锁定透明度", toggleContinuous: "切换连续动画格",
    addFrame: "新建帧", newEmptyFrame: "新建空帧", duplicateFrame: "复制帧", deleteFrame: "删除帧", moveFrameBackward: "前移帧", moveFrameForward: "后移帧", previousFrame: "上一帧", nextFrame: "下一帧", reverseFrames: "反转所选帧", createCels: "创建动画格", duplicateCels: "复制动画格", duplicateLinkedCels: "复制并链接动画格", deleteCels: "删除动画格", linkCels: "链接动画格", unlinkCels: "取消链接动画格", celProperties: "动画格属性", applyCelTransform: "应用动画格变换", rasterizeCels: "栅格化动画格", togglePlayback: "播放 / 暂停动画", addTag: "添加帧标签", editTag: "编辑帧标签", deleteTag: "删除帧标签", focusTag: "聚焦当前帧标签",
    toggleInspector: "显示 / 隐藏侧栏", toggleTimeline: "显示 / 隐藏时间轴", togglePixelGrid: "切换像素网格", toggleOnionSkin: "切换洋葱皮", toggleCanvasOnly: "画布独占模式", showAllPanels: "显示所有面板", toggleFullscreen: "切换全屏", detachedPreview: "独立动画预览", resetWorkspace: "重置工作区布局", showHistory: "显示历史记录", openPreferences: "打开偏好设置", toggleTheme: "切换主题", switchLanguage: "切换语言",
    toggleGridSnap: "切换网格吸附", toggleMirrorX: "切换水平对称", toggleMirrorY: "切换垂直对称", toggleTileX: "切换水平平铺", toggleTileY: "切换垂直平铺", addVerticalGuide: "添加垂直辅助线", addHorizontalGuide: "添加水平辅助线", setRGBA: "使用 RGBA 模式", setGrayscale: "使用灰度模式", setIndexed: "使用索引色模式", setBitmap: "使用位图模式", zoomIn: "放大", zoomOut: "缩小", delete: "删除",
  },
};

interface EditorTab {
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

interface CelMoveSession {
  before: PixelDocument;
  beforeTimeline: TabTimelineHistoryState;
  addresses: CelTransformAddress[];
  origins: Map<string, {x: number; y: number}>;
  deltaX: number;
  deltaY: number;
}

interface TimelineCelDragSession {
  sourceAddresses: CelAddress[];
  sourceAnchor: CelAddress;
  copy: boolean;
}

type ExportKind = "png" | "gif" | "sheet";
type SpriteSheetLayout = "horizontal" | "vertical" | "grid";

interface TagDialogState {
  tagId?: string;
  name: string;
  fromFrameId: string;
  toFrameId: string;
  direction: TagDirection;
  color: string;
  repeat: number;
}

interface CrossDocumentCopyDialogState {
  mode: "frames" | "layers";
  sourceTabId: string;
  frameIds: string[];
  layerIds: string[];
  targetTabId: string;
}

type TriStateProperty = "keep" | "on" | "off";
type LayerRoleProperty = "keep" | LayerRole;

interface LayerPropertiesDialogState {
  layerIds: string[];
  name: string;
  opacity: string;
  blendMode: "keep" | BlendMode;
  role: LayerRoleProperty;
  visible: TriStateProperty;
  locked: TriStateProperty;
  alphaLock: TriStateProperty;
  continuous: TriStateProperty;
}

interface SlicePropertiesDialogState {
  sliceId: string;
  frameId: string;
  name: string;
  color: string;
  x: string;
  y: string;
  width: string;
  height: string;
  centerX: string;
  centerY: string;
  centerWidth: string;
  centerHeight: string;
  pivotX: string;
  pivotY: string;
}

type AdjustmentKind = "brightness-contrast" | "hsl" | "invert" | "convolution" | "median" | "despeckle" | "curves" | "hsv-hsl" | "channel-mask" | "outline";
type AdjustmentTargetScope = "active" | "selected" | "all";
type AdjustmentCurveChannel = "red" | "green" | "blue" | "alpha";
type AdjustmentConvolutionPreset = "blur" | "sharpen" | "edge" | "emboss" | "custom";

const adjustmentConvolutionPresets: Record<AdjustmentConvolutionPreset, {kernel: number[]; divisor: number; bias: number}> = {
  blur: {kernel: [1, 1, 1, 1, 1, 1, 1, 1, 1], divisor: 9, bias: 0},
  sharpen: {kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0], divisor: 1, bias: 0},
  edge: {kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], divisor: 1, bias: 128},
  emboss: {kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2], divisor: 1, bias: 128},
  custom: {kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0], divisor: 1, bias: 0},
};

type AdjustmentChannelValues = Record<"red" | "green" | "blue" | "alpha", boolean>;

function defaultAdjustmentChannelValues(): AdjustmentChannelValues {
  return {red: true, green: true, blue: true, alpha: false};
}

export function createAdjustmentDialogState(kind: AdjustmentKind): AdjustmentDialogState {
  const channelValues = defaultAdjustmentChannelValues();
  if (kind === "channel-mask" || kind === "outline") channelValues.alpha = true;
  return {
    kind,
    scope: "active",
    brightness: 0,
    contrast: 0,
    hue: 0,
    saturation: 0,
    lightness: 0,
    value: 0,
    hsvSpace: "hsl",
    hsvMode: "relative",
    convolutionPreset: "sharpen",
    medianSize: kind === "despeckle" ? 5 : 3,
    medianThreshold: 0,
    curveChannel: "red",
    curvePoints: {red: identityCurvePoints(), green: identityCurvePoints(), blue: identityCurvePoints(), alpha: identityCurvePoints()},
    outlineThickness: 1,
    outlinePosition: "outside",
    outlineShape: "square",
    outlineDirections: ["n", "ne", "e", "se", "s", "sw", "w", "nw"],
    outlineTileX: false,
    outlineTileY: false,
    channelValues,
  };
}

interface AdjustmentDialogState {
  kind: AdjustmentKind;
  scope: AdjustmentTargetScope;
  brightness: number;
  contrast: number;
  hue: number;
  saturation: number;
  lightness: number;
  value: number;
  hsvSpace: "hsv" | "hsl";
  hsvMode: "relative" | "absolute";
  convolutionPreset: AdjustmentConvolutionPreset;
  medianSize: 3 | 5;
  medianThreshold: number;
  curveChannel: AdjustmentCurveChannel;
  curvePoints: Record<AdjustmentCurveChannel, CurvePoint[]>;
  outlineThickness: number;
  outlinePosition: "inside" | "outside";
  outlineShape: OutlineShape;
  outlineDirections: OutlineDirection[];
  outlineTileX: boolean;
  outlineTileY: boolean;
  channelValues: AdjustmentChannelValues;
}

interface SpriteImportDialogState {
  image: PNGResponse;
  frameWidth: number;
  frameHeight: number;
  layout: SpriteSheetImportLayout;
  offsetX: number;
  offsetY: number;
  paddingX: number;
  paddingY: number;
}

function createTabID() {
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

function syncTabToActiveTag(tab: EditorTab) {
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

function setTabCommandScope(tab: EditorTab, scope: CommandScope) {
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

function displayProjectName(name: string) {
  return name.replace(/\.pixio$/i, "");
}

function rgbaWithAlpha(color: string, alphaPercent: number): RGBA {
  const [red, green, blue] = hexToRGBA(color);
  return [red, green, blue, Math.round(Math.max(0, Math.min(100, alphaPercent)) * 2.55)];
}

function terrainBrushCells(
  grid: TileGridLayout,
  center: {column: number; row: number},
  radius: number,
  shape: "native" | "square",
) {
  const rings = Math.max(0, Math.round(radius));
  if (rings === 0) return [center];
  if (grid.kind === "hexagonal" || shape === "native") return expandCellRegion(grid, [center], rings);
  const cells: Array<{column: number; row: number}> = [];
  for (let row = center.row - rings; row <= center.row + rings; row += 1) {
    for (let column = center.column - rings; column <= center.column + rings; column += 1) {
      cells.push({column, row});
    }
  }
  return cells;
}

function terrainScatterAllows(seed: number, column: number, row: number, percent: number) {
  if (percent >= 100) return true;
  let hash = (2166136261 ^ (seed >>> 0)) >>> 0;
  hash = Math.imul(hash ^ (column >>> 0), 0x01000193) >>> 0;
  hash = Math.imul(hash ^ (row >>> 0), 0x01000193) >>> 0;
  hash ^= hash >>> 16;
  return hash % 100 < Math.max(0, Math.round(percent));
}

function paletteColorFromEditor(color: string, alphaPercent: number) {
  const [r, g, b] = hexToRGBA(color);
  return editorColorToHex({r, g, b, a: alphaPercent}, true);
}

const recoveryFormat = "pixtorio-recovery-v2" as const;

export interface RecoveryTabInput {
  id: string;
  filePath?: string;
  document: PixelDocument;
  isDirty: boolean;
}

export interface RecoveryDocument {
  tabId: string;
  filePath?: string;
  document: PixelDocument;
}

export interface RecoverySnapshot {
  activeTabId?: string;
  documents: RecoveryDocument[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface ProjectResponse {
  path: string;
  document: string;
}

export interface PNGResponse {
  name: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

function parseBridgeJSON(payload: string, errorMessage: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    throw new Error(errorMessage);
  }
}

export function parseProjectResponse(payload: string): ProjectResponse {
  const parsed = parseBridgeJSON(payload, "Invalid project response");
  if (!isRecord(parsed) || typeof parsed.path !== "string" || typeof parsed.document !== "string") {
    throw new Error("Invalid project response");
  }
  return {path: parsed.path, document: parsed.document};
}

export function parsePNGResponse(payload: string): PNGResponse {
  const parsed = parseBridgeJSON(payload, "Invalid PNG response");
  if (!isRecord(parsed) || typeof parsed.name !== "string" || typeof parsed.width !== "number" || typeof parsed.height !== "number" || typeof parsed.pixels !== "string") {
    throw new Error("Invalid PNG response");
  }
  const {name, width, height, pixels: encodedPixels} = parsed;
  if (!validPNGImportDimensions(width, height)) {
    throw new Error("Invalid PNG response");
  }
  let binary: string;
  try {
    binary = atob(encodedPixels);
  } catch {
    throw new Error("Invalid PNG response");
  }
  if (binary.length !== parsed.width * parsed.height * 4) throw new Error("Invalid PNG response");
  const pixels = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index += 1) pixels[index] = binary.charCodeAt(index);
  return {name, width, height, pixels};
}

export function parsePNGSequenceResponse(payload: string): PNGResponse[] {
  const parsed = parseBridgeJSON(payload, "Invalid PNG sequence response");
  if (!isRecord(parsed) || !Array.isArray(parsed.frames) || parsed.frames.length === 0 || parsed.frames.length > 4096) {
    throw new Error("Invalid PNG sequence response");
  }
  return parsed.frames.map((frame) => parsePNGResponse(JSON.stringify(frame)));
}

export function isActivationKey(key: string) {
  return key === "Enter" || key === " ";
}

export function encodeRecoveryPayload(tabs: readonly RecoveryTabInput[], activeTabId: string): string | null {
  const dirtyTabs = tabs.filter((tab) => tab.isDirty);
  if (dirtyTabs.length === 0) return null;
  const active = dirtyTabs.find((tab) => tab.id === activeTabId) ?? dirtyTabs[0];
  return JSON.stringify({
    format: recoveryFormat,
    activeTabId: active.id,
    documents: dirtyTabs.map((tab) => ({
      tabId: tab.id,
      ...(tab.filePath !== undefined ? {filePath: tab.filePath} : {}),
      document: encodeProject(tab.document),
    })),
  });
}

export function decodeRecoveryPayload(payload: string): RecoverySnapshot {
  const parsed = parseBridgeJSON(payload, "Recovery JSON is invalid");
  if (!isRecord(parsed) || parsed.format !== recoveryFormat) {
    throw new Error("Recovery JSON is invalid");
  }
  if (!Array.isArray(parsed.documents) || parsed.documents.length === 0) {
    throw new Error("Recovery documents are missing");
  }
  const documents = parsed.documents.map((entry) => {
    if (!isRecord(entry) || typeof entry.tabId !== "string" || typeof entry.document !== "string") {
      throw new Error("Recovery document entry is invalid");
    }
    if (entry.filePath !== undefined
      && (typeof entry.filePath !== "string"
        || !entry.filePath.trim()
        || entry.filePath.trim() !== entry.filePath
        || !entry.filePath.toLowerCase().endsWith(".pixio"))) {
      throw new Error("Recovery document entry is invalid");
    }
    return {
      tabId: entry.tabId,
      ...(entry.filePath !== undefined ? {filePath: entry.filePath} : {}),
      document: decodeProject(entry.document),
    };
  });
  return {
    activeTabId: typeof parsed.activeTabId === "string" ? parsed.activeTabId : undefined,
    documents,
  };
}

export function isEditableTarget(target: EventTarget | null) {
  if (!target) return false;
  if (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement) return true;
  if (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement) return true;
  if (typeof HTMLSelectElement !== "undefined" && target instanceof HTMLSelectElement) return true;
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement && target.isContentEditable) return true;

  // Keep this check safe for unit tests running without a DOM implementation.
  const element = target as EventTarget & {nodeName?: unknown; isContentEditable?: unknown};
  if (element.isContentEditable === true) return true;
  return typeof element.nodeName === "string" && /^(INPUT|TEXTAREA|SELECT)$/i.test(element.nodeName);
}

const labels: Record<Language, {
  file: string; newProject: string; openProject: string; importPNG: string; saveProject: string; saveAs: string;
  exportPNG: string; exportGIF: string; exportSpriteSheet: string; recentProjects: string;
  openDocuments: string; closeDocument: string; previousDocuments: string; nextDocuments: string;
  undo: string; redo: string; toggleTheme: string; switchLanguage: string; tools: string;
  color: string; currentColor: string; palette: string; useColor: string; selection: string; mode: string;
  foreground: string; background: string; swapColors: string; alpha: string; brush: string; brushSize: string;
  brushShape: string; squareBrush: string; circleBrush: string; addColor: string; removeColor: string; editColor: string;
  brushPreset: string; crossBrush: string; diamondBrush: string; customBrush: string; brushFromSelection: string; brushSpacing: string; pixelPerfect: string; pressure: string; polygonSides: string;
  colorMode: string; rgbaMode: string; grayscaleMode: string; indexedMode: string; bitmapMode: string; extractPalette: string; sortPalette: string;
  selectionReplace: string; selectionAdd: string; selectionSubtract: string; selectionIntersect: string;
  selectionShape: string; rectangularSelection: string; ellipticalSelection: string; lassoSelection: string; polygonSelection: string; magicWand: string; tolerance: string; selectOpaque: string; selectColor: string; invertSelection: string; reselect: string; growSelection: string; shrinkSelection: string; borderSelection: string; amount: string;
  transform: string; transformModeLabel: string; transformScale: string; transformPerspective: string; transformDistort: string; scaleSelection: string; rotateClockwise: string; rotateCounterclockwise: string; flipHorizontal: string; flipVertical: string;
  arbitraryRotation: string; applyRotation: string;
  layers: string; addLayer: string; addGroup: string; duplicateLayer: string;
  moveLayerUp: string; moveLayerDown: string; mergeLayerDown: string; hideLayer: string; showLayer: string;
  renameLayer: string; lockLayer: string; unlockLayer: string; collapseGroup: string; expandGroup: string;
  opacity: string; layerOpacity: string; blendMode: string; normal: string; multiply: string; screen: string; overlay: string;
  animation: string; addFrame: string; newEmptyFrame: string; duplicateFrame: string; deleteFrame: string; moveFrameBackward: string;
  moveFrameForward: string; previousFrame: string; nextFrame: string; frames: string; pause: string; play: string; onionSkin: string; loop: string;
  linkCels: string; unlinkCels: string; duplicateCels: string; duplicateLinkedCels: string; tags: string; noTag: string; addTag: string; editTag: string; deleteTag: string; focusTag: string;
  celTransform: string; angle: string; offsetX: string; offsetY: string; applyCelTransform: string; rasterizeCels: string;
  tagName: string; direction: string; forward: string; reverse: string; pingpong: string; loopStart: string; loopEnd: string;
  exportOptions: string; export: string; scale: string; applyPixelRatio: string; playback: string; once: string; forever: string; repeatCount: string;
  frameRange: string; allFrames: string; selectedFrames: string; loopRange: string; layout: string;
  sheetHorizontal: string; sheetVertical: string; sheetGrid: string; columns: string; borderPadding: string; framePadding: string; atlasJSON: string;
  to: string; zoomOut: string; zoomIn: string; newDocument: string; resizeCanvas: string; width: string; height: string;
  horizontal: string; vertical: string; left: string; center: string; right: string; top: string; bottom: string;
  cancel: string; create: string; apply: string; sizeError: string; projectName: string; frame: string;
  visibleLayerThumbnail: string; hiddenLayerThumbnail: string; restoreRecovery: string;
  defaultDocumentName: string; layerBaseName: string; groupBaseName: string; tagBaseName: string; copySuffix: string;
  closeUnsaved: (name: string) => string; toolsByID: Record<ToolID, string>;
}> = {
  en: {
    file: "File", newProject: "New project", openProject: "Open project", importPNG: "Import PNG", saveProject: "Save", saveAs: "Save as",
    exportPNG: "Export PNG", exportGIF: "Export animated GIF", exportSpriteSheet: "Export sprite sheet", recentProjects: "Recent projects", openDocuments: "Open documents", closeDocument: "Close", previousDocuments: "Previous documents", nextDocuments: "Next documents",
    undo: "Undo", redo: "Redo", toggleTheme: "Toggle theme", switchLanguage: "Switch to Chinese", tools: "Tools",
    color: "Color", currentColor: "Current color", palette: "Palette", useColor: "Use color", selection: "Selection", mode: "Mode",
    foreground: "Foreground", background: "Background", swapColors: "Swap foreground and background", alpha: "Alpha", brush: "Brush", brushSize: "Brush size",
    brushShape: "Brush shape", squareBrush: "Square", circleBrush: "Circle", addColor: "Add current color", removeColor: "Remove selected color", editColor: "Replace selected color with current color",
    brushPreset: "Brush preset", crossBrush: "Cross", diamondBrush: "Diamond", customBrush: "Custom", brushFromSelection: "Create brush from selection", brushSpacing: "Spacing", pixelPerfect: "Pixel perfect", pressure: "Pen pressure", polygonSides: "Sides",
    colorMode: "Color mode", rgbaMode: "RGBA", grayscaleMode: "Grayscale", indexedMode: "Indexed", bitmapMode: "Bitmap (1-bit)", extractPalette: "Extract palette from artwork", sortPalette: "Sort palette by hue",
    selectionReplace: "Replace", selectionAdd: "Add", selectionSubtract: "Subtract", selectionIntersect: "Intersect",
    selectionShape: "Shape", rectangularSelection: "Rectangle", ellipticalSelection: "Ellipse", lassoSelection: "Lasso", polygonSelection: "Polygon", magicWand: "Magic wand", tolerance: "Tolerance", selectOpaque: "Select opaque pixels", selectColor: "Select foreground color", invertSelection: "Invert selection", reselect: "Reselect", growSelection: "Grow selection", shrinkSelection: "Shrink selection", borderSelection: "Selection border", amount: "Amount",
    transform: "Transform", transformModeLabel: "Mode", transformScale: "Scale", transformPerspective: "Perspective", transformDistort: "Distort", scaleSelection: "Scale selection", rotateClockwise: "Rotate clockwise", rotateCounterclockwise: "Rotate counterclockwise", flipHorizontal: "Flip horizontally", flipVertical: "Flip vertically",
    arbitraryRotation: "Rotation angle", applyRotation: "Rotate selection",
    layers: "Layers", addLayer: "Add layer", addGroup: "Add layer group", duplicateLayer: "Duplicate layer",
    moveLayerUp: "Move layer up", moveLayerDown: "Move layer down", mergeLayerDown: "Merge layer down", hideLayer: "Hide layer", showLayer: "Show layer",
    renameLayer: "Rename layer", lockLayer: "Lock layer", unlockLayer: "Unlock layer", collapseGroup: "Collapse group", expandGroup: "Expand group",
    opacity: "Opacity", layerOpacity: "Layer opacity", blendMode: "Blend mode", normal: "Normal", multiply: "Multiply", screen: "Screen", overlay: "Overlay",
    animation: "Animation", addFrame: "Add frame", newEmptyFrame: "New empty frame", duplicateFrame: "Duplicate frame", deleteFrame: "Delete frame", moveFrameBackward: "Move frame earlier",
    moveFrameForward: "Move frame later", previousFrame: "Previous frame", nextFrame: "Next frame", frames: "Frames", pause: "Pause", play: "Play", onionSkin: "Onion skin", loop: "Loop",
    linkCels: "Link selected cels", unlinkCels: "Unlink selected cels", duplicateCels: "Duplicate selected cels", duplicateLinkedCels: "Duplicate selected cels as linked", tags: "Frame tags", noTag: "No active tag", addTag: "Add frame tag", editTag: "Edit frame tag", deleteTag: "Delete frame tag", focusTag: "Focus active tag",
    celTransform: "Selected cel transform", angle: "Angle", offsetX: "Offset X", offsetY: "Offset Y", applyCelTransform: "Apply to selected cels", rasterizeCels: "Rasterize to canvas",
    tagName: "Tag name", direction: "Direction", forward: "Forward", reverse: "Reverse", pingpong: "Ping-pong", loopStart: "Loop start", loopEnd: "Loop end",
    exportOptions: "Export options", export: "Export", scale: "Scale", applyPixelRatio: "Apply pixel ratio", playback: "Playback", once: "Once", forever: "Forever", repeatCount: "Repeat count",
    frameRange: "Frame range", allFrames: "All frames", selectedFrames: "Selected frames", loopRange: "Loop range", layout: "Layout",
    sheetHorizontal: "Horizontal", sheetVertical: "Vertical", sheetGrid: "Grid", columns: "Columns", borderPadding: "Border padding", framePadding: "Frame padding", atlasJSON: "Write atlas JSON",
    to: "to", zoomOut: "Zoom out", zoomIn: "Zoom in",
    newDocument: "New document", resizeCanvas: "Resize canvas", width: "Width", height: "Height",
    horizontal: "Horizontal anchor", vertical: "Vertical anchor", left: "Left", center: "Center", right: "Right", top: "Top", bottom: "Bottom",
    cancel: "Cancel", create: "Create", apply: "Apply", sizeError: "Enter whole-number dimensions from 1 to 2048.",
    projectName: "Project name", frame: "Frame", visibleLayerThumbnail: "Visible layer thumbnail", hiddenLayerThumbnail: "Hidden layer thumbnail",
    restoreRecovery: "Restore the local recovery project?", defaultDocumentName: "untitled.pixio", layerBaseName: "Layer", groupBaseName: "Group", tagBaseName: "Tag", copySuffix: "copy",
    closeUnsaved: (name) => `Close ${name} without saving changes?`,
    toolsByID: {pencil: "Pencil", eraser: "Eraser", eyedropper: "Eyedropper", zoom: "Zoom", hand: "Hand", move: "Move", line: "Line", rectangle: "Rectangle", ellipse: "Ellipse", curve: "Curve", polyline: "Polyline", polygon: "Polygon", fill: "Fill", gradient: "Gradient", spray: "Spray", blur: "Blur", jumble: "Jumble", contour: "Contour", "replace-color": "Replace color", selection: "Selection", transform: "Transform", crop: "Crop", slice: "Slice", text: "Text"},
  },
  zh: {
    file: "文件", newProject: "新建项目", openProject: "打开项目", importPNG: "导入 PNG", saveProject: "保存", saveAs: "另存为",
    exportPNG: "导出 PNG", exportGIF: "导出 GIF 动画", exportSpriteSheet: "导出精灵图", recentProjects: "最近项目", openDocuments: "已打开的文件", closeDocument: "关闭", previousDocuments: "向前滚动文件", nextDocuments: "向后滚动文件",
    undo: "撤销", redo: "重做", toggleTheme: "切换主题", switchLanguage: "切换为 English", tools: "工具",
    color: "颜色", currentColor: "当前颜色", palette: "调色板", useColor: "使用颜色", selection: "选区", mode: "组合",
    foreground: "前景色", background: "背景色", swapColors: "交换前景色和背景色", alpha: "透明度", brush: "笔刷", brushSize: "笔刷尺寸",
    brushShape: "笔刷形状", squareBrush: "方形", circleBrush: "圆形", addColor: "添加当前颜色", removeColor: "移除所选颜色", editColor: "用当前颜色替换所选颜色",
    brushPreset: "笔刷预设", crossBrush: "十字", diamondBrush: "菱形", customBrush: "自定义", brushFromSelection: "从选区创建笔刷", brushSpacing: "间距", pixelPerfect: "像素完美", pressure: "压感", polygonSides: "边数",
    colorMode: "颜色模式", rgbaMode: "RGBA", grayscaleMode: "灰度", indexedMode: "索引色", bitmapMode: "位图（1 位）", extractPalette: "从作品提取调色板", sortPalette: "按色相整理调色板",
    selectionReplace: "替换", selectionAdd: "添加", selectionSubtract: "减去", selectionIntersect: "相交",
    selectionShape: "形状", rectangularSelection: "矩形", ellipticalSelection: "椭圆", lassoSelection: "套索", polygonSelection: "多边形", magicWand: "魔棒", tolerance: "容差", selectOpaque: "选择不透明像素", selectColor: "选择前景色", invertSelection: "反选", reselect: "重新选择", growSelection: "扩展选区", shrinkSelection: "收缩选区", borderSelection: "选区边框", amount: "数量",
    transform: "变换", transformModeLabel: "模式", transformScale: "缩放", transformPerspective: "透视", transformDistort: "扭曲", scaleSelection: "缩放选区", rotateClockwise: "顺时针旋转", rotateCounterclockwise: "逆时针旋转", flipHorizontal: "水平翻转", flipVertical: "垂直翻转",
    arbitraryRotation: "旋转角度", applyRotation: "旋转选区",
    layers: "图层", addLayer: "新建图层", addGroup: "新建图层组", duplicateLayer: "复制图层",
    moveLayerUp: "上移图层", moveLayerDown: "下移图层", mergeLayerDown: "向下合并图层", hideLayer: "隐藏图层", showLayer: "显示图层",
    renameLayer: "重命名图层", lockLayer: "锁定图层", unlockLayer: "解锁图层", collapseGroup: "折叠图层组", expandGroup: "展开图层组",
    opacity: "不透明度", layerOpacity: "图层不透明度", blendMode: "混合模式", normal: "正常", multiply: "正片叠底", screen: "滤色", overlay: "叠加",
    animation: "动画", addFrame: "新建帧", newEmptyFrame: "新建空帧", duplicateFrame: "复制帧", deleteFrame: "删除帧", moveFrameBackward: "前移帧",
    moveFrameForward: "后移帧", previousFrame: "上一帧", nextFrame: "下一帧", frames: "帧", pause: "暂停", play: "播放", onionSkin: "洋葱皮", loop: "循环",
    linkCels: "链接所选动画格", unlinkCels: "取消链接所选动画格", duplicateCels: "复制所选动画格", duplicateLinkedCels: "复制并链接所选动画格", tags: "帧标签", noTag: "未选择帧标签", addTag: "添加帧标签", editTag: "编辑帧标签", deleteTag: "删除帧标签", focusTag: "聚焦当前帧标签",
    celTransform: "所选动画格变换", angle: "角度", offsetX: "水平偏移", offsetY: "垂直偏移", applyCelTransform: "应用到所选动画格", rasterizeCels: "栅格化到画布",
    tagName: "标签名称", direction: "方向", forward: "正向", reverse: "反向", pingpong: "往返", loopStart: "循环起点", loopEnd: "循环终点",
    exportOptions: "导出选项", export: "导出", scale: "缩放", applyPixelRatio: "应用像素宽高比", playback: "播放方式", once: "一次", forever: "无限循环", repeatCount: "循环次数",
    frameRange: "帧范围", allFrames: "全部帧", selectedFrames: "所选帧", loopRange: "循环范围", layout: "布局",
    sheetHorizontal: "横向", sheetVertical: "纵向", sheetGrid: "网格", columns: "列数", borderPadding: "外边距", framePadding: "帧间距", atlasJSON: "生成图集 JSON",
    to: "至", zoomOut: "缩小", zoomIn: "放大",
    newDocument: "新建文件", resizeCanvas: "调整画布尺寸", width: "宽度", height: "高度",
    horizontal: "水平锚点", vertical: "垂直锚点", left: "左侧", center: "居中", right: "右侧", top: "顶部", bottom: "底部",
    cancel: "取消", create: "创建", apply: "应用", sizeError: "请输入 1 到 2048 的整数尺寸。",
    projectName: "项目名称", frame: "帧", visibleLayerThumbnail: "可见图层缩略图", hiddenLayerThumbnail: "隐藏图层缩略图",
    restoreRecovery: "是否恢复本地自动保存的项目？", defaultDocumentName: "未命名.pixio", layerBaseName: "图层", groupBaseName: "组", tagBaseName: "标签", copySuffix: "副本",
    closeUnsaved: (name) => `关闭 ${name} 并放弃未保存的更改？`,
    toolsByID: {pencil: "铅笔", eraser: "橡皮擦", eyedropper: "吸管", zoom: "缩放", hand: "抓手", move: "移动", line: "直线", rectangle: "矩形", ellipse: "椭圆", curve: "曲线", polyline: "折线", polygon: "多边形", fill: "填充", gradient: "渐变", spray: "喷枪", blur: "模糊", jumble: "抖动", contour: "轮廓", "replace-color": "颜色替换", selection: "选区", transform: "变换", crop: "裁剪", slice: "切片", text: "文字"},
  },
};

const chineseStatus: Record<string, string> = {
  Ready: "就绪",
  "New project": "新建项目",
  "Saving project...": "正在保存项目...",
  "Save cancelled": "已取消保存",
  "Opening project...": "正在打开项目...",
  "Open cancelled": "已取消打开",
  "Exporting...": "正在导出...",
  "Export cancelled": "已取消导出",
  "Exporting GIF...": "正在导出 GIF...",
  "Exporting sprite sheet...": "正在导出精灵图...",
  "PNG export is available in the desktop app": "PNG 导出仅在桌面应用中可用",
  "Animation export is available in the desktop app": "动画导出仅在桌面应用中可用",
  "Project saving is available in the desktop app": "项目保存仅在桌面应用中可用",
  "Project opening is available in the desktop app": "项目打开仅在桌面应用中可用",
  "PNG import is available in the desktop app": "PNG 导入仅在桌面应用中可用",
  "Recent projects open in the desktop app": "最近项目仅能在桌面应用中打开",
  "Export failed": "导出失败",
  "Save failed": "保存失败",
  "Open failed": "打开失败",
  "Import failed": "导入失败",
  "application is not ready": "应用尚未就绪",
  "invalid PNG dimensions": "PNG 尺寸无效",
  "project path must use .pixio": "项目路径必须使用 .pixio 扩展名",
  "thumbnail is not a PNG image": "缩略图不是有效的 PNG 图片",
  "invalid canvas dimensions": "画布尺寸无效",
  "invalid project document": "项目文档无效",
  "invalid layer": "图层数据无效",
  "invalid frame": "帧数据无效",
  "invalid active layer or frame": "当前图层或帧无效",
  "invalid cel": "动画格数据无效",
  "project must contain one cel per layer and frame": "每个图层和帧都必须包含一个动画格",
  "Project cels are missing": "项目缺少动画格",
  "Project cel pixels are invalid": "动画格像素数据无效",
  "Project cel dimensions are invalid": "动画格尺寸无效",
  "Project contains duplicate cels": "项目包含重复的动画格",
  "Project JSON is invalid": "项目 JSON 无效",
  "Project document is invalid": "项目文档无效",
  "Invalid project response": "项目响应无效",
  "Invalid PNG response": "PNG 响应无效",
  "Recovery documents are missing": "恢复文件缺少文档",
  "Recovery document entry is invalid": "恢复文件中的文档条目无效",
  "Recovery JSON is invalid": "恢复文件 JSON 无效",
  "invalid JSON": "JSON 数据无效",
  "GIF frames and durations must be non-empty and equal": "GIF 帧和帧时长必须存在且数量一致",
  "GIF duration must be positive": "GIF 帧时长必须为正数",
  "sprite sheet needs at least one frame": "精灵图至少需要一帧",
  "sprite sheet is too wide": "精灵图宽度超出限制",
  "image dimensions must be positive": "图片尺寸必须为正数",
  "image dimensions must be positive and within limits": "图片尺寸必须为正数且不能超出限制",
  "Copied Selection": "已复制选区",
  "Copied Merged Selection": "已复制合并结果",
  "Fill Selection": "填充选区",
  "Stroke Selection": "描边选区",
  "Shift Pixels": "环绕平移像素",
  "Copy Selection to New Layer": "复制选区到新图层",
  "Cut Selection to New Layer": "剪切选区到新图层",
  "Paste as New Layer": "粘贴为新图层",
  "Paste as Reference Layer": "粘贴为参考图层",
  "Created project from clipboard": "已从剪贴板创建项目",
  "Selected All": "已全选",
  "Selected All Cels": "已选择当前图层全部动画格",
  "Selected Linked Cels": "已选择链接动画格",
  "Selection cleared": "已取消选区",
  "Scale Selection": "缩放选区",
  "Rotate Selection Clockwise": "顺时针旋转选区",
  "Rotate Selection Counterclockwise": "逆时针旋转选区",
  "Flip Selection Horizontally": "水平翻转选区",
  "Flip Selection Vertically": "垂直翻转选区",
  "Change Layer Opacity": "修改图层不透明度",
  "Change Cel Properties": "修改动画格属性",
  "MCP document edits": "MCP 文档编辑",
  "MCP set pixels": "MCP 像素编辑",
  "Select an image layer": "请选择图像图层",
  "Recent project is unavailable": "最近项目不可用",
  "Add Layer": "新建图层",
  "Add Layer Group": "新建图层组",
  "Delete Layer": "删除图层",
  "Duplicate Layer": "复制图层",
  "Rename Layer": "重命名图层",
  "Hide Layer": "隐藏图层",
  "Show Layer": "显示图层",
  "Lock Layer": "锁定图层",
  "Unlock Layer": "解锁图层",
  "Move Layer Up": "上移图层",
  "Move Layer Down": "下移图层",
  "Merge Layer Down": "向下合并图层",
  "Change Blend Mode": "修改混合模式",
  "Add Palette Color": "添加调色板颜色",
  "Edit Palette Color": "编辑调色板颜色",
  "Remove Palette Color": "移除调色板颜色",
  "Add Frame": "新建帧",
  "Duplicate Frame": "复制帧",
  "Delete Frame": "删除帧",
  "Move Frame": "移动帧",
  "Change Frame Rate": "修改帧率",
  "Link Cels": "链接所选动画格",
  "Unlink Cels": "取消链接所选动画格",
  "Add Frame Tag": "添加帧标签",
  "Edit Frame Tag": "编辑帧标签",
  "Delete Frame Tag": "删除帧标签",
  "Crop Canvas": "裁剪画布",
  "Resize Canvas": "调整画布尺寸",
  "Delete Selection": "删除选区",
  "Cut Selection": "剪切选区",
  "Paste Selection": "粘贴选区",
  "Selected Cels": "已选择动画格",
  "Copied Cels": "已复制动画格",
  "Cut Cels": "剪切动画格",
  "Clear Cels": "清除动画格",
  "Paste Cels": "粘贴动画格",
  "Selected cels are locked": "所选动画格已锁定",
  "Cels cannot be pasted here": "无法在此处粘贴动画格",
  "Unsupported clipboard content": "剪贴板内容不受支持",
  "selected project is already open": "所选项目已在其他标签中打开",
  "Rename Project": "重命名项目",
  "Add Guide": "添加辅助线",
  "Move Guide": "移动辅助线",
  "Delete Guide": "删除辅助线",
  "Change Grid": "修改网格",
  "Move Grid": "移动网格",
  "Change Grid Snapping": "修改网格吸附",
  "Change Symmetry": "修改对称设置",
  "Move Symmetry Axis": "移动对称轴",
  "Change Tiled Preview": "修改平铺预览",
  "Change Onion Skin": "修改洋葱皮",
  "Change Layer Role": "修改图层角色",
  "Layer Properties": "图层属性",
  "Duplicate Layers": "复制图层",
  "Move Layers": "移动图层",
  "Merge Selected Layers": "合并所选图层",
  "Flatten Visible Layers": "合并可见图层",
  "Create Cels": "创建动画格",
  "Delete Cels": "删除动画格",
  "Reverse Frames": "反转所选帧",
  "Add Tilemap Layer": "新建图块图层",
  "Convert Layer to Tilemap": "将图层转换为图块地图",
  "Add Tile": "添加图块",
  "Delete Tile": "删除图块",
  "Draw Tiles": "绘制图块",
  "Draw Tile Pixels": "绘制图块像素",
  "Change Color Mode": "修改颜色模式",
  "Assign Color Profile": "分配颜色配置文件",
  "Convert Color Profile": "转换颜色配置文件",
  "Assign Embedded Color Profile": "分配嵌入式颜色配置文件",
  "Import Palette": "导入调色板",
  "Extract Palette": "提取调色板",
  "Sort Palette": "整理调色板",
  "Text": "文字",
  "Outline": "轮廓",
  "Shading": "明暗处理",
  "Brightness / Contrast": "亮度 / 对比度",
  "Hue / Saturation / Lightness": "色相 / 饱和度 / 明度",
  "Invert Colors": "反相颜色",
  "Convolution": "卷积滤镜",
  "Median Filter": "中值滤波",
  "Despeckle": "去斑",
  "Color Curves": "颜色曲线",
  "HSV / HSL Adjustment": "HSV / HSL 调整",
  "Channel Mask": "通道掩码",
  "Transform Cels": "变换动画格",
  "Move Cels": "移动动画格",
  "Rasterize Cels": "将动画格栅格化到画布",
  "Move Selection": "移动选区",
  "Rotate Selection": "旋转选区",
  "Change Frame Duration": "修改帧时长",
  "Resize Sprite": "调整精灵内容尺寸",
  "Trim Canvas": "裁去画布透明边缘",
  "Rotate Sprite Clockwise": "顺时针旋转精灵",
  "Rotate Sprite Counterclockwise": "逆时针旋转精灵",
  "Rotate Sprite 180": "旋转精灵 180°",
  "Flip Sprite Horizontally": "水平翻转精灵",
  "Flip Sprite Vertically": "垂直翻转精灵",
  "Add Slice": "添加切片",
  "Move Slices": "移动切片",
  "Scale Slices": "缩放切片",
  "Delete Slices": "删除切片",
  "Slice Properties": "切片属性",
  "Edit Slice": "编辑切片",
  "Edit Slice Pivot": "编辑切片中心点",
  "Rename Slice": "重命名切片",
  "Toggle Nine-patch": "切换九宫格",
  "Delete Slice": "删除切片",
  "History state restored": "已恢复历史状态",
  "Exporting PNG sequence...": "正在导出 PNG 序列...",
  "Sequence export failed": "序列导出失败",
  "No editable cels selected": "没有选择可编辑的动画格",
  "No editable image cels": "没有可编辑的图像动画格",
  "Text rendering failed": "文字渲染失败",
  "Exported packed atlas": "已导出紧凑图集",
  "Pause playback to edit": "暂停播放后才能编辑",
};

export function localizeStatus(value: string, language: Language): string {
  if (language === "en") return value;
  const named = chineseStatus[value];
  if (named) return named;
  const tool = (Object.keys(labels.en.toolsByID) as ToolID[]).find((id) => labels.en.toolsByID[id] === value);
  if (tool) return labels.zh.toolsByID[tool];
  const projectEntryTooLarge = value.match(/^project entry (.+) is too large$/);
  if (projectEntryTooLarge) return `项目条目 ${projectEntryTooLarge[1]} 过大`;
  const celDimensions = value.match(/^cel (.+) dimensions do not match manifest$/);
  if (celDimensions) return `动画格 ${celDimensions[1]} 的尺寸与项目清单不一致`;
  const gifDuration = value.match(/^GIF duration exceeds (\d+) centiseconds$/);
  if (gifDuration) return `GIF 帧时长超过 ${gifDuration[1]} 个百分之一秒`;
  const sizeLimit = value.match(/^(thumbnail|manifest) exceeds (\d+) bytes$/);
  if (sizeLimit) return `${sizeLimit[1] === "thumbnail" ? "缩略图" : "项目清单"}超过 ${sizeLimit[2]} 字节限制`;
  const pngSequenceExport = value.match(/^Exported (\d+) PNG frames$/);
  if (pngSequenceExport) return `已导出 ${pngSequenceExport[1]} 个 PNG 帧`;
  const splitSpriteSheetExport = value.match(/^Exported (tag|layer) sprite sheets$/);
  if (splitSpriteSheetExport) return `已导出按${splitSpriteSheetExport[1] === "tag" ? "帧标签" : "图层"}拆分的精灵图`;
  const prefixed = [
    ["Opened ", "已打开 "],
    ["Recovered ", "已恢复 "],
    ["Imported ", "已导入 "],
    ["Saved ", "已保存 "],
    ["Exported ", "已导出 "],
    ["Undid ", "已撤销："],
    ["Redid ", "已重做："],
    ["open PNG: ", "打开 PNG 失败："],
    ["rewind PNG: ", "重置 PNG 读取位置失败："],
    ["decode PNG: ", "解析 PNG 失败："],
    ["decode project: ", "解析项目失败："],
    ["decode recovery: ", "解析恢复文件失败："],
    ["encode recovery: ", "编码恢复文件失败："],
    ["sync recovery: ", "同步恢复文件失败："],
    ["read recovery: ", "读取恢复文件失败："],
    ["clear recovery: ", "清除恢复文件失败："],
    ["find recovery directory: ", "查找恢复目录失败："],
    ["create recovery directory: ", "创建恢复目录失败："],
    ["create temporary recovery: ", "创建临时恢复文件失败："],
    ["write recovery: ", "写入恢复文件失败："],
    ["close recovery: ", "关闭恢复文件失败："],
    ["replace recovery: ", "替换恢复文件失败："],
    ["encode opened project: ", "编码已打开项目失败："],
    ["encode project: ", "编码项目失败："],
    ["open project: ", "打开项目失败："],
    ["invalid project entry ", "无效的项目条目 "],
    ["duplicate project entry ", "重复的项目条目 "],
    ["project is missing cel image ", "项目缺少动画格图片 "],
    ["decode manifest: ", "解析项目清单失败："],
    ["create temporary project: ", "创建临时项目失败："],
    ["close temporary project: ", "关闭临时项目失败："],
    ["sync temporary project: ", "同步临时项目失败："],
    ["replace project: ", "替换项目失败："],
    ["encode empty thumbnail: ", "编码空缩略图失败："],
    ["create cel entry: ", "创建动画格条目失败："],
    ["encode cel ", "编码动画格失败："],
    ["write cel ", "写入动画格失败："],
    ["encode manifest: ", "编码项目清单失败："],
    ["manifest exceeds ", "项目清单超过限制："],
    ["create manifest: ", "创建项目清单失败："],
    ["write manifest: ", "写入项目清单失败："],
    ["create thumbnail: ", "创建缩略图失败："],
    ["encode thumbnail: ", "编码缩略图失败："],
    ["thumbnail exceeds ", "缩略图超过限制："],
    ["write thumbnail: ", "写入缩略图失败："],
    ["close project archive: ", "关闭项目文件失败："],
    ["open project entry: ", "打开项目条目失败："],
    ["read project entry ", "读取项目条目失败："],
    ["decode cel ", "解析动画格失败："],
    ["create PNG: ", "创建 PNG 失败："],
    ["encode PNG: ", "编码 PNG 失败："],
    ["sync PNG: ", "同步 PNG 失败："],
    ["close PNG: ", "关闭 PNG 失败："],
    ["rename PNG: ", "替换 PNG 失败："],
    ["create GIF: ", "创建 GIF 失败："],
    ["encode GIF: ", "编码 GIF 失败："],
    ["sync GIF: ", "同步 GIF 失败："],
    ["close GIF: ", "关闭 GIF 失败："],
    ["rename GIF: ", "替换 GIF 失败："],
    ["create sprite sheet: ", "创建精灵图失败："],
    ["encode sprite sheet: ", "编码精灵图失败："],
    ["sync sprite sheet: ", "同步精灵图失败："],
    ["close sprite sheet: ", "关闭精灵图失败："],
    ["rename sprite sheet: ", "替换精灵图失败："],
    ["GIF duration exceeds ", "GIF 帧时长超过限制："],
    ["image dimensions exceed ", "图片尺寸超过限制："],
    ["invalid RGBA buffer: ", "RGBA 像素数据无效："],
    ["unsupported .pixio format version ", "不支持的 .pixio 格式版本 "],
    ["project is missing ", "项目缺少 "],
    ["project entry ", "项目条目 "],
  ] as const;
  for (const [source, target] of prefixed) if (value.startsWith(source)) return `${target}${localizeStatus(value.slice(source.length), language)}`;
  if (value.endsWith(" is locked")) return `${value.slice(0, -10)} 已锁定`;
  return value;
}

type WailsWindow = Window & {
  go?: {main?: {App?: unknown}};
  runtime?: unknown;
};

const hasWailsAppBridge = () => Boolean((window as WailsWindow).go?.main?.App);
const hasWailsRuntimeBridge = () => Boolean((window as WailsWindow).runtime);
const webAPIBaseURL = "http://127.0.0.1:17353/api/pixio";

async function writeClipboardText(value: string) {
  if (hasWailsRuntimeBridge()) return ClipboardSetText(value);
  if (navigator.clipboard) await navigator.clipboard.writeText(value);
}

async function readClipboardText() {
  if (hasWailsRuntimeBridge()) return ClipboardGetText();
  return navigator.clipboard?.readText() ?? "";
}

async function pixelClipboardBlob(clipboard: PixelClipboard) {
  const canvas = document.createElement("canvas");
  canvas.width = clipboard.width;
  canvas.height = clipboard.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Clipboard image is unavailable");
  context.putImageData(new ImageData(new Uint8ClampedArray(clipboard.pixels), clipboard.width, clipboard.height), 0, 0);
  return canvasBlob(canvas, "image/png");
}

async function writePixelClipboard(clipboard: PixelClipboard) {
  if (hasWailsAppBridge()) {
    await ClipboardWriteImage(clipboard.width, clipboard.height, bytesToBase64(clipboard.pixels));
    return;
  }
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const blob = await pixelClipboardBlob(clipboard);
    await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
    return;
  }
  await writeClipboardText(serializePixelClipboard(clipboard));
}

async function readPixelClipboardImage(): Promise<PixelClipboard | null> {
  if (hasWailsAppBridge()) {
    const payload = await ClipboardReadImage();
    if (!payload) return null;
    const image = parsePNGResponse(payload);
    return {width: image.width, height: image.height, pixels: image.pixels};
  }
  if (!navigator.clipboard?.read) return null;
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((candidate) => candidate.startsWith("image/"));
    if (!type) continue;
    const bitmap = await createImageBitmap(await item.getType(type));
    try {
      if (!validPNGImportDimensions(bitmap.width, bitmap.height)) throw new Error("Invalid clipboard image dimensions");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(bitmap, 0, 0);
      return {width: bitmap.width, height: bitmap.height, pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data};
    } finally {
      bitmap.close();
    }
  }
  return null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function canvasBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Export failed")), type);
  });
}

async function chooseBrowserFile(accept: string) {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

async function chooseBrowserFiles(accept: string) {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []).sort((left, right) => left.name.localeCompare(right.name, undefined, {numeric: true})));
    input.click();
  });
}

async function decodeBrowserPNG(file: File) {
  const image = await createImageBitmap(file);
  try {
    if (!validPNGImportDimensions(image.width, image.height)) throw new Error("invalid PNG dimensions");
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", {willReadFrequently: true});
    if (!context) throw new Error("PNG import is unavailable");
    context.drawImage(image, 0, 0);
    return {name: file.name, width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data};
  } finally {
    image.close();
  }
}

async function browserPNGBlob(width: number, height: number, pixels: Uint8ClampedArray) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG export is unavailable");
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return canvasBlob(canvas, "image/png");
}

function browserGIFBlob(width: number, height: number, frames: Uint8ClampedArray[], durations: number[], loopCount: number, scale = 1) {
  const encoder = GIFEncoder();
  const outputWidth = width * scale;
  const outputHeight = height * scale;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = scale === 1 ? frames[index] : resizePixels(width, height, frames[index], scale, scale).pixels;
    const palette = quantize(frame, 256, {format: "rgba4444", oneBitAlpha: true});
    const transparentIndex = palette.findIndex((color) => color[3] === 0);
    encoder.writeFrame(applyPalette(frame, palette, "rgba4444"), outputWidth, outputHeight, {
      palette,
      delay: durations[index],
      repeat: index === 0 ? loopCount : undefined,
      transparent: transparentIndex >= 0,
      transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
    });
  }
  encoder.finish();
  return new Blob([new Uint8Array(encoder.bytes())], {type: "image/gif"});
}

async function webEncodePixio(document: string) {
  const response = await fetch(`${webAPIBaseURL}/encode`, {method: "POST", headers: {"Content-Type": "application/json"}, body: document});
  if (!response.ok) throw new Error(await response.text());
  return response.blob();
}

async function webDecodePixio(file: File) {
  const response = await fetch(`${webAPIBaseURL}/decode`, {method: "POST", headers: {"Content-Type": "application/octet-stream"}, body: file});
  if (!response.ok) throw new Error(await response.text());
  return response.text();
}

function storedNumber(key: string, fallback: number, minimum: number, maximum: number) {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

export function calculatePanelResizeValue(startValue: number, startClient: number, currentClient: number, uiScalePercent: number, minimum: number, maximum: number) {
  const uiScale = Math.max(0.01, uiScalePercent / 100);
  const delta = (startClient - currentClient) / uiScale;
  return Math.max(minimum, Math.min(maximum, Math.round(startValue + delta)));
}

export type TimelineScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export function getTimelineScrollTopForPeer(source: TimelineScrollMetrics, target: TimelineScrollMetrics) {
  const targetMax = Math.max(0, target.scrollHeight - target.clientHeight);
  return Math.max(0, Math.min(targetMax, source.scrollTop));
}

export function syncTimelineScrollPositions(source: TimelineScrollMetrics, target: TimelineScrollMetrics) {
  const scrollTop = getTimelineScrollTopForPeer(source, target);
  source.scrollTop = scrollTop;
  target.scrollTop = scrollTop;
  return scrollTop;
}

export function getTimelineHorizontalScrollbarHeight(surface: {offsetHeight: number; clientHeight: number}) {
  return Math.max(0, surface.offsetHeight - surface.clientHeight);
}

function isMenuSurfaceTarget(target: EventTarget | null, refs: ReadonlyArray<{current: HTMLElement | null}>) {
  if (typeof Node === "undefined" || !(target instanceof Node)) return false;
  return refs.some((ref) => Boolean(ref.current?.contains(target)));
}

function defaultToolShortcutAssignments(): ToolShortcutAssignments {
  const assignments = Object.fromEntries(tools.map(({id}) => [id, ""])) as ToolShortcutAssignments;
  for (const [key, tool] of Object.entries(toolShortcuts)) assignments[tool] = key;
  return assignments;
}

function storedToolShortcutAssignments(): ToolShortcutAssignments {
  const fallback = defaultToolShortcutAssignments();
  try {
    const parsed = JSON.parse(localStorage.getItem("pixtorio-tool-shortcuts") ?? "null") as Record<string, unknown> | null;
    if (!parsed) return fallback;
    const used = new Set<string>();
    for (const {id} of tools) {
      const key = typeof parsed[id] === "string" ? parsed[id].toLowerCase() : fallback[id];
      if (key && (!/^[a-z0-9]$/.test(key) || used.has(key))) continue;
      fallback[id] = key;
      if (key) used.add(key);
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function storedCommandShortcutAssignments(): Record<CommandShortcutID, string> {
  let assignments = {...defaultCommandShortcuts};
  try {
    const parsed = JSON.parse(localStorage.getItem("pixtorio-command-shortcuts") ?? "null") as Record<string, unknown> | null;
    if (!parsed) return assignments;
    for (const command of Object.keys(assignments) as CommandShortcutID[]) {
      if (typeof parsed[command] === "string") assignments = assignCommandShortcut(assignments, command, normalizeShortcut(parsed[command]));
    }
  } catch {
    return assignments;
  }
  return assignments;
}

function createBlankDocument(language: Language, width = 64, height = 64, colorMode: ColorMode = "rgba", preferences?: AppPreferences) {
  const ui = labels[language];
  const palette = readDefaultPalette(localStorage);
  const document = createDocument({
    name: ui.defaultDocumentName,
    layerName: `${ui.layerBaseName} 1`,
    width,
    height,
    colorMode,
    palette: palette.colors,
  });
  document.palette.name = palette.name;
  document.palette.transparentIndex = palette.transparentIndex;
  if (preferences) applyNewDocumentPreferenceDefaults(document, preferences);
  if (colorMode === "indexed") for (const cel of Object.values(document.cels)) cel.indexes?.fill(palette.transparentIndex);
  return document;
}

function App() {
  const [preferences, setPreferences] = useState<AppPreferences>(() => readPreferences(localStorage));
  const initialLanguageRef = useRef<Language>(preferences.general.language);
  const tabsRef = useRef<EditorTab[] | null>(null);
  const tabs = tabsRef.current ?? (tabsRef.current = []);
  const inactiveTabRef = useRef<EditorTab | null>(null);
  const inactiveTab = inactiveTabRef.current ?? (inactiveTabRef.current = createEditorTab(createBlankDocument(initialLanguageRef.current, 64, 64, preferences.color.defaultColorMode, preferences)));
  const knownTabIDs = new Set<string>();
  for (const tab of tabs) {
    if (knownTabIDs.has(tab.id)) tab.id = createTabID();
    knownTabIDs.add(tab.id);
  }
  const [activeTabID, setActiveTabID] = useState("");
  const activeTab = tabs.find((tab) => tab.id === activeTabID) ?? tabs[0] ?? inactiveTab;
  const hasOpenDocument = tabs.length > 0;
  const pixelDocument = activeTab.document;
  const activeLayer = getActiveLayer(pixelDocument);
  const activeCel = getCel(pixelDocument, activeLayer.id, pixelDocument.activeFrameId);
  const activeTileset = isTilemapLayer(activeLayer)
    ? pixelDocument.tilesets.find((tileset) => tileset.id === activeLayer.tilesetId) ?? null
    : null;
  const history = activeTab.history;
  const opacityBeforeRef = useRef<PixelDocument | null>(null);
  const frameDurationBeforeRef = useRef<PixelDocument | null>(null);
  const emptyCelBeforeRef = useRef<PixelDocument | null>(null);
  const tilemapEditBeforeRef = useRef<PixelDocument | null>(null);
  const tilemapLastPointRef = useRef<{x: number; y: number} | null>(null);
  const tilemapEditChangedRef = useRef(false);
  const tilemapAuthorityDeclinedRef = useRef(false);
  const tilemapPromptEndedGestureRef = useRef(false);
  const tilemapCellChangesRef = useRef(new Map<number, {before: number; after: number}>());
  const terrainCellChangesRef = useRef(new Map<number, {before: number; after: number}>());
  const tilemapGestureStartCellRef = useRef<{x: number; y: number} | null>(null);
  const tilemapGestureStartPointRef = useRef<{x: number; y: number} | null>(null);
  const tileSelectionDragRef = useRef<{selection: TilemapSelection; start: {x: number; y: number}} | null>(null);
  const tilesetSelectionDragRef = useRef<{start: HTMLButtonElement; moved: boolean} | null>(null);
  const tilesetSelectionSuppressClickRef = useRef(false);
  const celMoveSessionRef = useRef<CelMoveSession | null>(null);
  const timelineCelDragRef = useRef<TimelineCelDragSession | null>(null);
  const mcpInteractionGuardRef = useRef<(() => boolean) | null>(null);
  const mcpHandlerRef = useRef<(name: string, args: unknown) => unknown>(() => { throw new Error("Editor not ready"); });
  const playbackDirectionRef = useRef<1 | -1>(1);
  const playbackLoopCountRef = useRef(0);
  const cancelRenameRef = useRef(false);
  const cancelDocumentRenameRef = useRef(false);
  const clipboardRef = useRef<PixelClipboard | null>(null);
  const celClipboardRef = useRef<CelClipboard | null>(null);
  const detachedPreviewRef = useRef<Window | null>(null);
  const recoverySyncRef = useRef<Promise<void>>(Promise.resolve());
  const recoveryStartedRef = useRef(false);
  const saveQueuesRef = useRef(new Map<string, Promise<void>>());
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const editMenuRef = useRef<HTMLDivElement | null>(null);
  const spriteMenuRef = useRef<HTMLDivElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const paletteMenuRef = useRef<HTMLDivElement | null>(null);
  const menuLayerRef = useRef<HTMLDivElement | null>(null);
  const fileMenuPopoverRef = useRef<HTMLDivElement | null>(null);
  const editMenuPopoverRef = useRef<HTMLDivElement | null>(null);
  const spriteMenuPopoverRef = useRef<HTMLDivElement | null>(null);
  const viewMenuPopoverRef = useRef<HTMLDivElement | null>(null);
  const recentProjectsAnchorRef = useRef<HTMLDivElement | null>(null);
  const recentProjectsMenuRef = useRef<HTMLDivElement | null>(null);
  const pasteSpecialAnchorRef = useRef<HTMLDivElement | null>(null);
  const pasteSpecialMenuRef = useRef<HTMLDivElement | null>(null);
  const shiftPixelsAnchorRef = useRef<HTMLDivElement | null>(null);
  const shiftPixelsMenuRef = useRef<HTMLDivElement | null>(null);
  const imageEffectsAnchorRef = useRef<HTMLDivElement | null>(null);
  const imageEffectsMenuRef = useRef<HTMLDivElement | null>(null);
  const toolGroupMenuRef = useRef<HTMLDivElement | null>(null);
  const toolGroupLongPressTimerRef = useRef<number | null>(null);
  const toolGroupSuppressClickRef = useRef<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const documentTabsRef = useRef<HTMLDivElement | null>(null);
  const timelineLayersRef = useRef<HTMLDivElement | null>(null);
  const timelineFramesRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollSyncRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const activeTileGridLines = useMemo(() => {
    if (!activeTileset || !activeCel?.tilemap) return [];
    const layout = tilesetGridLayout(activeTileset, activeCel.tilemap);
    const positionedLayout = {
      ...layout,
      originX: (layout.originX ?? 0) + activeCel.x,
      originY: (layout.originY ?? 0) + activeCel.y,
    };
    return gridLineSegments(positionedLayout, {
      minColumn: 0,
      minRow: 0,
      maxColumn: activeCel.tilemap.columns - 1,
      maxRow: activeCel.tilemap.rows - 1,
    });
  }, [activeCel, activeTileset, revision]);
  const [displayDirtyBounds, setDisplayDirtyBounds] = useState<PixelBounds | null>(null);
  const pixelRenderRef = useRef<{frameRequest: number | null; bounds: PixelBounds | null}>({frameRequest: null, bounds: null});
  const [, setUIRevision] = useState(0);
  const [foregroundColor, setForegroundColor] = useState("#ef476f");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [foregroundAlpha, setForegroundAlpha] = useState(100);
  const [backgroundAlpha, setBackgroundAlpha] = useState(100);
  const [colorEditorMode, setColorEditorMode] = useState<ColorEditorMode>("rgba");
  const [colorSelectorMode, setColorSelectorMode] = useState<ColorSelectorMode>("spectrum");
  const [colorTarget, setColorTarget] = useState<ColorTarget>("foreground");
  const [brushSize, setBrushSize] = useState(1);
  const [brushShape, setBrushShape] = useState<BrushShape>("square");
  const [bitmapBrush, setBitmapBrush] = useState<BitmapBrush | null>(null);
  const [patternBrush, setPatternBrush] = useState<PatternBrush | null>(null);
  const [patternAlignment, setPatternAlignment] = useState<PatternAlignment>("source");
  const [patternOrigin, setPatternOrigin] = useState({x: 0, y: 0});
  const [brushPreset, setBrushPreset] = useState<"square" | "circle" | "cross" | "diamond" | "custom">("square");
  const [brushSpacing, setBrushSpacing] = useState(1);
  const [pixelPerfect, setPixelPerfect] = useState(preferences.drawing.pixelPerfect);
  const [pressureEnabled, setPressureEnabled] = useState(preferences.drawing.pressure);
  const [brushDynamicsEnabled, setBrushDynamicsEnabled] = useState(preferences.drawing.brushDynamics);
  const [brushDynamics, setBrushDynamics] = useState<BrushDynamicsOptions>(() => defaultBrushDynamics(1));
  const previousBrushSizeRef = useRef(brushSize);
  const [brushStabilizer, setBrushStabilizer] = useState(0);
  const [brushAngle, setBrushAngle] = useState(0);
  const [selectedTool, setSelectedTool] = useState<ToolID>("pencil");
  const [tilemapDrawMode, setTilemapDrawMode] = useState<"tiles" | "pixels" | "terrain">("tiles");
  const [tilemapToolMode, setTilemapToolMode] = useState<"pencil" | "picker" | "fill" | "line" | "rectangle" | "stamp" | "select">("pencil");
  const [tileRectangleFilled, setTileRectangleFilled] = useState(false);
  const [tileStamp, setTileStamp] = useState<TileStamp | null>(null);
  const [tileCellSelection, setTileCellSelection] = useState<TilemapSelection | null>(null);
  const [tileCellClipboard, setTileCellClipboard] = useState<TilemapClipboard | null>(null);
  const [tileStampEmptyMode, setTileStampEmptyMode] = useState<"overwrite" | "skip">("overwrite");
  const [tilePixelSyncMode, setTilePixelSyncMode] = useState<TilePixelSyncMode>("auto");
  const [selectedTileID, setSelectedTileID] = useState(0);
  const [selectedTileIDs, setSelectedTileIDs] = useState<number[]>([]);
  const [tileSearch, setTileSearch] = useState("");
  const [tileTerrainFilter, setTileTerrainFilter] = useState(0);
  const [tilePreviewSize, setTilePreviewSize] = useState(48);
  const [tileSelectionAnchorID, setTileSelectionAnchorID] = useState<number | null>(null);
  const [tileClipboard, setTileClipboard] = useState<Tileset["tiles"]>([]);
  const tileClipboardSourceRef = useRef<{tabID: string; tilesetID: string; width: number; height: number} | null>(null);
  const tileCellClipboardSourceRef = useRef<{tabID: string; tilesetID: string} | null>(null);
  const [selectedTileFlags, setSelectedTileFlags] = useState(0);
  const [tilemapHoverCell, setTilemapHoverCell] = useState<TileCell | null>(null);
  const [selectedTerrainID, setSelectedTerrainID] = useState(0);
  const [terrainToolMode, setTerrainToolMode] = useState<"brush" | "picker" | "fill" | "line" | "rectangle" | "stamp">("brush");
  const [terrainRectangleFilled, setTerrainRectangleFilled] = useState(false);
  const [terrainStamp, setTerrainStamp] = useState<TerrainStamp | null>(null);
  const [terrainStampEmptyMode, setTerrainStampEmptyMode] = useState<"overwrite" | "skip">("overwrite");
  const [terrainBrushRadius, setTerrainBrushRadius] = useState(0);
  const [terrainBrushShape, setTerrainBrushShape] = useState<"native" | "square">("native");
  const [terrainScatterPercent, setTerrainScatterPercent] = useState(100);
  const [terrainRuleMaskDraft, setTerrainRuleMaskDraft] = useState(0);
  const [terrainRuleWeightDraft, setTerrainRuleWeightDraft] = useState(1);
  useEffect(() => {
    setTileCellSelection(null);
    setTilemapHoverCell(null);
    tileSelectionDragRef.current = null;
  }, [activeTab.id, activeCel?.id, activeTileset?.id]);
  useEffect(() => {
    const clearTilesetDrag = () => {
      tilesetSelectionDragRef.current = null;
    };
    window.addEventListener("pointerup", clearTilesetDrag);
    window.addEventListener("blur", clearTilesetDrag);
    return () => {
      window.removeEventListener("pointerup", clearTilesetDrag);
      window.removeEventListener("blur", clearTilesetDrag);
    };
  }, []);
  const effectiveSelectedTerrainID = activeTileset?.terrains.some((terrain) => terrain.id === selectedTerrainID)
    ? selectedTerrainID
    : activeTileset?.terrains[0]?.id ?? 0;
  const activeTerrain = activeTileset?.terrains.find((terrain) => terrain.id === effectiveSelectedTerrainID) ?? null;
  const activeTerrainDiagnostic = activeTerrain && activeTileset ? terrainRuleDiagnostic(activeTerrain, {
    tileIds: activeTileset.tiles.map((tile) => tile.id),
    tileWidth: activeTileset.tileWidth,
    tileHeight: activeTileset.tileHeight,
  }) : null;
  const effectiveSelectedTileID = activeTileset?.tiles.some((tile) => tile.id === selectedTileID) ? selectedTileID : 0;
  const effectiveSelectedTileIDs = activeTileset
    ? selectedTileIDs.filter((id) => activeTileset.tiles.some((tile) => tile.id === id))
    : [];
  const tileUsage = useMemo(() => {
    const counts = new Map<number, {cells: number; rules: number; terrainIDs: number[]}>();
    if (!activeTileset) return counts;
    for (const tile of activeTileset.tiles) counts.set(tile.id, {cells: 0, rules: 0, terrainIDs: []});
    const layerIDs = new Set(pixelDocument.layers
      .filter((layer) => layer.kind === "tilemap" && layer.tilesetId === activeTileset.id)
      .map((layer) => layer.id));
    for (const cel of Object.values(pixelDocument.cels)) {
      if (!layerIDs.has(cel.layerId) || !cel.tilemap) continue;
      for (const value of cel.tilemap.tiles) {
        const entry = counts.get(tileValueIndex(value));
        if (entry) entry.cells += 1;
      }
    }
    for (const terrain of activeTileset.terrains) {
      for (const rule of terrain.rules) {
        for (const candidate of rule.candidates) {
          const entry = counts.get(candidate.tileId);
          if (!entry) continue;
          entry.rules += 1;
          if (!entry.terrainIDs.includes(terrain.id)) entry.terrainIDs.push(terrain.id);
        }
      }
    }
    return counts;
  }, [activeTileset, pixelDocument.cels, pixelDocument.layers, revision]);
  const tiledStampGeometry = useMemo(() => activeTileset && activeCel?.tilemap ? {
    tileset: activeTileset,
    tilemap: activeCel.tilemap,
    celOffset: {x: activeCel.x, y: activeCel.y},
    documentSize: {width: pixelDocument.width, height: pixelDocument.height},
    tiledX: pixelDocument.settings.tiledX,
    tiledY: pixelDocument.settings.tiledY,
  } : null, [activeTileset, activeCel, revision, pixelDocument.width, pixelDocument.height,
    pixelDocument.settings.tiledX, pixelDocument.settings.tiledY]);
  const tileCellOverlays = useMemo(() => {
    if (!activeTileset || !activeCel?.tilemap) return [];
    const tilemap = activeCel.tilemap;
    const inside = (cell: TileCell) => cell.column >= 0 && cell.row >= 0
      && cell.column < tilemap.columns && cell.row < tilemap.rows;
    const layout = tilesetGridLayout(activeTileset, tilemap);
    const positionedLayout = {
      ...layout,
      originX: (layout.originX ?? 0) + activeCel.x,
      originY: (layout.originY ?? 0) + activeCel.y,
    };
    let primary: TileCell[] = tileCellSelection
      ? Array.from({length: tileCellSelection.width * tileCellSelection.height}, (_, index) => ({
        column: tileCellSelection.x + index % tileCellSelection.width,
        row: tileCellSelection.y + Math.floor(index / tileCellSelection.width),
      }))
      : tilemapHoverCell ? [tilemapHoverCell] : [];
    if (tiledStampGeometry && tilemapHoverCell && tilemapDrawMode === "tiles" && tilemapToolMode === "stamp" && tileStamp) {
      primary = mapTiledTileStampTargets(tiledStampGeometry, tilemapHoverCell, tileStamp,
        {emptyMode: tileStampEmptyMode}).map(({cell}) => cell);
    } else if (tiledStampGeometry && tilemapHoverCell && tilemapDrawMode === "terrain" && terrainToolMode === "stamp" && terrainStamp) {
      primary = mapTiledTerrainStampTargets(tiledStampGeometry, tilemapHoverCell, terrainStamp,
        {emptyMode: terrainStampEmptyMode}).map(({cell}) => cell);
    } else if (tilemapHoverCell && tilemapDrawMode === "terrain" && terrainToolMode === "brush") {
      primary = terrainBrushShape === "square" && activeTileset.grid.kind !== "hexagonal"
        ? Array.from({length: (terrainBrushRadius * 2 + 1) ** 2}, (_, index) => ({
          column: tilemapHoverCell.column + index % (terrainBrushRadius * 2 + 1) - terrainBrushRadius,
          row: tilemapHoverCell.row + Math.floor(index / (terrainBrushRadius * 2 + 1)) - terrainBrushRadius,
        }))
        : expandCellRegion(layout, [tilemapHoverCell], terrainBrushRadius);
      if (tiledStampGeometry) {
        primary = mapTiledCellTargets(tiledStampGeometry, primary.map((cell) => ({cell, value: 0})))
          .map(({cell}) => cell);
      }
    }
    const acceptsCell = createTilemapSelectionPredicate(activeTab.selection, activeTileset, tilemap.columns, tilemap.rows,
      {celX: activeCel.x, celY: activeCel.y, gridOffset: tilemap.gridOffset});
    primary = primary.filter((cell) => inside(cell) && (tileCellSelection || acceptsCell(cell)));
    const primaryKeys = new Set(primary.map((cell) => `${cell.column}:${cell.row}`));
    const affected = tilemapDrawMode === "terrain"
      ? terrainAffectedCells(tilemap, activeTileset.terrains, layout, primary)
        .filter((cell) => !primaryKeys.has(`${cell.column}:${cell.row}`))
      : [];
    return [
      ...affected.map((cell) => ({points: cellPolygon(positionedLayout, cell), kind: "affected" as const})),
      ...primary.map((cell) => ({points: cellPolygon(positionedLayout, cell), kind: "primary" as const})),
    ];
  }, [activeCel, activeTab.selection, activeTileset, revision, terrainBrushRadius, terrainBrushShape, terrainStamp, terrainToolMode, tileCellSelection, tileStamp, tilemapDrawMode, tilemapHoverCell, tilemapToolMode, tiledStampGeometry, tileStampEmptyMode, terrainStampEmptyMode]);
  const tileImagePreviews = useMemo(() => {
    if (!activeTileset || !activeCel?.tilemap || !tilemapHoverCell
      || tilemapDrawMode !== "tiles" || selectedTool === "eraser"
      || tilemapToolMode === "picker" || tilemapToolMode === "select") return [];
    const entries = tilemapToolMode === "stamp" && tileStamp && tiledStampGeometry
      ? mapTiledTileStampTargets(tiledStampGeometry, tilemapHoverCell, tileStamp, {emptyMode: tileStampEmptyMode})
      : [{cell: tilemapHoverCell, value: (effectiveSelectedTileID | selectedTileFlags) >>> 0}];
    const layout = tilesetGridLayout(activeTileset, activeCel.tilemap);
    const acceptsCell = createTilemapSelectionPredicate(activeTab.selection, activeTileset,
      activeCel.tilemap.columns, activeCel.tilemap.rows,
      {celX: activeCel.x, celY: activeCel.y, gridOffset: activeCel.tilemap.gridOffset});
    return entries
      .filter(({cell, value}) => value !== 0
        && cell.column >= 0 && cell.row >= 0
        && cell.column < activeCel.tilemap!.columns && cell.row < activeCel.tilemap!.rows && acceptsCell(cell))
      .sort((left, right) => compareCellsForRendering(layout, left.cell, right.cell))
      .flatMap(({cell, value}) => {
        const tile = activeTileset.tiles.find((candidate) => candidate.id === tileValueIndex(value));
        if (!tile) return [];
        const pixels = new Uint8ClampedArray(tile.pixels.length);
        for (let y = 0; y < activeTileset.tileHeight; y += 1) {
          for (let x = 0; x < activeTileset.tileWidth; x += 1) {
            const source = sourcePixelForTileValue(value, x, y, activeTileset.tileWidth, activeTileset.tileHeight);
            const target = (y * activeTileset.tileWidth + x) * 4;
            const offset = (source.y * activeTileset.tileWidth + source.x) * 4;
            pixels.set(tile.pixels.subarray(offset, offset + 4), target);
          }
        }
        const origin = tileCellImageOrigin(activeTileset, activeCel.tilemap!, cell);
        return [{
          x: activeCel.x + origin.x,
          y: activeCel.y + origin.y,
          width: activeTileset.tileWidth,
          height: activeTileset.tileHeight,
          pixels,
        }];
      });
  }, [activeCel, activeTileset, effectiveSelectedTileID, selectedTileFlags, selectedTool, tileStamp, tilemapDrawMode, tilemapHoverCell, tilemapToolMode, tiledStampGeometry, tileStampEmptyMode, activeTab.selection]);
  const [inkMode, setInkMode] = useState<InkMode>("simple");
  const [gradientDither, setGradientDither] = useState<GradientDither>("none");
  const [gradientType, setGradientType] = useState<GradientType>("linear");
  const [shapeFillMode, setShapeFillMode] = useState<ShapeFillMode>("outline");
  const [blurRadius, setBlurRadius] = useState(2);
  const [jumbleAmount, setJumbleAmount] = useState(4);
  const [indexedDither, setIndexedDither] = useState<DitherMode>("none");
  const [polygonSides, setPolygonSides] = useState(5);
  const [textValue, setTextValue] = useState("Text");
  const [textFontFamily, setTextFontFamily] = useState("Arial");
  const [textFontSize, setTextFontSize] = useState(16);
  const [textLineHeight, setTextLineHeight] = useState(1.2);
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textAlign, setTextAlign] = useState<TextAlign>("left");
  const [textAntialias, setTextAntialias] = useState(false);
  const [textHinting, setTextHinting] = useState<TextHinting>("slight");
  const [textLigatures, setTextLigatures] = useState(true);
  const [loadedTextFonts, setLoadedTextFonts] = useState<Array<{family: string; fileName: string}>>([]);
  const [textStroke, setTextStroke] = useState(false);
  const [textStrokeWidth, setTextStrokeWidth] = useState(1);
  const [selectionOperation, setSelectionOperation] = useState<SelectionOperation>("replace");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("rectangle");
  const [selectionTolerance, setSelectionTolerance] = useState(0);
  const [selectionAdjustAmount, setSelectionAdjustAmount] = useState(1);
  const [selectionFeatherAmount, setSelectionFeatherAmount] = useState(1);
  const [selectionAntialias, setSelectionAntialias] = useState(false);
  const [transformMode, setTransformMode] = useState<TransformMode>("scale");
  const [selectionWidthDraft, setSelectionWidthDraft] = useState(1);
  const [selectionHeightDraft, setSelectionHeightDraft] = useState(1);
  const [selectionXDraft, setSelectionXDraft] = useState(0);
  const [selectionYDraft, setSelectionYDraft] = useState(0);
  const [selectionRotationDraft, setSelectionRotationDraft] = useState(0);
  const [activeSliceId, setActiveSliceId] = useState("");
  const [selectedSliceIds, setSelectedSliceIds] = useState<string[]>([]);
  const [sliceMoveX, setSliceMoveX] = useState(0);
  const [sliceMoveY, setSliceMoveY] = useState(0);
  const [sliceScaleX, setSliceScaleX] = useState(100);
  const [sliceScaleY, setSliceScaleY] = useState(100);
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(0);
  const [openToolGroupID, setOpenToolGroupID] = useState<string | null>(null);
  const [toolGroupMenuPosition, setToolGroupMenuPosition] = useState({left: 0, top: 0});
  const [preferredToolByGroup, setPreferredToolByGroup] = useState<Record<string, ToolID>>({});
  const [moveAutoSelect, setMoveAutoSelect] = useState(false);
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [layerNameDraft, setLayerNameDraft] = useState("");
  const [renamingDocumentTabID, setRenamingDocumentTabID] = useState<string | null>(null);
  const [documentNameDraft, setDocumentNameDraft] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);
  const [tagDialog, setTagDialog] = useState<TagDialogState | null>(null);
  const [crossDocumentCopyDialog, setCrossDocumentCopyDialog] = useState<CrossDocumentCopyDialogState | null>(null);
  const [exportDialog, setExportDialog] = useState<ExportKind | null>(null);
  const [exportScale, setExportScale] = useState(1);
  const [exportApplyPixelRatio, setExportApplyPixelRatio] = useState(false);
  const [exportFrameRange, setExportFrameRange] = useState<"all" | "selected" | "loop">("all");
  const [exportDirection, setExportDirection] = useState<TagDirection>("forward");
  const [gifLoopMode, setGifLoopMode] = useState<"once" | "forever" | "count">("forever");
  const [gifLoopCount, setGifLoopCount] = useState(2);
  const [sheetLayout, setSheetLayout] = useState<SpriteSheetLayout>("horizontal");
  const [sheetColumns, setSheetColumns] = useState(4);
  const [sheetBorderPadding, setSheetBorderPadding] = useState(0);
  const [sheetFramePadding, setSheetFramePadding] = useState(0);
  const [sheetAtlasJSON, setSheetAtlasJSON] = useState(false);
  const [sheetPacked, setSheetPacked] = useState(false);
  const [sheetSplitBy, setSheetSplitBy] = useState<"none" | "tag" | "layer">("none");
  const [adjustmentDialog, setAdjustmentDialog] = useState<AdjustmentDialogState | null>(null);
  const [outlinePreview, setOutlinePreview] = useState<{before: Uint8ClampedArray; after: Uint8ClampedArray; width: number; height: number} | null>(null);
  useEffect(() => { setOutlinePreview(null); }, [adjustmentDialog, foregroundColor, foregroundAlpha, revision]);
  const [spriteImportDialog, setSpriteImportDialog] = useState<SpriteImportDialogState | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(() => storedNumber("pixtorio-inspector-width", 228, 190, 420));
  const [timelineHeight, setTimelineHeight] = useState(() => storedNumber("pixtorio-timeline-height", 254, 150, 520));
  const [timelineLayersBottomPadding, setTimelineLayersBottomPadding] = useState(0);
  const [workspaceLayouts, setWorkspaceLayouts] = useState(() => readWorkspaceLayouts(localStorage));
  const [workspaceLayoutName, setWorkspaceLayoutName] = useState("");
  const [workspaceLayoutSelected, setWorkspaceLayoutSelected] = useState("");
  const [workspaceLayoutNotice, setWorkspaceLayoutNotice] = useState<"saved" | "loaded" | "deleted" | "reset" | "error" | null>(null);
  const [autosaveSeconds, setAutosaveSeconds] = useState(preferences.files.autosaveSeconds);
  const [showPixelGrid, setShowPixelGrid] = useState(preferences.grid.showPixelGrid);
  const [historyLimitMB, setHistoryLimitMB] = useState(preferences.undo.memoryLimitMB);
  const [shortcutAssignments, setShortcutAssignments] = useState<ToolShortcutAssignments>(storedToolShortcutAssignments);
  const [commandShortcutAssignments, setCommandShortcutAssignments] = useState<Record<CommandShortcutID, string>>(storedCommandShortcutAssignments);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lightTheme, setLightTheme] = useState(true);
  const [language, setLanguage] = useState<Language>(initialLanguageRef.current);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isRecentProjectsMenuOpen, setIsRecentProjectsMenuOpen] = useState(false);
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
  const [isPasteSpecialMenuOpen, setIsPasteSpecialMenuOpen] = useState(false);
  const [isShiftPixelsMenuOpen, setIsShiftPixelsMenuOpen] = useState(false);
  const [isSpriteMenuOpen, setIsSpriteMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isImageEffectsMenuOpen, setIsImageEffectsMenuOpen] = useState(false);
  const [isPaletteMenuOpen, setIsPaletteMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);
  const [inspectorVisible, setInspectorVisible] = useState(() => readWorkspaceVisibility(localStorage).inspectorVisible ?? defaultWorkspaceVisibility.inspectorVisible);
  const [timelineVisible, setTimelineVisible] = useState(() => readWorkspaceVisibility(localStorage).timelineVisible ?? defaultWorkspaceVisibility.timelineVisible);
  const [canvasOnly, setCanvasOnly] = useState(() => readWorkspaceCanvasOnly(localStorage));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tabScrollState, setTabScrollState] = useState({hasOverflow: false, canGoBack: false, canGoForward: false});
  const [canvasDialog, setCanvasDialog] = useState<"new" | "resize" | "sprite-size" | null>(null);
  const [layerPropertiesDialog, setLayerPropertiesDialog] = useState<LayerPropertiesDialogState | null>(null);
  const [slicePropertiesDialog, setSlicePropertiesDialog] = useState<SlicePropertiesDialogState | null>(null);
  const [canvasWidthDraft, setCanvasWidthDraft] = useState(64);
  const [canvasHeightDraft, setCanvasHeightDraft] = useState(64);
  const [newDocumentColorMode, setNewDocumentColorMode] = useState<ColorMode>(preferences.color.defaultColorMode);
  const [newDocumentBackground, setNewDocumentBackground] = useState<"transparent" | "foreground" | "background">(preferences.background.defaultFill);
  const [colorProfileDialog, setColorProfileDialog] = useState(false);
  const [colorProfileAction, setColorProfileAction] = useState<"assign" | "convert">("assign");
  const [colorProfileTarget, setColorProfileTarget] = useState<ConvertibleColorProfile>("srgb");
  const [pixelAspectWidthDraft, setPixelAspectWidthDraft] = useState(1);
  const [pixelAspectHeightDraft, setPixelAspectHeightDraft] = useState(1);
  const shortcutToolByKey = useMemo(() => {
    const entries = Object.entries(shortcutAssignments)
      .filter((entry): entry is [ToolID, string] => Boolean(entry[1]));
    return Object.fromEntries(entries.map(([tool, key]) => [key, tool])) as Record<string, ToolID>;
  }, [shortcutAssignments]);

  const updateToolShortcut = useCallback((tool: ToolID, rawKey: string) => {
    const key = rawKey.trim().slice(-1).toLowerCase();
    if (key && !/^[a-z0-9]$/.test(key)) return;
    if (key) {
      setCommandShortcutAssignments((current) => {
        const next = {...current};
        for (const command of Object.keys(next) as CommandShortcutID[]) {
          if (normalizeShortcut(next[command]) === key.toUpperCase()) next[command] = "";
        }
        return next;
      });
    }
    setShortcutAssignments((current) => {
      const next = {...current};
      const previous = current[tool];
      const conflict = (Object.keys(current) as ToolID[]).find((candidate) => candidate !== tool && current[candidate] === key);
      next[tool] = key;
      if (conflict) next[conflict] = previous;
      return next;
    });
  }, []);

  const captureCommandShortcut = useCallback((command: CommandShortcutID, event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Backspace") {
      setCommandShortcutAssignments((current) => assignCommandShortcut(current, command, ""));
      return;
    }
    const shortcut = shortcutFromEvent(event.nativeEvent);
    if (shortcut) {
      if (/^[A-Z0-9]$/.test(shortcut)) {
        setShortcutAssignments((current) => Object.fromEntries(Object.entries(current).map(([tool, key]) => [tool, key === shortcut.toLowerCase() ? "" : key])) as ToolShortcutAssignments);
      }
      setCommandShortcutAssignments((current) => assignCommandShortcut(current, command, shortcut));
    }
  }, []);

  const resetToolShortcuts = useCallback(() => {
    const defaults = defaultToolShortcutAssignments();
    const defaultKeys = new Set(Object.values(defaults).filter(Boolean).map((key) => key.toUpperCase()));
    setShortcutAssignments(defaults);
    setCommandShortcutAssignments((current) => Object.fromEntries(Object.entries(current).map(([command, shortcut]) => [command, defaultKeys.has(normalizeShortcut(shortcut)) ? "" : shortcut])) as Record<CommandShortcutID, string>);
  }, []);

  const beginPanelResize = useCallback((kind: "inspector" | "timeline", event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const startClient = kind === "inspector" ? event.clientX : event.clientY;
    const startValue = kind === "inspector" ? inspectorWidth : timelineHeight;
    const onMove = (moveEvent: PointerEvent) => {
      const currentClient = kind === "inspector" ? moveEvent.clientX : moveEvent.clientY;
      if (kind === "inspector") setInspectorWidth(calculatePanelResizeValue(startValue, startClient, currentClient, preferences.general.uiScale, 190, 420));
      else setTimelineHeight(calculatePanelResizeValue(startValue, startClient, currentClient, preferences.general.uiScale, 150, 520));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, {once: true});
  }, [inspectorWidth, preferences.general.uiScale, timelineHeight]);
  const [celRotationDraft, setCelRotationDraft] = useState(0);
  const [celPropertiesDialog, setCelPropertiesDialog] = useState<{addresses: Array<{layerId: string; frameId: string}>; opacity: string; zIndex: string} | null>(null);
  const [celOffsetXDraft, setCelOffsetXDraft] = useState(0);
  const [celOffsetYDraft, setCelOffsetYDraft] = useState(0);
  const [horizontalAnchor, setHorizontalAnchor] = useState<"left" | "center" | "right">("center");
  const [verticalAnchor, setVerticalAnchor] = useState<"top" | "center" | "bottom">("center");
  const [canvasSizeError, setCanvasSizeError] = useState(false);
  const [recentProjects, setRecentProjects] = useState<string[]>(() => {
    try { const stored = JSON.parse(localStorage.getItem("pixtorio-recent") ?? "[]"); return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []; }
    catch { return []; }
  });
  const zoom = activeTab.zoom;
  const cursor = activeTab.cursor;
  const cursorOutputRef = useRef<HTMLSpanElement>(null);
  const status = activeTab.status;
  const selection = activeTab.selection;
  const transparentPixels = useMemo(
    () => new Uint8ClampedArray(pixelDocument.width * pixelDocument.height * 4),
    [pixelDocument.height, pixelDocument.width],
  );
  const clearQueuedPixelRender = useCallback(() => {
    const pending = pixelRenderRef.current;
    if (pending.frameRequest !== null) window.cancelAnimationFrame(pending.frameRequest);
    pending.frameRequest = null;
    pending.bounds = null;
  }, []);
  useEffect(() => clearQueuedPixelRender, [clearQueuedPixelRender]);
  const invalidate = useCallback(() => {
    clearQueuedPixelRender();
    setDisplayDirtyBounds(null);
    setRevision((value) => value + 1);
  }, [clearQueuedPixelRender]);
  const queuePixelRender = useCallback((bounds: PixelBounds) => {
    const pending = pixelRenderRef.current;
    pending.bounds = combinePixelBounds(pending.bounds, bounds);
    if (pending.frameRequest !== null) return;
    pending.frameRequest = window.requestAnimationFrame(() => {
      const dirtyBounds = pending.bounds;
      pending.frameRequest = null;
      pending.bounds = null;
      setDisplayDirtyBounds(dirtyBounds);
      setRevision((value) => value + 1);
    });
  }, []);
  const invalidatePixels = useCallback((bounds?: {x: number; y: number; width: number; height: number}) => {
    if (activeCel) touchTabThumbnailCels(activeTab, [activeCel.id]);
    if (!onionSkin && bounds) {
      activeTab.compositeCache.repair(pixelDocument, pixelDocument.activeFrameId, bounds);
      queuePixelRender(bounds);
    } else {
      activeTab.compositeCache.clear();
      invalidate();
    }
  }, [activeCel, activeTab, invalidate, onionSkin, pixelDocument, queuePixelRender]);
  const setActiveTabValue = useCallback((update: Partial<EditorTab>) => {
    Object.assign(activeTab, update);
    setUIRevision((value) => value + 1);
  }, [activeTab]);
  const setZoom = useCallback((value: React.SetStateAction<number>) => {
    setActiveTabValue({zoom: typeof value === "function" ? value(activeTab.zoom) : value});
  }, [activeTab.zoom, setActiveTabValue]);
  const setCursor = useCallback((value: React.SetStateAction<{x: number; y: number} | null>) => {
    const next = typeof value === "function" ? value(activeTab.cursor) : value;
    if (activeTab.cursor?.x === next?.x && activeTab.cursor?.y === next?.y) return;
    activeTab.cursor = next;
    if (cursorOutputRef.current) cursorOutputRef.current.textContent = next ? `${next.x}, ${next.y}` : "-, -";
  }, [activeTab]);
  const setStatus = useCallback((value: React.SetStateAction<string>) => {
    setActiveTabValue({status: typeof value === "function" ? value(activeTab.status) : value});
  }, [activeTab.status, setActiveTabValue]);
  const setSelection = useCallback((value: React.SetStateAction<Selection | null>) => {
    setTabCommandScope(activeTab, "canvas");
    const next = typeof value === "function" ? value(activeTab.selection) : value;
    if (!next && activeTab.selection) activeTab.lastSelection = cloneSelection(activeTab.selection);
    if (!next) activeTab.transformPivot = null;
    else if (!activeTab.transformPivot) activeTab.transformPivot = {x: next.x + next.width / 2, y: next.y + next.height / 2};
    setActiveTabValue({selection: next});
  }, [activeTab.selection, setActiveTabValue]);
  const clearToolGroupLongPress = useCallback(() => {
    if (toolGroupLongPressTimerRef.current === null) return;
    window.clearTimeout(toolGroupLongPressTimerRef.current);
    toolGroupLongPressTimerRef.current = null;
  }, []);
  const openToolGroupMenu = useCallback((group: ToolGroup, anchor: HTMLButtonElement) => {
    if (group.tools.length < 2) return;
    const bounds = anchor.getBoundingClientRect();
    const scale = preferences.general.uiScale / 100;
    const menuHeight = group.tools.length * 34 + 10;
    setToolGroupMenuPosition({
      left: Math.min(window.innerWidth / scale - 184, bounds.right / scale + 6),
      top: Math.max(8, Math.min(window.innerHeight / scale - menuHeight - 8, bounds.top / scale)),
    });
    setOpenToolGroupID(group.id);
  }, [preferences.general.uiScale]);
  const beginToolGroupLongPress = useCallback((group: ToolGroup, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || group.tools.length < 2) return;
    clearToolGroupLongPress();
    const anchor = event.currentTarget;
    toolGroupLongPressTimerRef.current = window.setTimeout(() => {
      toolGroupLongPressTimerRef.current = null;
      toolGroupSuppressClickRef.current = group.id;
      openToolGroupMenu(group, anchor);
    }, 420);
  }, [clearToolGroupLongPress, openToolGroupMenu]);
  useEffect(() => () => clearToolGroupLongPress(), [clearToolGroupLongPress]);
  useEffect(() => {
    if (!openToolGroupID) toolGroupSuppressClickRef.current = null;
  }, [openToolGroupID]);
  const showContextMenu = useCallback((target: EditorContextTarget, clientX: number, clientY: number) => {
    const scale = Math.max(0.01, preferences.general.uiScale / 100);
    setContextMenu({
      target,
      left: clientX / scale,
      top: clientY / scale,
    });
  }, [preferences.general.uiScale]);
  const openContextMenu = useCallback((event: ReactMouseEvent, target: EditorContextTarget) => {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu(target, event.clientX, event.clientY);
  }, [showContextMenu]);
  const openKeyboardContextMenu = useCallback((event: ReactKeyboardEvent<HTMLElement>, target: EditorContextTarget) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return false;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    showContextMenu(target, bounds.left + Math.min(24, bounds.width / 2), bounds.top + Math.min(24, bounds.height / 2));
    return true;
  }, [showContextMenu]);
  const activateTool = useCallback((tool: ToolID) => {
    const group = getToolGroup(tool);
    if (group) setPreferredToolByGroup((current) => current[group.id] === tool ? current : {...current, [group.id]: tool});
    setOpenToolGroupID(null);
    setSelectedTool(tool);
    if (tool === "transform" && activeTab.selection) {
      activeTab.transformPivot = {
        x: activeTab.selection.x + activeTab.selection.width / 2,
        y: activeTab.selection.y + activeTab.selection.height / 2,
      };
    }
    setTabCommandScope(activeTab, "canvas");
    setStatus(labels.en.toolsByID[tool]);
  }, [activeTab, setStatus]);
  const foregroundRGBA = useMemo(() => constrainColorToMode(
    rgbaWithAlpha(foregroundColor, foregroundAlpha),
    pixelDocument.colorMode,
    pixelDocument.palette.colors,
  ), [foregroundAlpha, foregroundColor, pixelDocument.colorMode, pixelDocument.palette.colors]);
  const paletteSignature = pixelDocument.palette.colors.join("|");
  const documentPatternBrush = useMemo(() => {
    if (!patternBrush || pixelDocument.colorMode === "rgba") return patternBrush;
    const pixels = patternBrush.pixels.slice();
    for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(constrainColorToMode([pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]], pixelDocument.colorMode, pixelDocument.palette.colors), offset);
    return {...patternBrush, pixels};
  }, [patternBrush, pixelDocument.colorMode, paletteSignature]);
  const backgroundRGBA = useMemo(() => constrainColorToMode(
    rgbaWithAlpha(backgroundColor, backgroundAlpha),
    pixelDocument.colorMode,
    pixelDocument.palette.colors,
  ), [backgroundAlpha, backgroundColor, pixelDocument.colorMode, pixelDocument.palette.colors]);
  const backgroundClearColor = useMemo<RGBA>(() => [
    backgroundRGBA[0],
    backgroundRGBA[1],
    backgroundRGBA[2],
    255,
  ], [backgroundRGBA]);
  const activeClearColor = useMemo<RGBA | undefined>(() => activeLayer.role === "background"
    ? backgroundClearColor
    : undefined, [activeLayer.role, backgroundClearColor]);
  const editedColor = colorTarget === "foreground" ? foregroundColor : backgroundColor;
  const editedAlpha = colorTarget === "foreground" ? foregroundAlpha : backgroundAlpha;
  const editedRGBA = useMemo<RGBAColor>(() => {
    const [r, g, b] = hexToRGBA(editedColor);
    return {r, g, b, a: editedAlpha};
  }, [editedAlpha, editedColor]);
  const editedHSLA = useMemo(() => rgbToHsla(editedRGBA), [editedRGBA]);
  const setEditedColor = (color: RGBAColor) => {
    const hex = editorColorToHex(color);
    const alpha = clampPercent(color.a, editedAlpha);
    if (colorTarget === "foreground") {
      setForegroundColor(hex);
      setForegroundAlpha(alpha);
    } else {
      setBackgroundColor(hex);
      setBackgroundAlpha(alpha);
    }
  };
  const updateColorChannel = (channel: keyof RGBAColor | keyof HSLAColor, value: number) => {
    if (colorEditorMode === "rgba") {
      setEditedColor({
        ...editedRGBA,
        [channel]: channel === "a" ? alphaFromDisplay(value, preferences.color.alphaRange, editedRGBA.a) : clampByte(value, editedRGBA[channel as keyof RGBAColor]),
      });
      return;
    }
    const next = {
      ...editedHSLA,
      [channel]: channel === "h" ? value : channel === "a"
        ? alphaFromDisplay(value, preferences.color.alphaRange, editedHSLA.a)
        : clampPercent(value, editedHSLA[channel as keyof HSLAColor]),
    };
    setEditedColor(hslaToRgba(next));
  };
  const colorChannels = colorEditorMode === "rgba"
    ? [
      {key: "r", label: "R", value: editedRGBA.r, maximum: 255},
      {key: "g", label: "G", value: editedRGBA.g, maximum: 255},
      {key: "b", label: "B", value: editedRGBA.b, maximum: 255},
      {key: "a", label: "A", value: alphaToDisplay(editedRGBA.a, preferences.color.alphaRange), maximum: alphaDisplayMaximum(preferences.color.alphaRange)},
    ] as const
    : [
      {key: "h", label: "H", value: editedHSLA.h, maximum: 360},
      {key: "s", label: "S", value: editedHSLA.s, maximum: 100},
      {key: "l", label: "L", value: editedHSLA.l, maximum: 100},
      {key: "a", label: "A", value: alphaToDisplay(editedHSLA.a, preferences.color.alphaRange), maximum: alphaDisplayMaximum(preferences.color.alphaRange)},
    ] as const;
  const editedColorText = colorEditorMode === "rgba"
    ? `rgba(${editedRGBA.r}, ${editedRGBA.g}, ${editedRGBA.b}, ${Math.round(alphaToDisplay(editedRGBA.a, preferences.color.alphaRange))}${preferences.color.alphaRange === "percent" ? "%" : ""})`
    : `hsla(${Math.round(editedHSLA.h)}, ${Math.round(editedHSLA.s)}%, ${Math.round(editedHSLA.l)}%, ${Math.round(alphaToDisplay(editedHSLA.a, preferences.color.alphaRange))}${preferences.color.alphaRange === "percent" ? "%" : ""})`;
  const editedColorSummary = `${editedColor.toUpperCase()} · ${Math.round(alphaToDisplay(editedAlpha, preferences.color.alphaRange))}${preferences.color.alphaRange === "percent" ? "%" : ""}`;
  const colorChipBackground = (color: string, alpha?: number) => {
    const parsed = parseEditorHexColor(color) ?? {r: 0, g: 0, b: 0, a: 100};
    const overlay = `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${clampPercent(alpha ?? parsed.a) / 100})`;
    return {
      backgroundImage: `linear-gradient(${overlay}, ${overlay}), conic-gradient(#f0f1f2 25%, #aeb1b6 0 50%, #f0f1f2 0 75%, #aeb1b6 0)`,
      backgroundSize: "100% 100%, 8px 8px",
    };
  };
  const ui = labels[language];
  const selectedFrameIds = useMemo(() => {
    const valid = new Set(pixelDocument.frames.map((frame) => frame.id));
    const selected = activeTab.selectedFrameIds.filter((frameId) => valid.has(frameId));
    return selected.length > 0 ? selected : [pixelDocument.activeFrameId];
  }, [activeTab, pixelDocument, revision]);
  const selectedCels = selectedCelAddresses(pixelDocument, activeTab.selectedCelKeys);
  const selectedCelKeySet = new Set(activeTab.selectedCelKeys);
  const selectedLayerIdSet = new Set(activeTab.selectedLayerIds);
  const selectedLayers = pixelDocument.layers.filter((layer) => selectedLayerIdSet.has(layer.id));
  const selectedCelLayerIDs = new Set(selectedCels.map(({layerId}) => layerId));
  const transformTargetCels = preferences.selection.transformScope === "selected-rows-columns"
    ? pixelDocument.layers.flatMap((layer) => selectedCelLayerIDs.has(layer.id) && isImageLayer(layer)
      ? selectedFrameIds
        .filter((frameId) => Boolean(getCel(pixelDocument, layer.id, frameId)))
        .map((frameId) => ({layerId: layer.id, frameId}))
      : [])
    : selectedCels;
  const activeTag = pixelDocument.tags.find((tag) => tag.id === activeTab.activeTagId) ?? null;
  const focusableTagId = activeTag?.id ?? focusTagIdForFrame(pixelDocument, pixelDocument.activeFrameId) ?? focusTagIdForFrame(pixelDocument, selectedFrameIds[0]);
  const activeSlice = pixelDocument.slices.find((slice) => slice.id === activeSliceId) ?? pixelDocument.slices[0] ?? null;
  const activeSliceKey = activeSlice?.keys.find((key) => key.frameId === pixelDocument.activeFrameId) ?? null;
  const sliceOverlays = pixelDocument.slices.flatMap((slice) => {
    const key = slice.keys.find((candidate) => candidate.frameId === pixelDocument.activeFrameId);
    return key ? [{id: slice.id, x: key.x, y: key.y, width: key.width, height: key.height, color: slice.color}] : [];
  });
  const timelineEntries = timelineLayerEntries(pixelDocument).filter(({layer}) => {
    let parentId = layer.parentId;
    while (parentId) {
      if (activeTab.collapsedGroupIds.has(parentId)) return false;
      parentId = getLayerByID(pixelDocument, parentId)?.parentId;
    }
    return true;
  });
  const handleTimelineScroll = useCallback((source: "layers" | "frames") => {
    if (timelineScrollSyncRef.current) return;
    const sourceElement = source === "layers" ? timelineLayersRef.current : timelineFramesRef.current;
    const targetElement = source === "layers" ? timelineFramesRef.current : timelineLayersRef.current;
    if (!sourceElement || !targetElement) return;
    timelineScrollSyncRef.current = true;
    try {
      syncTimelineScrollPositions(sourceElement, targetElement);
    } finally {
      timelineScrollSyncRef.current = false;
    }
  }, []);
  useLayoutEffect(() => {
    if (!timelineVisible) {
      setTimelineLayersBottomPadding((current) => current === 0 ? current : 0);
      return;
    }
    const frames = timelineFramesRef.current;
    if (!frames) {
      setTimelineLayersBottomPadding((current) => current === 0 ? current : 0);
      return;
    }
    const updateBottomPadding = () => {
      const next = getTimelineHorizontalScrollbarHeight(frames);
      setTimelineLayersBottomPadding((current) => current === next ? current : next);
    };
    updateBottomPadding();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateBottomPadding);
    observer.observe(frames);
    return () => observer.disconnect();
  }, [activeTabID, hasOpenDocument, pixelDocument.frames.length, preferences.general.uiScale, timelineEntries.length, timelineHeight, timelineVisible]);
  const allTimelineImageLayerIDs = timelineLayerEntries(pixelDocument)
    .filter(({layer}) => isCelLayer(layer))
    .map(({layer}) => layer.id);
  const visibleTimelineImageLayerIDs = timelineEntries
    .filter(({layer}) => isCelLayer(layer))
    .map(({layer}) => layer.id);
  const activeLayerLocked = isLayerEffectivelyLocked(pixelDocument, activeLayer);
  const selectedCelsEditable = selectedCels.length > 0 && selectedCels.every(({layerId}) => {
    const layer = getLayerByID(pixelDocument, layerId);
    return Boolean(layer && isCelLayer(layer) && !isLayerEffectivelyLocked(pixelDocument, layer));
  });
  const transformTargetCelsEditable = transformTargetCels.length > 0 && transformTargetCels.every(({layerId}) => {
    const layer = getLayerByID(pixelDocument, layerId);
    return Boolean(layer && isImageLayer(layer) && !isLayerEffectivelyLocked(pixelDocument, layer));
  });
  const celGridOwnsTabStop = activeTab.commandScope !== "frame"
    && visibleTimelineImageLayerIDs.includes(pixelDocument.activeLayerId);
  const celOperationGroups = (() => {
    const groups = new Map<string, string[]>();
    const addresses = activeTab.commandScope === "cels"
      ? selectedCels
      : activeTab.commandScope === "frame" && isCelLayer(activeLayer)
        ? selectedFrameIds.map((frameId) => ({layerId: activeLayer.id, frameId}))
        : [];
    for (const {layerId, frameId} of addresses) {
      const frameIds = groups.get(layerId) ?? [];
      if (!frameIds.includes(frameId)) frameIds.push(frameId);
      groups.set(layerId, frameIds);
    }
    return Array.from(groups, ([layerId, frameIds]) => ({layerId, frameIds}));
  })();
  const linkableCelGroups = celOperationGroups.filter(({frameIds}) => frameIds.length >= 2);
  const unlinkableCelGroups = celOperationGroups.filter(({layerId, frameIds}) => frameIds.some((frameId) => {
    const cel = getCel(pixelDocument, layerId, frameId);
    return Boolean(cel && isCelLinked(pixelDocument, cel));
  }));
  const celGroupsEditable = (groups: ReadonlyArray<{layerId: string}>) => groups.every(({layerId}) => {
    const layer = getLayerByID(pixelDocument, layerId);
    return Boolean(layer && isCelLayer(layer) && !isLayerEffectivelyLocked(pixelDocument, layer));
  });
  const canEditPixels = hasOpenDocument && Boolean(
    isImageLayer(activeLayer)
    && activeLayer.role !== "reference"
    && !activeLayerLocked
    && !isPlaying
    && (!activeCel || (activeCel.x === 0 && activeCel.y === 0
      && activeCel.width === pixelDocument.width && activeCel.height === pixelDocument.height)),
  );
  const hasEditableAdjustmentTarget = Object.values(pixelDocument.cels).some((cel) => {
    const layer = getLayerByID(pixelDocument, cel.layerId);
    return Boolean(layer && isEditableImageLayer(layer) && !isLayerEffectivelyLocked(pixelDocument, layer));
  });
  const canOpenAdjustment = hasOpenDocument && !isPlaying && (canEditPixels || hasEditableAdjustmentTarget);
  const paletteIndex = pixelDocument.palette.colors.length > 0
    ? Math.max(0, Math.min(selectedPaletteIndex, pixelDocument.palette.colors.length - 1))
    : 0;
  const hasSelectedPaletteColor = Boolean(pixelDocument.palette.colors[paletteIndex]);
  const hasUnsavedChanges = tabs.some((tab) => tab.history.isDirty);

  useEffect(() => {
    if (!hasOpenDocument && historyOpen) setHistoryOpen(false);
  }, [hasOpenDocument, historyOpen]);

  useEffect(() => {
    if (selectedPaletteIndex !== paletteIndex) setSelectedPaletteIndex(paletteIndex);
  }, [activeTabID, paletteIndex, pixelDocument.palette.colors.length, revision, selectedPaletteIndex]);

  useEffect(() => {
    if (!hasWailsAppBridge()) return;
    void SetWindowCloseState(hasUnsavedChanges, language).catch(() => undefined);
  }, [hasUnsavedChanges, language]);

  const syncRecoverySnapshot = useCallback(async () => {
    const payload = encodeRecoveryPayload(
      tabs.map((tab) => ({id: tab.id, filePath: tab.filePath, document: tab.document, isDirty: tab.history.isDirty})),
      activeTabID,
    );
    recoverySyncRef.current = recoverySyncRef.current
      .catch(() => undefined)
      .then(async () => {
        if (payload) await SaveRecovery(payload);
        else await ClearRecovery();
      });
    await recoverySyncRef.current;
  }, [activeTabID, tabs]);
  const displayPixels = useMemo(() => {
    const index = pixelDocument.frames.findIndex((frame) => frame.id === pixelDocument.activeFrameId);
    if (!onionSkin) return activeTab.compositeCache.get(pixelDocument);
    const previous = pixelDocument.frames.slice(Math.max(0, index - pixelDocument.settings.onionPreviousFrames), index).map((frame) => frame.id).reverse();
    const next = pixelDocument.frames.slice(index + 1, index + 1 + pixelDocument.settings.onionNextFrames).map((frame) => frame.id);
    return compositeFrameWithOnionSkin(
      pixelDocument,
      previous,
      next,
    );
  }, [activeTab, onionSkin, pixelDocument, revision]);

  useEffect(() => {
    const preview = detachedPreviewRef.current;
    if (!preview || preview.closed || !hasOpenDocument) return;
    const canvas = preview.document.querySelector<HTMLCanvasElement>("canvas");
    const counter = preview.document.querySelector<HTMLElement>("[data-counter]");
    if (!canvas) return;
    const ratio = normalizePixelAspectRatio(pixelDocument.pixelAspectRatio);
    const displayWidth = pixelDocument.width * ratio.width;
    const displayHeight = pixelDocument.height * ratio.height;
    canvas.width = pixelDocument.width;
    canvas.height = pixelDocument.height;
    canvas.style.aspectRatio = `${displayWidth} / ${displayHeight}`;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = "auto";
    const imageData = new ImageData(pixelDocument.width, pixelDocument.height);
    imageData.data.set(compositeFrame(pixelDocument));
    canvas.getContext("2d")?.putImageData(imageData, 0, 0);
    preview.document.documentElement.dataset.theme = lightTheme ? "light" : "dark";
    preview.document.title = language === "zh" ? "Pixtorio 动画预览" : "Pixtorio Animation Preview";
    if (counter) counter.textContent = `${pixelDocument.frames.findIndex((frame) => frame.id === pixelDocument.activeFrameId) + preferences.timeline.firstFrame} / ${preferences.timeline.firstFrame + pixelDocument.frames.length - 1}`;
  }, [hasOpenDocument, language, lightTheme, pixelDocument, preferences.timeline.firstFrame, revision]);

  useEffect(() => () => detachedPreviewRef.current?.close(), []);

  useEffect(() => {
    if (!selection) return;
    setSelectionXDraft(selection.x);
    setSelectionYDraft(selection.y);
    setSelectionWidthDraft(selection.width);
    setSelectionHeightDraft(selection.height);
  }, [selection?.height, selection?.width, selection?.x, selection?.y]);

  useEffect(() => {
    if (!isPlaying) return;
    const frame = pixelDocument.frames.find((candidate) => candidate.id === pixelDocument.activeFrameId) ?? pixelDocument.frames[0];
    const timer = window.setTimeout(() => {
      const index = pixelDocument.frames.findIndex((candidate) => candidate.id === frame.id);
      const requestedStart = pixelDocument.frames.findIndex((candidate) => candidate.id === activeTab.loopStartFrameId);
      const requestedEnd = pixelDocument.frames.findIndex((candidate) => candidate.id === activeTab.loopEndFrameId);
      const normalizedStart = requestedStart < 0 ? 0 : requestedStart;
      const normalizedEnd = requestedEnd < 0 ? pixelDocument.frames.length - 1 : requestedEnd;
      const start = Math.min(normalizedStart, normalizedEnd);
      const end = Math.max(normalizedStart, normalizedEnd);
      const tagDirection = activeTag?.direction ?? "forward";
      const previousDirection = playbackDirectionRef.current;
      let direction: 1 | -1 = tagDirection === "reverse" ? -1 : playbackDirectionRef.current;
      if (tagDirection === "pingpong") {
        if (index >= end) direction = -1;
        if (index <= start) direction = 1;
        playbackDirectionRef.current = direction;
      }
      const nextIndex = tagDirection === "forward"
        ? (index >= end || index < start ? start : index + 1)
        : tagDirection === "reverse"
          ? (index <= start || index > end ? end : index - 1)
          : Math.max(start, Math.min(end, index + direction));
      const completedLoop = tagDirection === "forward"
        ? index >= end
        : tagDirection === "reverse"
          ? index <= start
          : direction === 1 && index <= start && previousDirection === -1;
      if (completedLoop && activeTag?.repeat && ++playbackLoopCountRef.current >= activeTag.repeat) {
        if (preferences.timeline.rewindOnStop) syncPlaybackFrameSelection(activeTab, pixelDocument.frames[tagDirection === "reverse" ? end : start].id);
        setIsPlaying(false);
        return;
      }
      syncPlaybackFrameSelection(activeTab, pixelDocument.frames[nextIndex].id);
      setRevision((value) => value + 1);
    }, frame.durationMs);
    return () => window.clearTimeout(timer);
  }, [activeTab, activeTag?.direction, activeTag?.repeat, isPlaying, pixelDocument, preferences.timeline.rewindOnStop, revision]);

  const openDocumentTab = useCallback((document: PixelDocument, statusMessage: string, requestedTabID?: string, filePath?: string, isDirty = false) => {
    if (filePath) {
      const pathKey = projectPathKey(filePath);
      const existing = tabs.find((candidate) => candidate.filePath && projectPathKey(candidate.filePath) === pathKey);
      if (existing) {
        existing.status = statusMessage;
        setActiveTabID(existing.id);
        setRenamingLayerId(null);
        setIsPlaying(false);
        invalidate();
        return existing.id;
      }
    }
    const tabID = requestedTabID && !tabs.some((candidate) => candidate.id === requestedTabID) ? requestedTabID : undefined;
    const tab = createEditorTab(document, tabID, filePath, isDirty);
    tab.status = statusMessage;
    tabs.push(tab);
    setActiveTabID(tab.id);
    setRenamingLayerId(null);
    setIsPlaying(false);
    invalidate();
    return tab.id;
  }, [invalidate, tabs]);

  const replaceInitialTab = useCallback((document: PixelDocument, statusMessage: string, requestedTabID?: string, filePath?: string, isDirty = false) => {
    if (tabs.length === 0) return openDocumentTab(document, statusMessage, requestedTabID, filePath, isDirty);
    const currentTabID = tabs[0].id;
    const tabID = requestedTabID && (requestedTabID === currentTabID || !tabs.some((candidate) => candidate.id === requestedTabID))
      ? requestedTabID
      : currentTabID;
    Object.assign(tabs[0], createEditorTab(document, tabID, filePath, isDirty), {id: tabID, status: statusMessage});
    setActiveTabID(tabs[0].id);
    invalidate();
    return tabs[0].id;
  }, [invalidate, openDocumentTab, tabs]);

  const restoreRecoveryTabs = useCallback((payload: string) => {
    const snapshot = decodeRecoveryPayload(payload);
    if (snapshot.documents.length === 0) return;
    const first = snapshot.documents[0];
    const restoredTabIDs = [replaceInitialTab(first.document, `Recovered ${first.document.name}`, first.tabId || undefined, first.filePath, true)];
    for (const recovered of snapshot.documents.slice(1)) {
      const restoredTabID = openDocumentTab(recovered.document, `Recovered ${recovered.document.name}`, recovered.tabId || undefined, recovered.filePath, true);
      restoredTabIDs.push(restoredTabID);
    }
    const activeIndex = snapshot.activeTabId
      ? snapshot.documents.findIndex((recovered) => recovered.tabId === snapshot.activeTabId)
      : -1;
    setActiveTabID(restoredTabIDs[activeIndex >= 0 ? activeIndex : 0]);
    setRenamingLayerId(null);
    setIsPlaying(false);
    invalidate();
  }, [invalidate, openDocumentTab, replaceInitialTab, tabs]);

  const closeTab = useCallback((tab: EditorTab) => {
    if (preferences.alerts.closeUnsaved && tab.history.isDirty && !window.confirm(labels[language].closeUnsaved(displayProjectName(tab.document.name)))) return;
    const index = tabs.indexOf(tab);
    tabs.splice(index, 1);
    if (tab.id === activeTabID) setActiveTabID(tabs[Math.max(0, index - 1)]?.id ?? "");
    setRenamingLayerId(null);
    setIsPlaying(false);
    invalidate();
    if (recoveryReady && hasWailsAppBridge()) void syncRecoverySnapshot().catch(() => undefined);
  }, [activeTabID, invalidate, language, preferences.alerts.closeUnsaved, recoveryReady, syncRecoverySnapshot, tabs]);

  useEffect(() => {
    const confirmExit = (event: BeforeUnloadEvent) => {
      if (!preferences.alerts.closeUnsaved || !tabs.some((tab) => tab.history.isDirty)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmExit);
    return () => window.removeEventListener("beforeunload", confirmExit);
  }, [preferences.alerts.closeUnsaved, tabs]);

  useEffect(() => {
    setPreferences((current) => ({
      ...current,
      general: {...current.general, theme: lightTheme ? "light" : "dark", language},
      files: {...current.files, autosaveSeconds},
      grid: {...current.grid, showPixelGrid},
      undo: {...current.undo, memoryLimitMB: historyLimitMB},
      drawing: {...current.drawing, pixelPerfect, pressure: pressureEnabled, brushDynamics: brushDynamicsEnabled},
    }));
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [autosaveSeconds, brushDynamicsEnabled, historyLimitMB, language, lightTheme, pixelPerfect, pressureEnabled, showPixelGrid]);
  useEffect(() => { savePreferences(localStorage, preferences); }, [preferences]);
  useEffect(() => { localStorage.setItem("pixtorio-recent", JSON.stringify(recentProjects)); }, [recentProjects]);
  useEffect(() => {
    setRecentProjects((projects) => projects.length <= preferences.files.recentItems ? projects : projects.slice(0, preferences.files.recentItems));
  }, [preferences.files.recentItems]);
  useEffect(() => { localStorage.setItem("pixtorio-inspector-width", String(inspectorWidth)); }, [inspectorWidth]);
  useEffect(() => { localStorage.setItem("pixtorio-timeline-height", String(timelineHeight)); }, [timelineHeight]);
  useEffect(() => {
    saveWorkspaceVisibility(localStorage, {inspectorVisible, timelineVisible});
  }, [inspectorVisible, timelineVisible]);
  useEffect(() => {
    saveWorkspaceCanvasOnly(localStorage, canvasOnly);
  }, [canvasOnly]);
  useEffect(() => {
    let disposed = false;
    const sync = () => {
      if (hasWailsRuntimeBridge()) {
        void WindowIsFullscreen().then((value) => {
          if (!disposed) setIsFullscreen(value);
        }).catch(() => undefined);
      } else {
        setIsFullscreen(typeof document !== "undefined" && Boolean(document.fullscreenElement));
      }
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => {
      disposed = true;
      document.removeEventListener("fullscreenchange", sync);
    };
  }, []);
  useEffect(() => {
    const previousSize = previousBrushSizeRef.current;
    previousBrushSizeRef.current = brushSize;
    if (previousSize === brushSize) return;
    setBrushDynamics((current) => current.size.max === previousSize
      ? {...current, size: {...current.size, min: Math.min(current.size.min, brushSize), max: brushSize}}
      : current);
  }, [brushSize]);
  useEffect(() => {
    const bytes = Math.round(historyLimitMB) * 1024 * 1024;
    for (const tab of tabs) tab.history.setMaxBytes(bytes);
  }, [historyLimitMB, tabs]);
  useEffect(() => { localStorage.setItem("pixtorio-tool-shortcuts", JSON.stringify(shortcutAssignments)); }, [shortcutAssignments]);
  useEffect(() => { localStorage.setItem("pixtorio-command-shortcuts", JSON.stringify(commandShortcutAssignments)); }, [commandShortcutAssignments]);

  useEffect(() => {
    if (!hasWailsAppBridge() || recoveryStartedRef.current) return;
    // Startup recovery must not repeat when status or active-tab callbacks change.
    recoveryStartedRef.current = true;
    void (async () => {
      const payload = preferences.files.autosaveEnabled ? await LoadRecovery() : "";
      let restoredRecovery = false;
      if (payload) {
        if (window.confirm(labels[initialLanguageRef.current].restoreRecovery)) {
          restoreRecoveryTabs(payload);
          restoredRecovery = true;
        }
        else await ClearRecovery();
      }
      const startupPayload = await OpenStartupProject();
      if (startupPayload) {
        const opened = parseProjectResponse(startupPayload);
        const decoded = decodeProject(opened.document);
        if (restoredRecovery) openDocumentTab(decoded, `Opened ${decoded.name}`, undefined, opened.path);
        else replaceInitialTab(decoded, `Opened ${decoded.name}`, undefined, opened.path);
        setRecentProjects((projects) => [opened.path, ...projects.filter((candidate) => projectPathKey(candidate) !== projectPathKey(opened.path))].slice(0, preferences.files.recentItems));
      }
    })().catch((error) => {
      setStatus(error instanceof Error ? error.message : "Open failed");
    }).finally(() => setRecoveryReady(true));
  }, [openDocumentTab, replaceInitialTab, restoreRecoveryTabs, setStatus]);

  useEffect(() => {
    if (!preferences.files.autosaveEnabled || !recoveryReady || !hasWailsAppBridge()) return;
    const timer = window.setInterval(() => {
      if (tabs.some((tab) => tab.history.isDirty)) void syncRecoverySnapshot().catch(() => undefined);
    }, autosaveSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [autosaveSeconds, preferences.files.autosaveEnabled, recoveryReady, syncRecoverySnapshot, tabs]);

  const previousDirtyTabIDsRef = useRef<string[]>([]);
  useEffect(() => {
    if (!preferences.files.autosaveEnabled || !recoveryReady || !hasWailsAppBridge()) return;
    const dirtyTabIDs = tabs.filter((tab) => tab.history.isDirty).map((tab) => tab.id);
    const dirtySetShrank = previousDirtyTabIDsRef.current.some((tabID) => !dirtyTabIDs.includes(tabID));
    previousDirtyTabIDsRef.current = dirtyTabIDs;
    if (dirtySetShrank) void syncRecoverySnapshot().catch(() => undefined);
  }, [preferences.files.autosaveEnabled, recoveryReady, revision, syncRecoverySnapshot, tabs]);

  const rememberProject = useCallback((path: string) => {
    const key = projectPathKey(path);
    setRecentProjects((projects) => [path, ...projects.filter((candidate) => projectPathKey(candidate) !== key)].slice(0, preferences.files.recentItems));
  }, [preferences.files.recentItems]);

  useEffect(() => {
    if (!isFileMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!fileMenuRef.current?.contains(event.target as Node)
        && !isMenuSurfaceTarget(event.target, [fileMenuPopoverRef, recentProjectsMenuRef])) {
        setIsFileMenuOpen(false);
        setIsRecentProjectsMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isFileMenuOpen]);

  useEffect(() => {
    if (!isFileMenuOpen || recentProjects.length === 0) setIsRecentProjectsMenuOpen(false);
  }, [isFileMenuOpen, recentProjects.length]);

  useEffect(() => {
    if (!isEditMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!editMenuRef.current?.contains(event.target as Node)
        && !isMenuSurfaceTarget(event.target, [editMenuPopoverRef, pasteSpecialMenuRef, shiftPixelsMenuRef])) {
        setIsEditMenuOpen(false);
        setIsPasteSpecialMenuOpen(false);
        setIsShiftPixelsMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isEditMenuOpen]);

  useEffect(() => {
    if (!isSpriteMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!spriteMenuRef.current?.contains(event.target as Node)
        && !isMenuSurfaceTarget(event.target, [spriteMenuPopoverRef, imageEffectsMenuRef])) {
        setIsSpriteMenuOpen(false);
        setIsImageEffectsMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isSpriteMenuOpen]);

  useEffect(() => {
    if (!isViewMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!viewMenuRef.current?.contains(event.target as Node)
        && !isMenuSurfaceTarget(event.target, [viewMenuPopoverRef])) setIsViewMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isViewMenuOpen]);

  const previousTimelineStructureRef = useRef({tabID: activeTab.id, layers: pixelDocument.layers.length, frames: pixelDocument.frames.length});
  useEffect(() => {
    const previous = previousTimelineStructureRef.current;
    const current = timelineStructure(activeTab.id, pixelDocument.layers.length, pixelDocument.frames.length);
    if (shouldAutoShowTimeline(previous, current, preferences.timeline.autoShow)) {
      setTimelineVisible(true);
    }
    previousTimelineStructureRef.current = current;
  }, [activeTab.id, pixelDocument.frames.length, pixelDocument.layers.length, preferences.timeline.autoShow, revision]);

  useEffect(() => {
    if (!isPaletteMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!paletteMenuRef.current?.contains(event.target as Node)) setIsPaletteMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isPaletteMenuOpen]);

  useEffect(() => {
    if (!openToolGroupID) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!toolGroupMenuRef.current?.contains(event.target as Node)) setOpenToolGroupID(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenToolGroupID(null);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openToolGroupID]);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const scale = Math.max(0.01, preferences.general.uiScale / 100);
    const bounds = contextMenuRef.current.getBoundingClientRect();
    const maximumLeft = Math.max(8, window.innerWidth / scale - bounds.width / scale - 8);
    const maximumTop = Math.max(8, window.innerHeight / scale - bounds.height / scale - 8);
    const left = Math.max(8, Math.min(maximumLeft, contextMenu.left));
    const top = Math.max(8, Math.min(maximumTop, contextMenu.top));
    if (left !== contextMenu.left || top !== contextMenu.top) {
      setContextMenu((current) => current ? {...current, left, top} : current);
    }
  }, [contextMenu, preferences.general.uiScale]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenu(null);
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnKey);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  const updateTabScrollState = useCallback(() => {
    const container = documentTabsRef.current;
    if (!container) return;
    const hasOverflow = container.scrollWidth > container.clientWidth + 1;
    const canGoForward = container.scrollLeft + container.clientWidth < container.scrollWidth - 1;
    const canGoBack = container.scrollLeft > 1;
    setTabScrollState((current) => current.hasOverflow === hasOverflow && current.canGoBack === canGoBack && current.canGoForward === canGoForward
      ? current
      : {hasOverflow, canGoBack, canGoForward});
  }, []);

  useEffect(() => {
    const container = documentTabsRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateTabScrollState);
    observer.observe(container);
    container.addEventListener("scroll", updateTabScrollState, {passive: true});
    updateTabScrollState();
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", updateTabScrollState);
    };
  }, [revision, tabs.length, updateTabScrollState]);

  useEffect(() => {
    const selectedTab = documentTabsRef.current?.querySelector<HTMLElement>("[role=tab][aria-selected=true]");
    selectedTab?.scrollIntoView({block: "nearest", inline: "nearest", behavior: "smooth"});
  }, [activeTabID]);

  const ensureActiveCelForEdit = useCallback(() => {
    if (!canEditPixels) return null;
    const existing = getCel(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId);
    if (existing) return existing.pixels;
    emptyCelBeforeRef.current = cloneDocument(pixelDocument);
    const created = ensureCel(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId);
    if (!created) {
      emptyCelBeforeRef.current = null;
      return null;
    }
    activeTab.compositeCache.clear();
    touchTabThumbnailCels(activeTab, [created.id]);
    return created.pixels;
  }, [activeTab, canEditPixels, pixelDocument]);

  const commitEdit = useCallback((before: Uint8ClampedArray) => {
    const cel = getCel(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId);
    if (!cel || !canEditPixels) return;
    syncIndexedCel(pixelDocument, cel);
    const patch = createPatch(before, cel.pixels, cel.width, cel.height);
    const documentBefore = emptyCelBeforeRef.current;
    emptyCelBeforeRef.current = null;
    if (!patch) {
      if (documentBefore) deleteCel(pixelDocument, cel.layerId, cel.frameId);
      return;
    }
    if (documentBefore) {
      history.commit(new EditorDocumentStateCommand(
        documentBefore,
        pixelDocument,
        labels.en.toolsByID[selectedTool],
        activeTab,
        captureTabTimeline(activeTab),
        captureTabTimeline(activeTab),
      ));
    } else {
      history.commit(new PixelEditCommand(cel.id, patch, labels.en.toolsByID[selectedTool]));
    }
  }, [activeTab, canEditPixels, history, pixelDocument, selectedTool]);

  const commitPixelMutation = useCallback((label: string, mutation: () => void) => {
    if (!canEditPixels) return false;
    const pixels = ensureActiveCelForEdit();
    const cel = getCel(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId);
    if (!pixels || !cel) return false;
    const before = cel.pixels.slice();
    mutation();
    syncIndexedCel(pixelDocument, cel);
    const patch = createPatch(before, cel.pixels, cel.width, cel.height);
    const documentBefore = emptyCelBeforeRef.current;
    emptyCelBeforeRef.current = null;
    if (!patch) {
      if (documentBefore) deleteCel(pixelDocument, cel.layerId, cel.frameId);
      return false;
    }
    if (documentBefore) history.commit(new DocumentStateCommand(documentBefore, pixelDocument, label));
    else history.commit(new PixelEditCommand(cel.id, patch, label));
    setStatus(label);
    invalidatePixels(patch);
    return true;
  }, [canEditPixels, ensureActiveCelForEdit, history, invalidatePixels, pixelDocument, setStatus]);

  const mutateDocument = useCallback((label: string, mutation: () => boolean) => {
    if (!hasOpenDocument) return false;
    if (isPlaying) {
      setStatus("Pause playback to edit");
      return false;
    }
    const before = cloneDocument(pixelDocument);
    const beforeTimeline = captureTabTimeline(activeTab);
    if (!mutation()) return false;
    activeTab.compositeCache.clear();
    touchAllTabThumbnails(activeTab);
    normalizeTabTimeline(activeTab);
    history.commit(new EditorDocumentStateCommand(
      before,
      pixelDocument,
      label,
      activeTab,
      beforeTimeline,
      captureTabTimeline(activeTab),
    ));
    setStatus(label);
    invalidate();
    return true;
  }, [activeTab, hasOpenDocument, history, invalidate, isPlaying, pixelDocument, setStatus]);

  const undo = useCallback(() => {
    if (isPlaying) {
      setStatus("Pause playback to edit");
      return;
    }
    const command = history.undo(pixelDocument);
    if (!command) return;
    if (preferences.undo.goToModified && command instanceof PixelEditCommand) {
      const cel = Object.values(pixelDocument.cels).find((candidate) => candidate.id === command.celId);
      if (cel) {
        pixelDocument.activeLayerId = cel.layerId;
        pixelDocument.activeFrameId = cel.frameId;
      }
    }
    activeTab.compositeCache.clear();
    if (command instanceof PixelEditCommand) touchTabThumbnailCels(activeTab, [command.celId]);
    else touchAllTabThumbnails(activeTab);
    normalizeTabTimeline(activeTab, true);
    setRenamingLayerId(null);
    setStatus(`Undid ${command.label}`);
    invalidate();
  }, [activeTab, history, invalidate, isPlaying, pixelDocument, preferences.undo.goToModified, setStatus]);

  const redo = useCallback(() => {
    if (isPlaying) {
      setStatus("Pause playback to edit");
      return;
    }
    const command = history.redo(pixelDocument);
    if (!command) return;
    if (preferences.undo.goToModified && command instanceof PixelEditCommand) {
      const cel = Object.values(pixelDocument.cels).find((candidate) => candidate.id === command.celId);
      if (cel) {
        pixelDocument.activeLayerId = cel.layerId;
        pixelDocument.activeFrameId = cel.frameId;
      }
    }
    activeTab.compositeCache.clear();
    if (command instanceof PixelEditCommand) touchTabThumbnailCels(activeTab, [command.celId]);
    else touchAllTabThumbnails(activeTab);
    normalizeTabTimeline(activeTab, true);
    setRenamingLayerId(null);
    setStatus(`Redid ${command.label}`);
    invalidate();
  }, [activeTab, history, invalidate, isPlaying, pixelDocument, preferences.undo.goToModified, setStatus]);

  const jumpToHistoryState = useCallback((stateID: number) => {
    if (isPlaying || stateID === history.stateID) return;
    history.jumpTo(pixelDocument, stateID);
    activeTab.compositeCache.clear();
    touchAllTabThumbnails(activeTab);
    normalizeTabTimeline(activeTab, true);
    setRenamingLayerId(null);
    setStatus("History state restored");
    invalidate();
  }, [activeTab, history, invalidate, isPlaying, pixelDocument, setStatus]);

  mcpHandlerRef.current = (name, args) => handleMCPWorkspaceCommand({
    tabs,
    activeDocumentId: activeTabID || tabs[0]?.id || "",
    assertIdle: () => {
      const focused = document.activeElement;
      if (!recoveryReady || isPlaying || celPropertiesDialog || canvasDialog || layerPropertiesDialog || slicePropertiesDialog || exportDialog || tagDialog || crossDocumentCopyDialog || adjustmentDialog || spriteImportDialog || settingsOpen || historyOpen || opacityBeforeRef.current
        || saveQueuesRef.current.size > 0 || mcpInteractionGuardRef.current?.()
        || focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement
        || (focused instanceof HTMLElement && focused.isContentEditable)) {
        throw new Error("Editor is busy; finish the gesture, text edit or dialog and pause playback before using MCP");
      }
    },
    open: (doc, path, dirty) => {
      const id = openDocumentTab(doc, `Opened ${doc.name}`, undefined, path, dirty);
      if (path) rememberProject(path);
      return tabs.find((tab) => tab.id === id)!;
    },
    activate: (tab) => { setActiveTabID(tab.id); setRenamingLayerId(null); invalidate(); },
    close: (tab) => {
      const index = tabs.indexOf(tab as EditorTab);
      tabs.splice(index, 1);
      if (tab.id === activeTab.id) setActiveTabID(tabs[Math.max(0, index - 1)]?.id ?? "");
      invalidate();
    },
    edited: (value: MCPWorkspaceTab) => {
      const tab = value as EditorTab;
      tab.selection = null;
      tab.lastSelection = null;
      tab.compositeCache.clear();
      touchAllTabThumbnails(tab);
      normalizeTabTimeline(tab, true);
      setRenamingLayerId(null);
      invalidate();
    },
    saved: (value: MCPWorkspaceTab) => {
      const tab = value as EditorTab;
      tab.status = `Saved ${tab.filePath}`;
      rememberProject(tab.filePath!);
      void syncRecoverySnapshot().catch(() => undefined);
      invalidate();
    },
  }, name, args);

  useEffect(() => {
    if (!hasWailsAppBridge() || !recoveryReady) return;
    const unsubscribe = EventsOn("pixtorio:mcp", (request: {id: string; name: string; args: unknown}) => {
      void (async () => {
        if (!await ClaimMCPCommand(request.id)) return;
        let result = "null";
        let message = "";
        try { flushSync(() => { result = JSON.stringify(mcpHandlerRef.current(request.name, request.args)); }); }
        catch (error) { message = error instanceof Error ? error.message : String(error); }
        await CompleteMCPCommand(request.id, result, message);
      })().catch((error) => console.error("MCP bridge", error));
    });
    void SetMCPReady(true);
    return () => { unsubscribe(); void SetMCPReady(false); };
  }, [recoveryReady]);

  const exportPNG = useCallback(async (applyPixelRatio = false) => {
    setStatus("Exporting...");
    try {
      const pixels = compositeFrameForExport(pixelDocument);
      const browserPixels = applyPixelRatio
        ? applyPixelAspectRatio(pixelDocument.width, pixelDocument.height, pixels, pixelDocument.pixelAspectRatio)
        : {width: pixelDocument.width, height: pixelDocument.height, pixels};
      if (!hasWailsAppBridge()) {
        downloadBlob(await browserPNGBlob(browserPixels.width, browserPixels.height, browserPixels.pixels), `${displayProjectName(pixelDocument.name).replace(/\.pixio$/i, "")}.png`);
        setStatus("Exported PNG");
        return;
      }
      const path = await SavePNGWithOptions(pixelDocument.width, pixelDocument.height, bytesToBase64(pixels), applyPixelRatio, pixelDocument.pixelAspectRatio.width, pixelDocument.pixelAspectRatio.height, language);
      setStatus(path ? `Exported ${path.split(/[\\/]/).pop()}` : "Export cancelled");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed");
    }
  }, [language, pixelDocument]);

  const resolvedExportFrameIDs = useCallback(() => {
    const range = exportFrameRange === "selected"
      ? pixelDocument.frames.filter((frame) => selectedFrameIds.includes(frame.id)).map((frame) => frame.id)
      : exportFrameRange === "loop"
        ? frameIDsInRange(pixelDocument, activeTab.loopStartFrameId, activeTab.loopEndFrameId)
        : pixelDocument.frames.map((frame) => frame.id);
    return orderFrameIDs(range.length > 0 ? range : [pixelDocument.activeFrameId], exportDirection);
  }, [activeTab.loopEndFrameId, activeTab.loopStartFrameId, exportDirection, exportFrameRange, pixelDocument, selectedFrameIds]);

  const exportPNGSequence = useCallback(async () => {
    setStatus("Exporting PNG sequence...");
    try {
      const frameIds = resolvedExportFrameIDs();
      const frames = frameIds.map((frameId) => compositeFrameForExport(pixelDocument, frameId));
      const stem = displayProjectName(pixelDocument.name).replace(/\.pixio$/i, "") || "frame";
      if (hasWailsAppBridge()) {
        const directory = await SavePNGSequence(pixelDocument.width, pixelDocument.height, frames.map(bytesToBase64), stem, language);
        setStatus(directory ? `Exported ${frames.length} PNG frames` : "Export cancelled");
      } else {
        const digits = Math.max(3, String(frames.length).length);
        for (let index = 0; index < frames.length; index += 1) {
          downloadBlob(await browserPNGBlob(pixelDocument.width, pixelDocument.height, frames[index]), `${stem}-${String(index + 1).padStart(digits, "0")}.png`);
        }
        setStatus(`Exported ${frames.length} PNG frames`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sequence export failed");
    }
  }, [language, pixelDocument, resolvedExportFrameIDs, setStatus]);

  const exportAnimation = useCallback(async (kind: ExportKind) => {
    setStatus(`Exporting ${kind === "png" ? "PNG" : kind === "gif" ? "GIF" : "sprite sheet"}...`);
    try {
      if (kind === "png") {
        await exportPNG(exportApplyPixelRatio);
        setExportDialog(null);
        return;
      }
      const frameIds = resolvedExportFrameIDs();
      const frames = frameIds.map((frameId) => bytesToBase64(compositeFrameForExport(pixelDocument, frameId)));
      const rawFrames = frameIds.map((frameId) => compositeFrameForExport(pixelDocument, frameId));
      const browserFrameSize = exportApplyPixelRatio
        ? applyPixelAspectRatio(pixelDocument.width, pixelDocument.height, rawFrames[0], pixelDocument.pixelAspectRatio)
        : {width: pixelDocument.width, height: pixelDocument.height};
      const browserFrames = exportApplyPixelRatio
        ? rawFrames.map((frame) => applyPixelAspectRatio(pixelDocument.width, pixelDocument.height, frame, pixelDocument.pixelAspectRatio).pixels)
        : rawFrames;
      const loopCount = gifLoopMode === "once" ? -1 : gifLoopMode === "forever" ? 0 : Math.max(1, Math.min(65535, Math.round(gifLoopCount)));
      const stem = displayProjectName(pixelDocument.name).replace(/\.pixio$/i, "");
      if (kind === "sheet" && sheetSplitBy !== "none") {
        const safeName = (value: string) => value.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "part";
        const groups = sheetSplitBy === "tag"
          ? pixelDocument.tags.map((tag) => ({
            name: tag.name,
            frameIds: frameIDsInRange(pixelDocument, tag.fromFrameId, tag.toFrameId),
            document: pixelDocument,
          }))
          : pixelDocument.layers.filter(isImageLayer).map((layer) => {
            const isolated = cloneDocument(pixelDocument);
            for (const candidate of isolated.layers) candidate.visible = candidate.id === layer.id || candidate.kind === "group";
            return {name: layer.name, frameIds, document: isolated};
          });
        for (const group of groups) {
          if (group.frameIds.length === 0) continue;
          const groupFrames = group.frameIds.map((frameId) => compositeFrameForExport(group.document, frameId));
          const name = `${stem}-${safeName(group.name)}-sheet`;
          const browserGroupFrames = exportApplyPixelRatio
            ? groupFrames.map((frame) => applyPixelAspectRatio(pixelDocument.width, pixelDocument.height, frame, pixelDocument.pixelAspectRatio).pixels)
            : groupFrames;
          const sheet = buildSpriteSheet(browserGroupFrames, browserFrameSize.width, browserFrameSize.height, {
            layout: sheetLayout,
            columns: sheetColumns,
            scale: exportScale,
            borderPadding: sheetBorderPadding,
            framePadding: sheetFramePadding,
          });
          const metadata = exportSpriteSheetMetadata(group.document, group.frameIds, sheet, `${name}.png`, {applyPixelRatio: exportApplyPixelRatio});
          const metadataJSON = sheetAtlasJSON ? JSON.stringify(metadata, null, 2) : "";
          if (hasWailsAppBridge()) {
            const path = await SavePackedAtlas(sheet.width, sheet.height, bytesToBase64(sheet.pixels), metadataJSON, sheetAtlasJSON, language);
            if (!path) return;
          } else {
            downloadBlob(await browserPNGBlob(sheet.width, sheet.height, sheet.pixels), `${name}.png`);
            if (sheetAtlasJSON) downloadBlob(new Blob([metadataJSON], {type: "application/json"}), `${name}.json`);
          }
        }
        setStatus(`Exported ${sheetSplitBy} sprite sheets`);
        setExportDialog(null);
        return;
      }
      if (kind === "sheet" && sheetPacked) {
        const atlasFrames = exportApplyPixelRatio ? browserFrames : rawFrames;
        const atlasWidth = browserFrameSize.width;
        const atlasHeight = browserFrameSize.height;
        const atlas = packAtlas(
          atlasFrames,
          atlasWidth,
          atlasHeight,
          frameIds,
          frameIds.map((frameId) => pixelDocument.frames.find((frame) => frame.id === frameId)?.durationMs ?? 100),
          sheetFramePadding,
        );
        const atlasMetadata = exportAtlasMetadata(pixelDocument, frameIds, atlas, `${stem}-atlas.png`, {applyPixelRatio: exportApplyPixelRatio});
        const atlasJSON = sheetAtlasJSON ? JSON.stringify(atlasMetadata, null, 2) : "";
        if (!hasWailsAppBridge()) {
          downloadBlob(await browserPNGBlob(atlas.width, atlas.height, atlas.pixels), `${stem}-atlas.png`);
          if (sheetAtlasJSON) downloadBlob(new Blob([atlasJSON], {type: "application/json"}), `${stem}-atlas.json`);
        } else {
          const path = await SavePackedAtlas(atlas.width, atlas.height, bytesToBase64(atlas.pixels), atlasJSON, sheetAtlasJSON, language);
          setStatus(path ? `Exported ${path.split(/[\\/]/).pop()}` : "Export cancelled");
          if (!path) return;
        }
        if (!hasWailsAppBridge()) setStatus("Exported packed atlas");
        setExportDialog(null);
        return;
      }
      if (!hasWailsAppBridge()) {
        if (kind === "gif") {
          downloadBlob(browserGIFBlob(browserFrameSize.width, browserFrameSize.height, browserFrames, frameIds.map((frameId) => pixelDocument.frames.find((frame) => frame.id === frameId)?.durationMs ?? 100), loopCount, exportScale), `${stem}.gif`);
        } else {
          const sheet = buildSpriteSheet(browserFrames, browserFrameSize.width, browserFrameSize.height, {
            layout: sheetLayout,
            columns: sheetColumns,
            scale: exportScale,
            borderPadding: sheetBorderPadding,
            framePadding: sheetFramePadding,
          });
          const image = `${stem}-sheet.png`;
          downloadBlob(await browserPNGBlob(sheet.width, sheet.height, sheet.pixels), image);
          if (sheetAtlasJSON) {
            const metadata = exportSpriteSheetMetadata(pixelDocument, frameIds, sheet, image, {applyPixelRatio: exportApplyPixelRatio});
            downloadBlob(new Blob([JSON.stringify(metadata, null, 2)], {type: "application/json"}), `${stem}-sheet.json`);
          }
        }
        setStatus(`Exported ${kind === "gif" ? "GIF" : "sprite sheet"}`);
        setExportDialog(null);
        return;
      }
      const path = kind === "gif"
        ? await SaveGIFWithOptions(
          pixelDocument.width,
          pixelDocument.height,
          frames,
          frameIds.map((frameId) => pixelDocument.frames.find((frame) => frame.id === frameId)?.durationMs ?? 100),
          exportScale,
          loopCount,
          exportApplyPixelRatio,
          pixelDocument.pixelAspectRatio.width,
          pixelDocument.pixelAspectRatio.height,
          language,
        )
        : await (async () => {
          const sheet = buildSpriteSheet(browserFrames, browserFrameSize.width, browserFrameSize.height, {
            layout: sheetLayout,
            columns: sheetColumns,
            scale: exportScale,
            borderPadding: sheetBorderPadding,
            framePadding: sheetFramePadding,
          });
          const metadata = exportSpriteSheetMetadata(pixelDocument, frameIds, sheet, `${stem}-sheet.png`, {applyPixelRatio: exportApplyPixelRatio});
          return SavePackedAtlas(sheet.width, sheet.height, bytesToBase64(sheet.pixels), sheetAtlasJSON ? JSON.stringify(metadata, null, 2) : "", sheetAtlasJSON, language);
        })();
      setStatus(path ? `Exported ${path.split(/[\\/]/).pop()}` : "Export cancelled");
      if (path) setExportDialog(null);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Export failed"); }
  }, [exportApplyPixelRatio, exportPNG, exportScale, gifLoopCount, gifLoopMode, language, pixelDocument, resolvedExportFrameIDs, sheetAtlasJSON, sheetBorderPadding, sheetColumns, sheetFramePadding, sheetLayout, sheetPacked, sheetSplitBy]);

  const savePixio = useCallback((saveAs = false) => {
    const tab = activeTab;
    const documentSnapshot = cloneDocument(tab.document);
    const historyAtRequest = tab.history;
    const savedStateID = historyAtRequest.stateID;
    if (!hasWailsAppBridge()) {
      void (async () => {
        try {
          const filename = displayProjectName(documentSnapshot.name).replace(/\.pixio$/i, "") + ".pixio";
          downloadBlob(await webEncodePixio(encodeProject(documentSnapshot)), filename);
          historyAtRequest.markSaved(savedStateID);
          setStatus(`Saved ${filename}`);
          invalidate();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Save failed");
        }
      })();
      return;
    }
    tab.status = "Saving project...";
    invalidate();

    return enqueueSerialTask(saveQueuesRef.current, tab.id, async () => {
      try {
        const path = tab.filePath && !saveAs
          ? await SavePixioPath(tab.filePath, encodeProject(documentSnapshot))
          : await SavePixio(
            encodeProject(documentSnapshot),
            language,
            tabs.filter((candidate) => candidate !== tab && candidate.filePath).map((candidate) => candidate.filePath!),
          );
        if (!path) {
          if (tabs.includes(tab) && tab.history === historyAtRequest) tab.status = "Save cancelled";
          return;
        }

        const filename = path.split(/[\\/]/).pop();
        if (filename && documentSnapshot.name !== filename) {
          documentSnapshot.name = filename;
          await SavePixioPath(path, encodeProject(documentSnapshot));
        }

        if (!tabs.includes(tab) || tab.history !== historyAtRequest) return;
        tab.filePath = path;
        if (filename) tab.document.name = filename;
        historyAtRequest.markSaved(savedStateID);
        void syncRecoverySnapshot().catch(() => undefined);
        rememberProject(path);
        tab.status = `Saved ${filename ?? path}`;
        invalidate();
      } catch (error) {
        if (tabs.includes(tab) && tab.history === historyAtRequest) {
          tab.status = error instanceof Error ? error.message : "Save failed";
          invalidate();
        }
      }
    });
  }, [activeTab, invalidate, language, rememberProject, syncRecoverySnapshot, tabs]);

  const newDocument = useCallback(() => {
    setCanvasWidthDraft(64);
    setCanvasHeightDraft(64);
    setNewDocumentColorMode(preferences.color.defaultColorMode);
    setNewDocumentBackground(preferences.background.defaultFill);
    setCanvasSizeError(false);
    setCanvasDialog("new");
  }, [preferences.background.defaultFill, preferences.color.defaultColorMode]);

  const openResizeDialog = () => {
    setCanvasWidthDraft(pixelDocument.width);
    setCanvasHeightDraft(pixelDocument.height);
    setHorizontalAnchor("center");
    setVerticalAnchor("center");
    setCanvasSizeError(false);
    setCanvasDialog("resize");
  };

  const openSpriteSizeDialog = () => {
    setCanvasWidthDraft(pixelDocument.width);
    setCanvasHeightDraft(pixelDocument.height);
    setCanvasSizeError(false);
    setCanvasDialog("sprite-size");
  };

  const duplicateCurrentSprite = () => {
    const sourceName = pixelDocument.name.trim() || (language === "zh" ? "未命名.pixio" : "untitled.pixio");
    const extension = /\.pixio$/i.test(sourceName) ? ".pixio" : "";
    const stem = sourceName.replace(/\.pixio$/i, "") || (language === "zh" ? "未命名" : "untitled");
    const copyLabel = language === "zh" ? "副本" : "copy";
    const existingNames = new Set(tabs.map((tab) => displayProjectName(tab.document.name).toLocaleLowerCase("en-US")));
    let name = `${stem} ${copyLabel}${extension}`;
    let suffix = 2;
    while (existingNames.has(displayProjectName(name).toLocaleLowerCase("en-US"))) name = `${stem} ${copyLabel} ${suffix++}${extension}`;
    openDocumentTab(
      duplicateDocument(pixelDocument, name),
      language === "zh" ? `已复制 ${displayProjectName(sourceName)}` : `Duplicated ${displayProjectName(sourceName)}`,
      undefined,
      undefined,
      true,
    );
  };

  const newDocumentFromSelection = () => {
    if (!selection || !activeCel) return;
    const clipboard = copySelection(activeCel.pixels, activeCel.width, selection);
    const document = createBlankDocument(language, clipboard.width, clipboard.height, pixelDocument.colorMode, preferences);
    const cel = getActiveCel(document);
    cel.pixels.set(clipboard.pixels);
    if (document.colorMode === "indexed") syncIndexedCel(document, cel);
    openDocumentTab(document, language === "zh" ? "已从选区创建项目" : "Created project from selection", undefined, undefined, true);
  };

  const applyCanvasDialog = () => {
    if (!Number.isInteger(canvasWidthDraft) || !Number.isInteger(canvasHeightDraft) || canvasWidthDraft < 1 || canvasHeightDraft < 1 || canvasWidthDraft > 2048 || canvasHeightDraft > 2048) {
      setCanvasSizeError(true);
      return;
    }
    if (canvasDialog === "new") {
      const document = createBlankDocument(language, canvasWidthDraft, canvasHeightDraft, newDocumentColorMode, preferences);
      if (newDocumentBackground !== "transparent") {
        const fill = newDocumentBackground === "foreground" ? foregroundRGBA : backgroundRGBA;
        const cel = getActiveCel(document);
        for (let offset = 0; offset < cel.pixels.length; offset += 4) cel.pixels.set(fill, offset);
        document.layers[0].role = "background";
        if (document.colorMode === "indexed") syncIndexedCel(document, cel);
      }
      openDocumentTab(document, "New project", undefined, undefined, true);
      setCanvasDialog(null);
      return;
    }
    if (canvasDialog === "resize") {
      if (mutateDocument("Resize Canvas", () => resizeDocument(pixelDocument, canvasWidthDraft, canvasHeightDraft, horizontalAnchor, verticalAnchor))) {
        setSelection(null);
      }
      setCanvasDialog(null);
      return;
    }
    if (canvasDialog === "sprite-size") {
      mutateDocument("Resize Sprite", () => resizeSpriteContent(pixelDocument, canvasWidthDraft, canvasHeightDraft));
      setSelection(null);
      setCanvasDialog(null);
    }
  };

  const openColorProfileDialog = () => {
    setColorProfileTarget(pixelDocument.colorProfile.type === "display-p3" ? "display-p3" : "srgb");
    setPixelAspectWidthDraft(pixelDocument.pixelAspectRatio.width);
    setPixelAspectHeightDraft(pixelDocument.pixelAspectRatio.height);
    setColorProfileAction("assign");
    setColorProfileDialog(true);
  };

  const applyColorProfileDialog = () => {
    const profile = colorProfileTarget === "display-p3"
      ? {type: "display-p3" as const, name: "Display P3"}
      : {type: "srgb" as const, name: "sRGB"};
    mutateDocument(colorProfileAction === "convert" ? "Convert Color Profile" : "Assign Color Profile", () => {
      const profileChanged = colorProfileAction === "convert"
        ? convertDocumentColorProfile(pixelDocument, profile)
        : assignDocumentColorProfile(pixelDocument, profile);
      return setPixelAspectRatio(pixelDocument, pixelAspectWidthDraft, pixelAspectHeightDraft) || profileChanged;
    });
    setColorProfileDialog(false);
  };

  const importEmbeddedProfile = async () => {
    const file = await chooseBrowserFile(".icc,.icm,application/vnd.iccprofile");
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 16 * 1024 * 1024) {
      setStatus(language === "zh" ? "ICC 文件无效或超过 16 MiB" : "ICC file is invalid or exceeds 16 MiB");
      return;
    }
    mutateDocument("Assign Embedded Color Profile", () => assignDocumentColorProfile(pixelDocument, {type: "embedded", name: file.name, data: bytes}));
    setColorProfileDialog(false);
  };

  const importTextFont = async () => {
    const file = await chooseBrowserFile(".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2");
    if (!file) return;
    if (!/\.(?:ttf|otf|woff2?)$/i.test(file.name) || file.size === 0 || file.size > 32 * 1024 * 1024) {
      setStatus(language === "zh" ? "字体文件无效或超过 32 MiB" : "Font file is invalid or exceeds 32 MiB");
      return;
    }
    const baseName = file.name.replace(/\.(?:ttf|otf|woff2?)$/i, "").replace(/["\\]/g, "").trim().slice(0, 128) || "Imported Font";
    let family = baseName;
    let suffix = 2;
    const occupied = new Set([...builtInTextFontFamilies, ...loadedTextFonts.map((font) => font.family)]);
    while (occupied.has(family)) family = `${baseName} (${suffix++})`;
    try {
      const face = new FontFace(family, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      setLoadedTextFonts((fonts) => [...fonts, {family, fileName: file.name}]);
      setTextFontFamily(family);
      setStatus(language === "zh" ? `已加载字体 ${file.name}` : `Loaded font ${file.name}`);
    } catch {
      setStatus(language === "zh" ? "无法读取该字体文件" : "Could not load the font file");
    }
  };

  const textRaster = useMemo(() => {
    if (!textValue) return null;
    try {
      return rasterizeText({
        text: textValue,
        fontFamily: textFontFamily,
        fontSize: textFontSize,
        lineHeight: textLineHeight,
        bold: textBold,
        italic: textItalic,
        align: textAlign,
        antialias: textAntialias,
        hinting: textHinting,
        ligatures: textLigatures,
        color: foregroundRGBA,
        strokeColor: textStroke ? backgroundRGBA : undefined,
        strokeWidth: textStroke ? textStrokeWidth : 0,
      });
    } catch {
      return null;
    }
  }, [backgroundRGBA, foregroundRGBA, textAlign, textAntialias, textBold, textFontFamily, textFontSize, textHinting, textItalic, textLigatures, textLineHeight, textStroke, textStrokeWidth, textValue]);

  const placeText = useCallback((point: {x: number; y: number}) => {
    if (!textRaster || !canEditPixels) return;
    commitPixelMutation("Text", () => {
      const cel = getCel(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId);
      if (cel) stampRasterizedText(cel.pixels, cel.width, cel.height, textRaster, point.x - cel.x, point.y - cel.y, selection);
    });
  }, [canEditPixels, commitPixelMutation, pixelDocument, selection, textRaster]);

  const openPixio = useCallback(async () => {
    setStatus("Opening project...");
    try {
      if (!hasWailsAppBridge()) {
        const file = await chooseBrowserFile(".pixio,application/octet-stream");
        if (!file) { setStatus("Open cancelled"); return; }
        const decoded = decodeProject(await webDecodePixio(file));
        openDocumentTab(decoded, `Opened ${decoded.name}`);
        return;
      }
      const payload = await OpenPixio(language);
      if (!payload) { setStatus("Open cancelled"); return; }
      const opened = parseProjectResponse(payload);
      const decoded = decodeProject(opened.document);
      rememberProject(opened.path);
      openDocumentTab(decoded, `Opened ${decoded.name}`, undefined, opened.path);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Open failed"); }
  }, [language, openDocumentTab, rememberProject, setStatus]);

  const importPNG = useCallback(async () => {
    try {
      const image = hasWailsAppBridge()
        ? (() => ImportPNG(language).then((payload) => payload ? parsePNGResponse(payload) : null))()
        : chooseBrowserFile("image/png").then((file) => file ? decodeBrowserPNG(file) : null);
      const decoded = await image;
      if (!decoded) return;
       const imported = createDocument({name: decoded.name.replace(/\.png$/i, ".pixio"), width: decoded.width, height: decoded.height});
       getActiveCel(imported).pixels.set(decoded.pixels);
      openDocumentTab(imported, `Imported ${decoded.name}`, undefined, undefined, true);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Import failed"); }
  }, [language, openDocumentTab, setStatus]);

  const importPNGSequence = useCallback(async () => {
    try {
      const frames = hasWailsAppBridge()
        ? await ImportPNGSequence(language).then((payload) => payload ? parsePNGSequenceResponse(payload) : [])
        : await chooseBrowserFiles("image/png").then((files) => Promise.all(files.map(decodeBrowserPNG)));
      if (frames.length === 0) return;
      frames.sort((left, right) => left.name.localeCompare(right.name, undefined, {numeric: true}));
      const width = Math.max(...frames.map((frame) => frame.width));
      const height = Math.max(...frames.map((frame) => frame.height));
      const baseName = frames[0].name.replace(/\.png$/i, "").replace(/[-_ ]?\d+$/, "") || "sequence";
      const imported = createDocument({name: `${baseName}.pixio`, width, height});
      const copyFrame = (target: Uint8ClampedArray, frame: PNGResponse) => {
        for (let y = 0; y < frame.height; y += 1) target.set(frame.pixels.subarray(y * frame.width * 4, (y + 1) * frame.width * 4), y * width * 4);
      };
      copyFrame(getActiveCel(imported).pixels, frames[0]);
      for (const source of frames.slice(1)) {
        const frame = addFrame(imported);
        const cel = ensureCel(imported, imported.activeLayerId, frame.id);
        if (cel) copyFrame(cel.pixels, source);
      }
      imported.activeFrameId = imported.frames[0].id;
      openDocumentTab(imported, language === "zh" ? `已导入 ${frames.length} 帧` : `Imported ${frames.length} frames`, undefined, undefined, true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sequence import failed");
    }
  }, [language, openDocumentTab, setStatus]);

  const importSpriteSheet = useCallback(async () => {
    try {
      const decoded = hasWailsAppBridge()
        ? await ImportPNG(language).then((payload) => payload ? parsePNGResponse(payload) : null)
        : await chooseBrowserFile("image/png").then((file) => file ? decodeBrowserPNG(file) : null);
      if (!decoded) return;
      setSpriteImportDialog({
        image: decoded,
        frameWidth: Math.min(64, decoded.width),
        frameHeight: Math.min(64, decoded.height),
        layout: "matrix",
        offsetX: 0,
        offsetY: 0,
        paddingX: 0,
        paddingY: 0,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
    }
  }, [language, setStatus]);

  const applySpriteSheetImport = () => {
    if (!spriteImportDialog) return;
    try {
      const sliced = sliceSpriteSheet(spriteImportDialog.image.pixels, spriteImportDialog.image.width, spriteImportDialog.image.height, spriteImportDialog);
      const imported = createDocument({
        name: spriteImportDialog.image.name.replace(/\.png$/i, ".pixio"),
        width: sliced.width,
        height: sliced.height,
      });
      getActiveCel(imported).pixels.set(sliced.frames[0]);
      for (const pixels of sliced.frames.slice(1)) {
        const frame = addFrame(imported);
        ensureCel(imported, imported.activeLayerId, frame.id)?.pixels.set(pixels);
      }
      imported.activeFrameId = imported.frames[0].id;
      openDocumentTab(imported, `Imported ${spriteImportDialog.image.name}`, undefined, undefined, true);
      setSpriteImportDialog(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
    }
  };

  const openRecentProject = async (path: string) => {
    if (!hasWailsAppBridge()) { setStatus("Recent projects open in the desktop app"); return; }
    try {
      const payload = await OpenPixioPath(path);
      const decoded = decodeProject(payload);
      openDocumentTab(decoded, `Opened ${decoded.name}`, undefined, path);
    } catch {
      setRecentProjects((projects) => projects.filter((candidate) => candidate !== path));
      setStatus("Recent project is unavailable");
    }
  };

  const importDroppedFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      try {
        if (file.name.toLowerCase().endsWith(".pixio")) {
          const decoded = decodeProject(await webDecodePixio(file));
          openDocumentTab(decoded, `Opened ${decoded.name}`);
        } else if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) {
          const decoded = await decodeBrowserPNG(file);
          const imported = createDocument({name: decoded.name.replace(/\.png$/i, ".pixio"), width: decoded.width, height: decoded.height});
          getActiveCel(imported).pixels.set(decoded.pixels);
          openDocumentTab(imported, `Imported ${decoded.name}`, undefined, undefined, true);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Import failed");
      }
    }
  };

  const beginOpacityChange = () => {
    if (activeTab.commandScope !== "layer") {
      setTabCommandScope(activeTab, "layer");
      setUIRevision((value) => value + 1);
    }
    if (!opacityBeforeRef.current) opacityBeforeRef.current = cloneDocument(pixelDocument);
  };

  const finishOpacityChange = () => {
    const before = opacityBeforeRef.current;
    opacityBeforeRef.current = null;
    if (isPlaying) return;
    if (!before) return;
    const changed = layerTargetsFor().some((layer) => getLayerByID(before, layer.id)?.opacity !== layer.opacity);
    if (!changed) return;
    history.commit(new DocumentStateCommand(before, pixelDocument, "Change Layer Opacity"));
    setStatus("Change Layer Opacity");
    invalidate();
  };

  const beginFrameDurationChange = () => {
    if (!frameDurationBeforeRef.current) frameDurationBeforeRef.current = cloneDocument(pixelDocument);
  };

  const finishFrameDurationChange = () => {
    const before = frameDurationBeforeRef.current;
    frameDurationBeforeRef.current = null;
    if (!before || isPlaying) return;
    const changed = selectedFrameIds.some((frameId) => before.frames.find((frame) => frame.id === frameId)?.durationMs !== pixelDocument.frames.find((frame) => frame.id === frameId)?.durationMs);
    if (!changed) return;
    history.commit(new DocumentStateCommand(before, pixelDocument, "Change Frame Duration"));
    setStatus("Change Frame Duration");
    invalidate();
  };

  const finishRename = (layerId: string) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setRenamingLayerId(null);
      return;
    }
    setRenamingLayerId(null);
    mutateDocument("Rename Layer", () => renameLayer(pixelDocument, layerId, layerNameDraft));
  };

  const finishDocumentRename = (tab: EditorTab) => {
    if (cancelDocumentRenameRef.current) {
      cancelDocumentRenameRef.current = false;
      setRenamingDocumentTabID(null);
      return;
    }
    if (isPlaying) {
      setRenamingDocumentTabID(null);
      setStatus("Pause playback to edit");
      return;
    }
    const name = displayProjectName(documentNameDraft.trim());
    setRenamingDocumentTabID(null);
    if (!name || name === displayProjectName(tab.document.name)) return;
    const before = cloneDocument(tab.document);
    tab.document.name = `${name}.pixio`;
    tab.history.commit(new DocumentStateCommand(before, tab.document, "Rename Project"));
    tab.status = "Rename Project";
    invalidate();
  };

  const changeZoom = (direction: -1 | 1) => {
    const index = zoomLevels.indexOf(zoom);
    setZoom(zoomLevels[Math.max(0, Math.min(zoomLevels.length - 1, index + direction))]);
  };

  const copyCurrentSelection = () => {
    if (!selection || !activeCel) return;
    clipboardRef.current = copySelection(activeCel.pixels, activeCel.width, selection);
    void writePixelClipboard(clipboardRef.current).catch(() => writeClipboardText(serializePixelClipboard(clipboardRef.current!)).catch(() => undefined));
    setStatus("Copied Selection");
  };

  const cutCurrentSelection = () => {
    if (!selection) return;
    if (!activeCel || !canEditPixels) {
      setStatus(isPlaying ? "Pause playback to edit" : isImageLayer(activeLayer) ? `${activeLayer.name} is locked` : "Select an image layer");
      return;
    }
    clipboardRef.current = copySelection(activeCel.pixels, activeCel.width, selection);
    void writePixelClipboard(clipboardRef.current).catch(() => writeClipboardText(serializePixelClipboard(clipboardRef.current!)).catch(() => undefined));
    commitPixelMutation("Cut Selection", () => clearSelection(activeCel.pixels, activeCel.width, selection, activeClearColor));
  };

  const pasteCurrentSelection = () => {
    const clipboard = clipboardRef.current;
    if (!clipboard || !canEditPixels) return;
    const destinationX = selection?.x ?? 0;
    const destinationY = selection?.y ?? 0;
    if (commitPixelMutation("Paste Selection", () => {
      const target = getCel(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId);
      if (target) pasteClipboard(target.pixels, target.width, target.height, clipboard, destinationX, destinationY);
    })) {
      setSelection(clippedSelection(
        destinationX,
        destinationY,
        clipboard.width,
        clipboard.height,
        pixelDocument.width,
        pixelDocument.height,
      ));
    }
  };

  const pasteSystemSelection = async () => {
    try {
      const clipboard = await readPixelClipboardImage() ?? deserializePixelClipboard(await readClipboardText());
      if (!clipboard) {
        setStatus("Unsupported clipboard content");
        return;
      }
      clipboardRef.current = clipboard;
      pasteCurrentSelection();
    } catch {
      // The internal clipboard remains useful when the native clipboard cannot be read.
      pasteCurrentSelection();
    }
  };

  const readBestPixelClipboard = async () => {
    try {
      const clipboard = await readPixelClipboardImage() ?? deserializePixelClipboard(await readClipboardText());
      if (clipboard) clipboardRef.current = clipboard;
    } catch {
      // Browser clipboard access can be denied; retain the application clipboard.
    }
    return clipboardRef.current;
  };

  const copyMergedSelection = () => {
    if (!selection) return;
    clipboardRef.current = copySelection(compositeFrame(pixelDocument), pixelDocument.width, selection);
    void writePixelClipboard(clipboardRef.current).catch(() => writeClipboardText(serializePixelClipboard(clipboardRef.current!)).catch(() => undefined));
    setStatus("Copied Merged Selection");
  };

  const fillCurrentSelection = () => {
    if (!selection) return;
    commitPixelMutation("Fill Selection", () => {
      const target = getCel(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId);
      if (target) fillSelection(target.pixels, target.width, selection, foregroundRGBA);
    });
  };

  const strokeCurrentSelection = () => {
    if (!selection) return;
    commitPixelMutation("Stroke Selection", () => {
      const target = getCel(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId);
      if (target) strokeSelection(
        target.pixels,
        target.width,
        target.height,
        selection,
        foregroundRGBA,
        selectionAdjustAmount,
      );
    });
  };

  const shiftCurrentPixels = (deltaX: number, deltaY: number) => {
    if (!activeCel) return;
    commitPixelMutation("Shift Pixels", () => shiftPixelsWrapped(
      activeCel.pixels,
      activeCel.width,
      activeCel.height,
      deltaX,
      deltaY,
      selection,
    ));
  };

  const selectionToNewLayer = (cut: boolean) => {
    if (!selection || !activeCel || !canEditPixels) return;
    mutateDocument(cut ? "Cut Selection to New Layer" : "Copy Selection to New Layer", () => {
      const layerId = applySelectionToNewLayer(pixelDocument, selection, {
        cut,
        clearColor: activeClearColor,
        name: cut
          ? (language === "zh" ? "剪切的选区" : "Cut Selection")
          : (language === "zh" ? "复制的选区" : "Copied Selection"),
      });
      if (!layerId) return false;
      activeTab.selectedLayerIds = [layerId];
      activeTab.layerSelectionAnchorId = layerId;
      setTabCommandScope(activeTab, "layer");
      return true;
    });
  };

  const pasteSpecialToLayer = async (reference: boolean) => {
    const clipboard = await readBestPixelClipboard();
    if (!clipboard) { setStatus("Unsupported clipboard content"); return; }
    const destinationX = selection?.x ?? 0;
    const destinationY = selection?.y ?? 0;
    mutateDocument(reference ? "Paste as Reference Layer" : "Paste as New Layer", () => {
      const layerId = pasteClipboardAsNewLayer(pixelDocument, clipboard, {
        name: reference
          ? (language === "zh" ? "参考图层" : "Reference")
          : (language === "zh" ? "粘贴的图层" : "Pasted Layer"),
        reference,
        x: destinationX,
        y: destinationY,
      });
      if (!layerId) return false;
      activeTab.selectedLayerIds = [layerId];
      activeTab.layerSelectionAnchorId = layerId;
      setTabCommandScope(activeTab, "layer");
      return true;
    });
  };

  const pasteSpecialNewSprite = async () => {
    const clipboard = await readBestPixelClipboard();
    if (!clipboard) { setStatus("Unsupported clipboard content"); return; }
    const document = createBlankDocument(language, clipboard.width, clipboard.height, pixelDocument.colorMode, preferences);
    const cel = getActiveCel(document);
    pasteClipboard(cel.pixels, cel.width, cel.height, clipboard, 0, 0);
    if (document.colorMode === "indexed") syncIndexedCel(document, cel);
    openDocumentTab(document, language === "zh" ? "已从剪贴板创建项目" : "Created project from clipboard", undefined, undefined, true);
  };

  const copyCurrentCels = () => {
    const anchor = activeTab.celSelectionAnchor;
    if (activeTab.commandScope !== "cels" || selectedCels.length === 0 || !anchor) return false;
    const clipboard = copyCelSelection(pixelDocument, selectedCels, anchor, allTimelineImageLayerIDs);
    if (!clipboard) return false;
    celClipboardRef.current = clipboard;
    setStatus("Copied Cels");
    return true;
  };

  const openCrossDocumentCopyDialog = (mode: "frames" | "layers" = "frames") => {
    if (isPlaying || tabs.length < 2) return;
    if (mode === "frames" && selectedFrameIds.length === 0) return;
    if (mode === "layers" && (activeTab.commandScope !== "layer" || selectedLayers.length === 0)) return;
    const target = tabs.find((tab) => tab.id !== activeTab.id);
    if (!target) return;
    setCrossDocumentCopyDialog({
      mode,
      sourceTabId: activeTab.id,
      frameIds: mode === "frames" ? [...selectedFrameIds] : [],
      layerIds: mode === "layers" ? selectedLayers.map((layer) => layer.id) : [],
      targetTabId: target.id,
    });
  };

  const applyCrossDocumentCopy = () => {
    const dialog = crossDocumentCopyDialog;
    if (!dialog || isPlaying) return;
    const sourceTab = tabs.find((tab) => tab.id === dialog.sourceTabId);
    const targetTab = tabs.find((tab) => tab.id === dialog.targetTabId);
    if (!sourceTab || !targetTab || sourceTab === targetTab) {
      setCrossDocumentCopyDialog(null);
      return;
    }

    const before = cloneDocument(targetTab.document);
    const beforeTimeline = captureTabTimeline(targetTab);
    if (dialog.mode === "frames") {
      const result = copyFramesToDocument(sourceTab.document, dialog.frameIds, targetTab.document);
      if (!result) {
        setStatus(language === "zh"
          ? "跨文档复制需要相同画布尺寸和颜色模式"
          : "Cross-document copy requires matching canvas size and color mode");
        return;
      }

      targetTab.selectedFrameIds = [...result.frameIds];
      targetTab.frameSelectionAnchorId = result.frameIds[0];
      targetTab.selectedLayerIds = [targetTab.document.activeLayerId];
      targetTab.layerSelectionAnchorId = targetTab.document.activeLayerId;
      targetTab.activeTagId = result.tagIds[0];
      setTabCommandScope(targetTab, "frame");
      targetTab.compositeCache.clear();
      touchAllTabThumbnails(targetTab);
      normalizeTabTimeline(targetTab);
      targetTab.history.commit(new EditorDocumentStateCommand(
        before,
        targetTab.document,
        language === "zh" ? "跨文档复制帧" : "Copy Frames to Document",
        targetTab,
        beforeTimeline,
        captureTabTimeline(targetTab),
      ));
      targetTab.status = language === "zh" ? "已从其他文件复制帧" : "Copied frames from another document";
    } else {
      const result = copyLayersToDocument(sourceTab.document, dialog.layerIds, targetTab.document);
      if (!result) {
        setStatus(language === "zh"
          ? "跨文档复制图层需要相同画布尺寸、颜色模式和帧数量"
          : "Cross-document layer copy requires matching canvas size, color mode and frame count");
        return;
      }

      targetTab.selectedLayerIds = [...result.layerIds];
      targetTab.layerSelectionAnchorId = result.layerIds[0];
      targetTab.document.activeLayerId = result.layerIds.find((layerId) => getLayerByID(targetTab.document, layerId)?.kind !== "group") ?? result.layerIds[0];
      setTabCommandScope(targetTab, "layer");
      targetTab.compositeCache.clear();
      touchTabThumbnailCels(targetTab, result.celIds);
      normalizeTabTimeline(targetTab);
      targetTab.history.commit(new EditorDocumentStateCommand(
        before,
        targetTab.document,
        language === "zh" ? "跨文档复制图层" : "Copy Layers to Document",
        targetTab,
        beforeTimeline,
        captureTabTimeline(targetTab),
      ));
      targetTab.status = language === "zh" ? "已从其他文件复制图层" : "Copied layers from another document";
    }
    setCrossDocumentCopyDialog(null);
    setActiveTabID(targetTab.id);
    setIsPlaying(false);
    invalidate();
  };

  const cutCurrentCels = () => {
    if (isPlaying) {
      setStatus("Pause playback to edit");
      return false;
    }
    if (!selectedCelsEditable) {
      setStatus("Selected cels are locked");
      return false;
    }
    const anchor = activeTab.celSelectionAnchor;
    if (!anchor) return false;
    const clipboard = copyCelSelection(pixelDocument, selectedCels, anchor, allTimelineImageLayerIDs);
    if (!clipboard) return false;
    celClipboardRef.current = clipboard;
    const changed = mutateDocument("Cut Cels", () => clearCelSelection(pixelDocument, selectedCels, backgroundClearColor));
    if (!changed) setStatus("Cut Cels");
    return true;
  };

  const clearCurrentCels = () => {
    if (!selectedCelsEditable) {
      setStatus(isPlaying ? "Pause playback to edit" : "Selected cels are locked");
      return false;
    }
    if (preferences.alerts.deleteCel && !window.confirm(language === "zh" ? "清除所选动画格？" : "Clear the selected cels?")) return false;
    return mutateDocument("Clear Cels", () => clearCelSelection(pixelDocument, selectedCels, backgroundClearColor));
  };

  const duplicateCurrentCels = (linked = false) => {
    if (isPlaying) {
      setStatus("Pause playback to edit");
      return false;
    }
    const addresses = (activeTab.commandScope === "cels" && selectedCels.length > 0
      ? selectedCels
      : activeCel
        ? [{layerId: activeCel.layerId, frameId: activeCel.frameId}]
        : [])
      .filter(({layerId, frameId}) => Boolean(getCel(pixelDocument, layerId, frameId)));
    if (addresses.length === 0) return false;
    const anchor = activeTab.celSelectionAnchor && addresses.some((address) =>
      address.layerId === activeTab.celSelectionAnchor?.layerId
      && address.frameId === activeTab.celSelectionAnchor?.frameId)
      ? activeTab.celSelectionAnchor
      : addresses[0];
    let result: ReturnType<typeof duplicateTimelineCels> = null;
    const changed = mutateDocument(linked ? ui.duplicateLinkedCels : ui.duplicateCels, () => {
      result = linked
        ? duplicateLinkedTimelineCels(pixelDocument, {
          sourceAddresses: addresses,
          sourceAnchor: anchor,
          orderedLayerIds: allTimelineImageLayerIDs,
          backgroundColor: backgroundClearColor,
        })
        : duplicateTimelineCels(pixelDocument, {
          sourceAddresses: addresses,
          sourceAnchor: anchor,
          orderedLayerIds: allTimelineImageLayerIDs,
          backgroundColor: backgroundClearColor,
        });
      if (!result || result.targetAddresses.length === 0) return false;
      const firstTarget = result.targetAddresses[0];
      activeTab.selectedCelKeys = result.targetAddresses.map(({layerId, frameId}) => celSelectionKey(layerId, frameId));
      activeTab.celSelectionAnchor = {...firstTarget};
      activeTab.selectedFrameIds = [...new Set(result.targetAddresses.map(({frameId}) => frameId))];
      activeTab.frameSelectionAnchorId = firstTarget.frameId;
      pixelDocument.activeLayerId = firstTarget.layerId;
      pixelDocument.activeFrameId = firstTarget.frameId;
      setTabCommandScope(activeTab, "cels");
      return true;
    });
    if (!changed) setStatus(language === "zh" ? "无法复制所选动画格" : "Selected cels cannot be duplicated here");
    return changed;
  };

  const pasteCurrentCels = () => {
    if (isPlaying) {
      setStatus("Pause playback to edit");
      return false;
    }
    const clipboard = celClipboardRef.current;
    if (!clipboard) {
      setStatus("Unsupported clipboard content");
      return false;
    }
    const targetAnchor = {layerId: pixelDocument.activeLayerId, frameId: pixelDocument.activeFrameId};
    let pasted: CelAddress[] | null = null;
    const changed = mutateDocument("Paste Cels", () => {
      pasted = pasteCelSelection(pixelDocument, clipboard, targetAnchor, allTimelineImageLayerIDs, backgroundClearColor);
      if (!pasted) return false;
      activeTab.selectedCelKeys = pasted.map(({layerId, frameId}) => celSelectionKey(layerId, frameId));
      activeTab.celSelectionAnchor = {...targetAnchor};
      activeTab.commandScope = "cels";
      activeTab.activeTagId = undefined;
      activeTab.selection = null;
      activeTab.selectedFrameIds = pixelDocument.frames
        .filter((frame) => pasted!.some((address) => address.frameId === frame.id))
        .map((frame) => frame.id);
      activeTab.frameSelectionAnchorId = targetAnchor.frameId;
      return true;
    });
    if (!changed) setStatus("Cels cannot be pasted here");
    return changed;
  };

  const linkCurrentCels = () => {
    if (linkableCelGroups.length === 0) return false;
    if (!celGroupsEditable(linkableCelGroups)) {
      setStatus("Selected cels are locked");
      return false;
    }
    return mutateDocument("Link Cels", () => {
      let changed = false;
      for (const {layerId, frameIds} of linkableCelGroups) {
        const anchor = activeTab.celSelectionAnchor;
        const sourceFrameId = anchor?.layerId === layerId && frameIds.includes(anchor.frameId)
          ? anchor.frameId
          : layerId === pixelDocument.activeLayerId && frameIds.includes(pixelDocument.activeFrameId)
            ? pixelDocument.activeFrameId
            : frameIds[0];
        changed = linkCels(pixelDocument, layerId, frameIds, sourceFrameId) || changed;
      }
      return changed;
    });
  };

  const unlinkCurrentCels = () => {
    if (unlinkableCelGroups.length === 0) return false;
    if (!celGroupsEditable(unlinkableCelGroups)) {
      setStatus("Selected cels are locked");
      return false;
    }
    return mutateDocument("Unlink Cels", () => {
      let changed = false;
      for (const {layerId, frameIds} of unlinkableCelGroups) {
        changed = unlinkCels(pixelDocument, layerId, frameIds) || changed;
      }
      return changed;
    });
  };

  const cropCanvas = (bounds: Selection) => {
    mutateDocument("Crop Canvas", () => cropDocument(
      pixelDocument,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    ));
  };

  const transformCurrentSelection = (transform: "scale" | TransformAxis | RotationDirection) => {
    if (!selection || !activeCel || !canEditPixels) return;
    const targetWidth = Math.max(1, Math.min(2048, Math.round(selectionWidthDraft)));
    const targetHeight = Math.max(1, Math.min(2048, Math.round(selectionHeightDraft)));
    if (transform === "scale" && (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight))) return;

    let transformedSelection: Selection = selection;
    const label = transform === "scale"
      ? "Scale Selection"
      : transform === "horizontal"
        ? "Flip Selection Horizontally"
        : transform === "vertical"
          ? "Flip Selection Vertically"
          : transform === "clockwise"
            ? "Rotate Selection Clockwise"
            : "Rotate Selection Counterclockwise";
    const changed = commitPixelMutation(label, () => {
      const source = copySelection(activeCel.pixels, activeCel.width, selection);
      clearSelection(activeCel.pixels, activeCel.width, selection, activeClearColor);
      const transformed = transform === "scale"
        ? resizeClipboard(source, targetWidth, targetHeight)
        : transform === "horizontal" || transform === "vertical"
          ? flipClipboard(source, transform)
          : rotateClipboard(source, transform);
      transformedSelection = transform === "scale"
        ? resizeSelection(selection, targetWidth, targetHeight) ?? selection
        : transform === "horizontal" || transform === "vertical"
          ? flipSelection(selection, transform)
          : rotateSelection(selection, transform);
      pasteClipboard(activeCel.pixels, activeCel.width, activeCel.height, transformed, selection.x, selection.y);
    });
    if (!changed) return;
    const clipped = clippedSelection(
      transformedSelection.x,
      transformedSelection.y,
      transformedSelection.width,
      transformedSelection.height,
      activeCel.width,
      activeCel.height,
      transformedSelection.mask,
    );
    if (clipped) activeTab.transformPivot = {x: clipped.x + clipped.width / 2, y: clipped.y + clipped.height / 2};
    setSelection(clipped);
  };

  const moveCurrentSelectionNumerically = () => {
    if (!selection || !activeCel || !canEditPixels) return;
    const x = Math.max(0, Math.min(activeCel.width - selection.width, Math.round(selectionXDraft)));
    const y = Math.max(0, Math.min(activeCel.height - selection.height, Math.round(selectionYDraft)));
    if (x === selection.x && y === selection.y) return;
    let nextSelection: Selection | null = selection;
    const deltaX = x - selection.x;
    const deltaY = y - selection.y;
    const changed = commitPixelMutation("Move Selection", () => {
      nextSelection = moveSelection(activeCel.pixels, activeCel.width, activeCel.height, selection, x, y, activeClearColor);
    });
    if (!changed) return;
    if (activeTab.transformPivot) activeTab.transformPivot = {x: activeTab.transformPivot.x + deltaX, y: activeTab.transformPivot.y + deltaY};
    setSelection(nextSelection);
  };

  const updateTransformPivot = useCallback((point: {x: number; y: number}) => {
    activeTab.transformPivot = {
      x: Math.max(0, Math.min(pixelDocument.width, point.x)),
      y: Math.max(0, Math.min(pixelDocument.height, point.y)),
    };
    setUIRevision((value) => value + 1);
  }, [activeTab, pixelDocument.height, pixelDocument.width]);

  const rotateCurrentSelectionArbitrary = () => {
    if (!selection || !activeCel || !canEditPixels || !Number.isFinite(selectionRotationDraft) || selectionRotationDraft === 0) return;
    let nextSelection: Selection | null = selection;
    const changed = commitPixelMutation("Rotate Selection", () => {
      const source = copySelection(activeCel.pixels, activeCel.width, selection);
      const pivot = activeTab.transformPivot ?? {x: selection.x + selection.width / 2, y: selection.y + selection.height / 2};
      const rotated = rotateClipboardWithPivot(source, selectionRotationDraft, {x: pivot.x - selection.x, y: pivot.y - selection.y});
      clearSelection(activeCel.pixels, activeCel.width, selection, activeClearColor);
      const x = selection.x + rotated.offsetX;
      const y = selection.y + rotated.offsetY;
      pasteClipboard(activeCel.pixels, activeCel.width, activeCel.height, rotated, x, y);
      nextSelection = clippedSelection(x, y, rotated.width, rotated.height, activeCel.width, activeCel.height, rotated.mask);
    });
    if (changed) setSelection(nextSelection);
  };

  const addPaletteColor = () => {
    mutateDocument("Add Palette Color", () => {
      const value = paletteColorFromEditor(foregroundColor, foregroundAlpha);
      if (pixelDocument.palette.colors.length >= 256 || pixelDocument.palette.colors.includes(value)) return false;
      pixelDocument.palette.colors.push(value);
      setSelectedPaletteIndex(pixelDocument.palette.colors.length - 1);
      return true;
    });
  };

  const usePaletteColor = (value: string, target: ColorTarget) => {
    const parsed = parseEditorHexColor(value);
    if (!parsed) return;
    const hex = editorColorToHex(parsed);
    if (target === "foreground") {
      setColorTarget("foreground");
      setForegroundColor(hex);
      setForegroundAlpha(parsed.a);
    } else {
      setColorTarget("background");
      setBackgroundColor(hex);
      setBackgroundAlpha(parsed.a);
    }
  };

  const updatePaletteColor = () => {
    mutateDocument("Edit Palette Color", () => {
      const value = paletteColorFromEditor(foregroundColor, foregroundAlpha);
      if (!hasSelectedPaletteColor || pixelDocument.palette.colors[paletteIndex] === value) return false;
      pixelDocument.palette.colors[paletteIndex] = value;
      refreshIndexedDocument(pixelDocument);
      return true;
    });
  };

  const removePaletteColor = () => {
    mutateDocument("Remove Palette Color", () => {
      if (pixelDocument.palette.colors.length <= 1 || !hasSelectedPaletteColor) return false;
      pixelDocument.palette.colors.splice(paletteIndex, 1);
      if (pixelDocument.palette.transparentIndex >= pixelDocument.palette.colors.length) pixelDocument.palette.transparentIndex = 0;
      refreshIndexedDocument(pixelDocument);
      const nextIndex = Math.max(0, Math.min(paletteIndex, pixelDocument.palette.colors.length - 1));
      setSelectedPaletteIndex(nextIndex);
      usePaletteColor(pixelDocument.palette.colors[nextIndex], "foreground");
      return true;
    });
  };

  const changeColorMode = (mode: ColorMode) => {
    if (mode === pixelDocument.colorMode) return;
    if (preferences.alerts.convertColorMode && !window.confirm(language === "zh" ? "转换颜色模式会改变当前项目的像素数据。继续吗？" : "Changing color mode can alter pixel data in this project. Continue?")) return;
    mutateDocument("Change Color Mode", () => convertDocumentColorMode(pixelDocument, mode, indexedDither));
  };

  const importPaletteFile = async () => {
    try {
      const file = await chooseBrowserFile(".gpl,.pal,text/plain");
      if (!file) return;
      const parsed = parsePaletteText(await file.text());
      mutateDocument("Import Palette", () => {
        pixelDocument.palette.name = parsed.name || file.name.replace(/\.[^.]+$/, "");
        pixelDocument.palette.colors = parsed.colors.slice(0, 256);
        pixelDocument.palette.transparentIndex = Math.min(pixelDocument.palette.transparentIndex, pixelDocument.palette.colors.length - 1);
        refreshIndexedDocument(pixelDocument);
        setSelectedPaletteIndex(0);
        return true;
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
    }
  };

  const exportPaletteFile = (format: PaletteFileFormat) => {
    const extension = format === "gpl" ? "gpl" : "pal";
    downloadBlob(new Blob([exportPaletteText(pixelDocument.palette.colors, format, pixelDocument.palette.name)], {type: "text/plain;charset=utf-8"}), `${displayProjectName(pixelDocument.name)}.${extension}`);
  };

  const openAdjustment = (kind: AdjustmentKind) => setAdjustmentDialog({...createAdjustmentDialogState(kind), outlineTileX: pixelDocument.settings.tiledX, outlineTileY: pixelDocument.settings.tiledY});

  const renderOutlineAdjustment = (cel: NonNullable<ReturnType<typeof getCel>>) => {
    if (!adjustmentDialog) return cel;
    const background = getLayerByID(pixelDocument, cel.layerId)?.role === "background";
    return renderDocumentOutline(pixelDocument, cel, {
      color: foregroundRGBA,
      thickness: adjustmentDialog.outlineThickness, position: adjustmentDialog.outlinePosition,
      shape: adjustmentDialog.outlineShape, directions: adjustmentDialog.outlineDirections,
      tileX: adjustmentDialog.outlineTileX, tileY: adjustmentDialog.outlineTileY,
      channelMask: {...adjustmentDialog.channelValues, alpha: background ? false : adjustmentDialog.channelValues.alpha},
      selection: adjustmentDialog.scope === "active" ? selection : null,
    });
  };

  const applyAdjustment = () => {
    if (!adjustmentDialog || !hasOpenDocument || isPlaying) return;
    const {scope, kind} = adjustmentDialog;
    const targets: Array<NonNullable<ReturnType<typeof getCel>>> = [];
    const seenBuffers = new Set<Uint8ClampedArray>();
    const seenLinks = new Set<string>();
    const addTarget = (candidate: ReturnType<typeof getCel>) => {
      if (!candidate) return;
      const layer = getLayerByID(pixelDocument, candidate.layerId);
      if (!layer || !isEditableImageLayer(layer) || isLayerEffectivelyLocked(pixelDocument, layer)) return;
      if (seenBuffers.has(candidate.pixels) || (candidate.linkId && seenLinks.has(candidate.linkId))) return;
      seenBuffers.add(candidate.pixels);
      if (candidate.linkId) seenLinks.add(candidate.linkId);
      targets.push(candidate);
    };
    if (scope === "active") {
      if (canEditPixels || kind === "outline") addTarget(getCel(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId));
    } else if (scope === "selected") {
      for (const address of selectedCels) addTarget(getCel(pixelDocument, address.layerId, address.frameId));
    } else {
      for (const candidate of Object.values(pixelDocument.cels)) addTarget(candidate);
    }
    if (targets.length === 0) {
      setStatus(scope === "selected" ? "No editable cels selected" : "No editable image cels");
      return;
    }
    if (kind === "outline") {
      try {
        // Calculate every result first so a rejected geometry cannot leave a partial batch.
        const results = targets.map((cel) => ({cel, result: renderOutlineAdjustment(cel)}));
        const changed = mutateDocument("Outline", () => {
          let changedAny = false;
          for (const {cel, result} of results) if (applyRenderedOutline(pixelDocument, cel, result)) changedAny = true;
          return changedAny;
        });
        if (changed) setAdjustmentDialog(null);
      } catch (error) {
        setStatus(language === "zh" ? "描边后的动画格尺寸超过 2048 像素，未应用更改" : error instanceof Error ? error.message : "Could not apply outline");
      }
      return;
    }
    const channelMask: ChannelMask = {...adjustmentDialog.channelValues};
    const selectionForTarget = scope === "active" ? selection : null;
    const preset = adjustmentConvolutionPresets[adjustmentDialog.convolutionPreset];
    const label = kind === "brightness-contrast"
      ? "Brightness / Contrast"
      : kind === "hsl" ? "Hue / Saturation / Lightness"
        : kind === "invert" ? "Invert Colors"
          : kind === "convolution" ? "Convolution"
            : kind === "median" ? "Median Filter"
              : kind === "despeckle" ? "Despeckle"
                : kind === "curves" ? "Color Curves"
                  : kind === "hsv-hsl" ? "HSV / HSL Adjustment"
                    : "Channel Mask";
    const changed = mutateDocument(label, () => {
      let changedAny = false;
      for (const cel of targets) {
        const before = cel.pixels.slice();
        const indexesBefore = cel.indexes?.slice();
        if (kind === "brightness-contrast") {
          adjustBrightnessContrastInPlace(cel.pixels, {
            width: cel.width, height: cel.height, selection: selectionForTarget,
            brightness: adjustmentDialog.brightness, contrast: adjustmentDialog.contrast, channelMask,
          });
        } else if (kind === "hsl") {
          adjustHslInPlace(cel.pixels, {
            width: cel.width, height: cel.height, selection: selectionForTarget,
            hue: adjustmentDialog.hue, saturation: adjustmentDialog.saturation, lightness: adjustmentDialog.lightness, channelMask,
          });
        } else if (kind === "invert") {
          invertPixelsInPlace(cel.pixels, cel.width, cel.height, {selection: selectionForTarget, channelMask});
        } else if (kind === "convolution") {
          applyConvolutionInPlace(cel.pixels, {
            width: cel.width, height: cel.height, selection: selectionForTarget,
            kernel: preset.kernel, divisor: preset.divisor, bias: preset.bias, channelMask,
          });
        } else if (kind === "median" || kind === "despeckle") {
          applyMedianInPlace(cel.pixels, {
            width: cel.width, height: cel.height, selection: selectionForTarget,
            size: adjustmentDialog.medianSize, threshold: adjustmentDialog.medianThreshold, channelMask,
          });
        } else if (kind === "curves") {
          const curves = Object.fromEntries((Object.keys(adjustmentDialog.curvePoints) as AdjustmentCurveChannel[]).map((channel) => [
            channel,
            createCurveLut(adjustmentDialog.curvePoints[channel]),
          ]));
          applyColorCurvesInPlace(cel.pixels, {width: cel.width, height: cel.height, selection: selectionForTarget, curves, channelMask});
        } else if (kind === "hsv-hsl") {
          adjustHsvHslInPlace(cel.pixels, {
            width: cel.width, height: cel.height, selection: selectionForTarget,
            space: adjustmentDialog.hsvSpace, mode: adjustmentDialog.hsvMode,
            hue: adjustmentDialog.hue, saturation: adjustmentDialog.saturation,
            value: adjustmentDialog.value, lightness: adjustmentDialog.lightness, channelMask,
          });
        } else {
          maskChannelsInPlace(cel.pixels, cel.width, cel.height, channelMask, selectionForTarget);
        }
        syncIndexedCel(pixelDocument, cel);
        if (!changedAny && (indexesBefore?.length !== cel.indexes?.length || indexesBefore?.some((value, index) => value !== cel.indexes?.[index]))) changedAny = true;
        if (!changedAny && before.length === cel.pixels.length) {
          for (let offset = 0; offset < before.length; offset += 1) {
            if (before[offset] !== cel.pixels[offset]) { changedAny = true; break; }
          }
        }
      }
      return changedAny;
    });
    if (changed) setAdjustmentDialog(null);
  };

  const applyShadeEffect = () => {
    if (!activeCel || !canEditPixels) return;
    commitPixelMutation("Shading", () => shadePixelsInPlace(activeCel.pixels, {width: activeCel.width, height: activeCel.height, shadow: foregroundRGBA, highlight: backgroundRGBA, selection, preserveAlpha: true}));
  };

  const extractDocumentPalette = () => {
    mutateDocument("Extract Palette", () => {
      const colors = extractPalette(Object.values(pixelDocument.cels).map((cel) => cel.pixels));
      if (colors.length === 0 || colors.join() === pixelDocument.palette.colors.join()) return false;
      pixelDocument.palette.colors = colors;
      setSelectedPaletteIndex(0);
      usePaletteColor(colors[0], "foreground");
      return true;
    });
  };

  const sortDocumentPalette = () => {
    mutateDocument("Sort Palette", () => {
      const colors = sortPalette(pixelDocument.palette.colors);
      if (colors.join() === pixelDocument.palette.colors.join()) return false;
      pixelDocument.palette.colors = colors;
      setSelectedPaletteIndex(0);
      usePaletteColor(colors[0], "foreground");
      return true;
    });
  };

  const openCelProperties = () => {
    const addresses = (activeTab.commandScope === "cels" && selectedCels.length ? selectedCels : [{layerId: activeLayer.id, frameId: pixelDocument.activeFrameId}])
      .filter(({layerId, frameId}) => {
        const layer = getLayerByID(pixelDocument, layerId);
        return layer?.role === "standard" && !isLayerEffectivelyLocked(pixelDocument, layer) && Boolean(getCel(pixelDocument, layerId, frameId));
      });
    if (!addresses.length) return;
    const cels = addresses.map(({layerId, frameId}) => getCel(pixelDocument, layerId, frameId)!);
    setCelPropertiesDialog({addresses,
      opacity: cels.every((cel) => cel.opacity === cels[0].opacity) ? String(cels[0].opacity * 100) : "",
      zIndex: cels.every((cel) => cel.zIndex === cels[0].zIndex) ? String(cels[0].zIndex) : "",
    });
  };

  const openLayerProperties = () => {
    if (isPlaying) return;
    const targets = activeTab.commandScope === "layer" && selectedLayers.length ? selectedLayers : [activeLayer];
    const layers = targets.filter((layer) => Boolean(getLayerByID(pixelDocument, layer.id)));
    if (layers.length === 0) return;
    const same = <T,>(read: (layer: typeof layers[number]) => T) => {
      const first = read(layers[0]);
      return layers.every((layer) => read(layer) === first) ? first : undefined;
    };
    const sameOpacity = same((layer) => layer.opacity);
    const sameBlendMode = same((layer) => layer.blendMode);
    const sameRole = same((layer) => layer.role);
    const sameVisible = same((layer) => layer.visible);
    const sameLocked = same((layer) => layer.locked);
    const sameAlphaLock = same((layer) => layer.alphaLock);
    const sameContinuous = same((layer) => layer.continuous);
    setLayerPropertiesDialog({
      layerIds: layers.map((layer) => layer.id),
      name: layers.length === 1 ? layers[0].name : "",
      opacity: sameOpacity === undefined ? "" : String(Math.round(sameOpacity * 100)),
      blendMode: sameBlendMode ?? "keep",
      role: sameRole ?? "keep",
      visible: sameVisible === undefined ? "keep" : sameVisible ? "on" : "off",
      locked: sameLocked === undefined ? "keep" : sameLocked ? "on" : "off",
      alphaLock: sameAlphaLock === undefined ? "keep" : sameAlphaLock ? "on" : "off",
      continuous: sameContinuous === undefined ? "keep" : sameContinuous ? "on" : "off",
    });
  };

  const applyLayerPropertiesDialog = () => {
    if (!layerPropertiesDialog) return;
    const update: LayerPropertyUpdate = {};
    const name = layerPropertiesDialog.name.trim();
    if (name && layerPropertiesDialog.layerIds.length === 1) update.name = name;
    if (layerPropertiesDialog.opacity.trim()) {
      const opacity = Number(layerPropertiesDialog.opacity) / 100;
      if (!Number.isFinite(opacity)) {
        setStatus(language === "zh" ? "请输入有效的不透明度" : "Enter a valid opacity");
        return;
      }
      update.opacity = opacity;
    }
    if (layerPropertiesDialog.blendMode !== "keep") update.blendMode = layerPropertiesDialog.blendMode;
    if (layerPropertiesDialog.role !== "keep") update.role = layerPropertiesDialog.role;
    const triState = (value: TriStateProperty) => value === "keep" ? undefined : value === "on";
    const visible = triState(layerPropertiesDialog.visible);
    const locked = triState(layerPropertiesDialog.locked);
    const alphaLock = triState(layerPropertiesDialog.alphaLock);
    const continuous = triState(layerPropertiesDialog.continuous);
    if (visible !== undefined) update.visible = visible;
    if (locked !== undefined) update.locked = locked;
    if (alphaLock !== undefined) update.alphaLock = alphaLock;
    if (continuous !== undefined) update.continuous = continuous;
    const changed = mutateDocument("Layer Properties", () => applyLayerProperties(pixelDocument, layerPropertiesDialog.layerIds, update));
    if (changed) setLayerPropertiesDialog(null);
  };

  const applySlicePropertiesDialog = () => {
    if (!slicePropertiesDialog) return;
    const slice = pixelDocument.slices.find((candidate) => candidate.id === slicePropertiesDialog.sliceId);
    const key = slice?.keys.find((candidate) => candidate.frameId === slicePropertiesDialog.frameId);
    if (!slice || !key) return;
    const numberField = (value: string, fallback: number) => value.trim() === "" ? fallback : Number(value);
    const x = Math.round(numberField(slicePropertiesDialog.x, key.x));
    const y = Math.round(numberField(slicePropertiesDialog.y, key.y));
    const width = Math.max(1, Math.round(numberField(slicePropertiesDialog.width, key.width)));
    const height = Math.max(1, Math.round(numberField(slicePropertiesDialog.height, key.height)));
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || x + width > pixelDocument.width || y + height > pixelDocument.height) {
      setStatus(language === "zh" ? "切片矩形必须位于画布内" : "Slice rectangle must stay inside the canvas");
      return;
    }
    const hasCenter = [slicePropertiesDialog.centerX, slicePropertiesDialog.centerY, slicePropertiesDialog.centerWidth, slicePropertiesDialog.centerHeight].some((value) => value.trim() !== "");
    let center: SliceKeyUpdate["center"] = undefined;
    if (hasCenter) {
      const centerX = Math.max(0, Math.round(numberField(slicePropertiesDialog.centerX, key.center?.x ?? 0)));
      const centerY = Math.max(0, Math.round(numberField(slicePropertiesDialog.centerY, key.center?.y ?? 0)));
      const centerWidth = Math.max(1, Math.round(numberField(slicePropertiesDialog.centerWidth, key.center?.width ?? width)));
      const centerHeight = Math.max(1, Math.round(numberField(slicePropertiesDialog.centerHeight, key.center?.height ?? height)));
      center = {x: centerX, y: centerY, width: centerWidth, height: centerHeight};
    }
    const hasPivot = [slicePropertiesDialog.pivotX, slicePropertiesDialog.pivotY].some((value) => value.trim() !== "");
    const pivot = hasPivot
      ? {x: Math.round(numberField(slicePropertiesDialog.pivotX, key.pivot?.x ?? 0)), y: Math.round(numberField(slicePropertiesDialog.pivotY, key.pivot?.y ?? 0))}
      : undefined;
    const color = `${slicePropertiesDialog.color.slice(0, 7)}${slice.color.slice(7, 9) || "ff"}`;
    const changed = mutateDocument("Slice Properties", () => {
      let changedAny = false;
      if (slice.name !== slicePropertiesDialog.name.trim() || slice.color.toLowerCase() !== color.toLowerCase()) {
        changedAny = updateSlice(pixelDocument, slice.id, {name: slicePropertiesDialog.name, color}) || changedAny;
      }
      changedAny = updateSliceKey(pixelDocument, slice.id, key.frameId, {x, y, width, height, center, pivot}) || changedAny;
      return changedAny;
    });
    if (changed) setSlicePropertiesDialog(null);
  };

  const selectAllLayerCels = () => {
    const addresses = existingCelsForLayers(pixelDocument, [activeLayer.id]);
    if (addresses.length === 0) return;
    activeTab.selectedCelKeys = addresses.map(({layerId, frameId}) => celSelectionKey(layerId, frameId));
    activeTab.celSelectionAnchor = {...addresses[0]};
    activeTab.selectedFrameIds = pixelDocument.frames.filter((frame) => addresses.some((address) => address.frameId === frame.id)).map((frame) => frame.id);
    activeTab.frameSelectionAnchorId = addresses[0].frameId;
    activeTab.activeTagId = undefined;
    activeTab.commandScope = "cels";
    setStatus("Selected All Cels");
    invalidate();
  };

  const selectLinkedCels = () => {
    const source = activeTab.commandScope === "cels" && selectedCels.length
      ? selectedCels
      : [{layerId: activeLayer.id, frameId: pixelDocument.activeFrameId}];
    const addresses = linkedCelsForSelection(pixelDocument, source);
    if (addresses.length === 0) return;
    activeTab.selectedCelKeys = addresses.map(({layerId, frameId}) => celSelectionKey(layerId, frameId));
    activeTab.celSelectionAnchor = {...addresses[0]};
    activeTab.selectedFrameIds = pixelDocument.frames.filter((frame) => addresses.some((address) => address.frameId === frame.id)).map((frame) => frame.id);
    activeTab.frameSelectionAnchorId = addresses[0].frameId;
    activeTab.activeTagId = undefined;
    activeTab.commandScope = "cels";
    setStatus("Selected Linked Cels");
    invalidate();
  };

  const applySelectedCelTransform = () => {
    if (!transformTargetCelsEditable) {
      setStatus("Selected cels are locked");
      return;
    }
    mutateDocument("Transform Cels", () => transformCels(pixelDocument, transformTargetCels, {
      angleDegrees: celRotationDraft,
      offsetX: celOffsetXDraft,
      offsetY: celOffsetYDraft,
    }));
  };

  const rasterizeSelectedCels = () => {
    if (!transformTargetCelsEditable) {
      setStatus("Selected cels are locked");
      return;
    }
    mutateDocument("Rasterize Cels", () => rasterizeCelsToCanvas(pixelDocument, transformTargetCels));
  };

  const handleCelMovePointer = useCallback((
    phase: "start" | "move" | "end",
    start: {x: number; y: number},
    point: {x: number; y: number},
    options: {lockAxis: boolean; autoSelect: boolean},
  ) => {
    if (phase === "start") {
      if (isPlaying) return false;
      const beforeDocument = cloneDocument(pixelDocument);
      const beforeTimeline = captureTabTimeline(activeTab);
      const autoSelect = moveAutoSelect || options.autoSelect;
      const target = autoSelect
        ? findTopmostMovableCelAt(pixelDocument, pixelDocument.activeFrameId, point.x, point.y)
        : {layerId: pixelDocument.activeLayerId, frameId: pixelDocument.activeFrameId};
      if (!target || !getCel(pixelDocument, target.layerId, target.frameId)) return false;

      if (autoSelect) {
        pixelDocument.activeLayerId = target.layerId;
        pixelDocument.activeFrameId = target.frameId;
        activeTab.selectedCelKeys = [celSelectionKey(target.layerId, target.frameId)];
        activeTab.celSelectionAnchor = {...target};
        activeTab.selectedLayerIds = [target.layerId];
        activeTab.layerSelectionAnchorId = target.layerId;
        activeTab.selectedFrameIds = [target.frameId];
        activeTab.frameSelectionAnchorId = target.frameId;
        activeTab.commandScope = "cels";
        activeTab.selection = null;
      }

      const targetKey = celSelectionKey(target.layerId, target.frameId);
      const addresses = activeTab.commandScope === "cels" && activeTab.selectedCelKeys.includes(targetKey)
        ? selectedCelAddresses(pixelDocument, activeTab.selectedCelKeys)
        : [target];
      const origins = new Map<string, {x: number; y: number}>();
      for (const address of addresses) {
        const layer = getLayerByID(pixelDocument, address.layerId);
        const cel = getCel(pixelDocument, address.layerId, address.frameId);
        if (!layer || !cel || !isCelLayer(layer) || layer.role === "background" || isLayerEffectivelyLocked(pixelDocument, layer)) {
          celMoveSessionRef.current = null;
          return false;
        }
        origins.set(cel.id, {x: cel.x, y: cel.y});
      }
      if (origins.size === 0) return false;
      celMoveSessionRef.current = {
        before: beforeDocument,
        beforeTimeline,
        addresses,
        origins,
        deltaX: 0,
        deltaY: 0,
      };
      if (autoSelect) invalidate();
      return true;
    }

    const session = celMoveSessionRef.current;
    if (!session) return false;
    let deltaX = Math.round(point.x - start.x);
    let deltaY = Math.round(point.y - start.y);
    if (options.lockAxis) {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) deltaY = 0;
      else deltaX = 0;
    }
    if (session.deltaX !== deltaX || session.deltaY !== deltaY) {
      for (const address of session.addresses) {
        const cel = getCel(pixelDocument, address.layerId, address.frameId);
        const origin = cel ? session.origins.get(cel.id) : undefined;
        if (cel && origin) Object.assign(cel, origin);
      }
      moveCels(pixelDocument, session.addresses, deltaX, deltaY);
      session.deltaX = deltaX;
      session.deltaY = deltaY;
      activeTab.compositeCache.clear();
      touchTabThumbnailCels(activeTab, session.origins.keys());
      invalidate();
    }
    if (phase === "end") {
      celMoveSessionRef.current = null;
      if (session.deltaX !== 0 || session.deltaY !== 0) {
        history.commit(new EditorDocumentStateCommand(
          session.before,
          pixelDocument,
          "Move Cels",
          activeTab,
          session.beforeTimeline,
          captureTabTimeline(activeTab),
        ));
        setStatus("Move Cels");
      }
    }
    return true;
  }, [activeTab, history, invalidate, isPlaying, moveAutoSelect, pixelDocument, setStatus]);

  const createBrushFromSelection = () => {
    if (!selection || !activeCel || selection.width > MAX_BRUSH_SIZE || selection.height > MAX_BRUSH_SIZE) return;
    const captured = captureSelectionBrush(activeCel, selection);
    if (!captured) return;
    setBitmapBrush(captured.bitmap.mask.some(Boolean) ? captured.bitmap : createBitmapBrush(selection.width, selection.height, maskForSelection(selection)));
    setPatternBrush(null);
    setBrushSize(Math.max(selection.width, selection.height));
    setBrushPreset("custom");
    setSelectedTool("pencil");
  };

  const createPatternFromSelection = () => {
    if (!selection || !activeCel) return;
    const captured = captureSelectionBrush(activeCel, selection);
    if (!captured || !captured.pattern.pixels.some((value, index) => index % 4 === 3 && value > 0)) {
      setStatus(language === "zh" ? "选区没有可用的图案像素" : "Selection has no visible pattern pixels");
      return;
    }
    setPatternBrush(captured.pattern);
    setBitmapBrush(createBitmapBrush(selection.width, selection.height, maskForSelection(selection)));
    setBrushSize(Math.max(selection.width, selection.height));
    setBrushPreset("custom");
    setPatternOrigin({x: 0, y: 0});
    setSelectedTool("pencil");
  };

  const currentBrushSettings: BrushPresetSettings = {
    size: brushSize, shape: brushShape, bitmap: bitmapBrush, pattern: patternBrush,
    alignment: patternAlignment, origin: patternOrigin, spacing: brushSpacing, angle: brushAngle,
    pixelPerfect, pressure: pressureEnabled, inkMode, stabilizer: brushStabilizer,
    dynamics: {enabled: brushDynamicsEnabled, options: brushDynamics},
  };
  const applyBrushPreset = (preset: BrushPresetSettings) => {
    setBrushSize(preset.size); setBrushShape(preset.shape); setBitmapBrush(preset.bitmap);
    setBrushPreset(preset.bitmap ? "custom" : preset.shape);
    setPatternBrush(preset.pattern); setPatternAlignment(preset.alignment); setPatternOrigin(preset.origin);
    setBrushSpacing(preset.spacing); setBrushAngle(preset.angle); setPixelPerfect(preset.pixelPerfect);
    setPressureEnabled(preset.pressure); setInkMode(preset.inkMode); setBrushStabilizer(preset.stabilizer);
    setBrushDynamicsEnabled(preset.dynamics.enabled); setBrushDynamics(preset.dynamics.options);
  };

  const selectOpaqueContent = () => {
    const next = layerOpaqueContentSelection(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId);
    setSelection(combineSelections(selection, next, selectionOperation));
  };

  const selectLayerOpaqueContent = (layerId: string) => {
    const next = layerOpaqueContentSelection(pixelDocument, layerId, pixelDocument.activeFrameId);
    if (!next) {
      const layer = getLayerByID(pixelDocument, layerId);
      setStatus(!layer
        ? (language === "zh" ? "无法选择图层内容" : "Layer content cannot be selected")
        : layer.role === "reference"
          ? (language === "zh" ? "参考图层不能用于变换" : "Reference layers cannot be transformed")
          : isLayerEffectivelyLocked(pixelDocument, layer)
            ? (language === "zh" ? "图层已锁定" : "Layer is locked")
            : isTilemapLayer(layer)
              ? (language === "zh" ? "图块地图没有像素选区" : "Tilemap layers have no pixel selection")
              : (language === "zh" ? "当前帧没有不透明内容" : "The current frame has no opaque content"));
      return false;
    }
    setSelection(next);
    setStatus(language === "zh" ? "已选择图层不透明内容" : "Selected layer opaque content");
    return true;
  };

  const selectForegroundColor = () => {
    if (!activeCel) return;
    setSelection(combineSelections(selection, selectByColor(activeCel.pixels, activeCel.width, activeCel.height, foregroundRGBA, selectionTolerance), selectionOperation));
  };

  const adjustSelection = (operation: "invert" | "grow" | "shrink" | "border") => {
    const amount = Math.max(1, Math.min(256, Math.round(selectionAdjustAmount)));
    const next = operation === "invert"
      ? invertSelection(selection, pixelDocument.width, pixelDocument.height)
      : operation === "grow"
        ? growSelection(selection, amount, pixelDocument.width, pixelDocument.height)
        : operation === "shrink"
          ? shrinkSelection(selection, amount, pixelDocument.width, pixelDocument.height)
          : borderSelection(selection, amount, pixelDocument.width, pixelDocument.height);
    setSelection(next);
  };

  const createSliceFromSelection = () => {
    if (!selection) return;
    createSliceFromBounds(selection);
  };

  const createSliceFromBounds = (bounds: Selection) => {
    const touched = touchedSliceIds(sliceOverlays, bounds);
    let createdId = "";
    if (mutateDocument("Add Slice", () => {
      const created = addSlice(pixelDocument, `Slice ${pixelDocument.slices.length + 1}`, {
        frameId: pixelDocument.activeFrameId,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pivot: {x: Math.floor(bounds.width / 2), y: Math.floor(bounds.height / 2)},
      });
      if (created) created.color = reuseSliceColor(pixelDocument, `${preferences.guides.sliceColor}ff`);
      createdId = created?.id ?? "";
      return Boolean(created);
    })) {
      setActiveSliceId(createdId);
      setSelectedSliceIds([...new Set([...touched, createdId])]);
    }
  };

  const openSliceProperties = (sliceID: string, frameID = pixelDocument.activeFrameId) => {
    const slice = pixelDocument.slices.find((candidate) => candidate.id === sliceID);
    if (!slice) return;
    const key = slice.keys.find((candidate) => candidate.frameId === frameID) ?? slice.keys[0];
    if (!key) return;
    setActiveSliceId(slice.id);
    setSlicePropertiesDialog({
      sliceId: slice.id,
      frameId: key.frameId,
      name: slice.name,
      color: slice.color.slice(0, 7),
      x: String(key.x),
      y: String(key.y),
      width: String(key.width),
      height: String(key.height),
      centerX: key.center ? String(key.center.x) : "",
      centerY: key.center ? String(key.center.y) : "",
      centerWidth: key.center ? String(key.center.width) : "",
      centerHeight: key.center ? String(key.center.height) : "",
      pivotX: key.pivot ? String(key.pivot.x) : "",
      pivotY: key.pivot ? String(key.pivot.y) : "",
    });
  };

  const selectedSliceBatchIDs = selectedSliceIds.filter((id) => pixelDocument.slices.some((slice) => slice.id === id));
  const sliceBatchIDs = selectedSliceBatchIDs.length > 0 ? selectedSliceBatchIDs : activeSlice ? [activeSlice.id] : [];
  const moveSelectedSlices = () => {
    mutateDocument("Move Slices", () => moveSlices(pixelDocument, sliceBatchIDs, Math.round(sliceMoveX), Math.round(sliceMoveY)));
  };
  const scaleSelectedSlices = () => {
    mutateDocument("Scale Slices", () => scaleSlices(pixelDocument, sliceBatchIDs, sliceScaleX / 100, sliceScaleY / 100));
  };
  const deleteSelectedSlices = () => {
    if (!mutateDocument("Delete Slices", () => deleteSlices(pixelDocument, sliceBatchIDs))) return;
    setSelectedSliceIds([]);
    setActiveSliceId("");
  };

  const addCurrentSliceKey = () => {
    if (!activeSlice) return;
    mutateDocument("Add Slice Key", () => Boolean(addSliceKey(pixelDocument, activeSlice.id, pixelDocument.activeFrameId)));
  };

  const deleteCurrentSliceKey = () => {
    if (!activeSlice || !activeSliceKey) return;
    mutateDocument("Delete Slice Key", () => deleteSliceKey(pixelDocument, activeSlice.id, pixelDocument.activeFrameId));
  };

  const editCurrentSliceKey = (update: SliceKeyUpdate, label = "Edit Slice") => {
    if (!activeSlice || !activeSliceKey) return;
    mutateDocument(label, () => updateSliceKey(pixelDocument, activeSlice.id, pixelDocument.activeFrameId, update));
  };

  const editCurrentSliceGeometry = (update: SliceKeyUpdate) => {
    if (!activeSliceKey) return;
    const width = update.width ?? activeSliceKey.width;
    const height = update.height ?? activeSliceKey.height;
    const center = activeSliceKey.center;
    const nextCenter = center
      ? {
        x: Math.max(0, Math.min(center.x, Math.max(0, width - 1))),
        y: Math.max(0, Math.min(center.y, Math.max(0, height - 1))),
        width: Math.max(1, Math.min(center.width, width)),
        height: Math.max(1, Math.min(center.height, height)),
      }
      : undefined;
    if (nextCenter) {
      nextCenter.x = Math.min(nextCenter.x, width - nextCenter.width);
      nextCenter.y = Math.min(nextCenter.y, height - nextCenter.height);
    }
    editCurrentSliceKey({...update, ...(center ? {center: nextCenter} : {})});
  };

  const selectFrame = (frameId: string, extend = false, toggle = false) => {
    const frameIndex = pixelDocument.frames.findIndex((frame) => frame.id === frameId);
    if (frameIndex < 0) return null;
    const focusedTagId = activeTab.activeTagId;
    const preserveTagFocus = Boolean(focusedTagId && tagContainsFrame(pixelDocument, focusedTagId, frameId));
    let nextActiveFrameId = frameId;
    if (extend) {
      const anchorIndex = Math.max(0, pixelDocument.frames.findIndex((frame) => frame.id === activeTab.frameSelectionAnchorId));
      const start = Math.min(anchorIndex, frameIndex);
      const end = Math.max(anchorIndex, frameIndex);
      activeTab.selectedFrameIds = pixelDocument.frames.slice(start, end + 1).map((frame) => frame.id);
    } else if (toggle) {
      const selected = new Set(selectedFrameIds);
      if (selected.has(frameId) && selected.size > 1) selected.delete(frameId);
      else selected.add(frameId);
      activeTab.selectedFrameIds = pixelDocument.frames.filter((frame) => selected.has(frame.id)).map((frame) => frame.id);
      if (!selected.has(frameId)) {
        nextActiveFrameId = selected.has(pixelDocument.activeFrameId)
          ? pixelDocument.activeFrameId
          : activeTab.selectedFrameIds[0];
      }
      activeTab.frameSelectionAnchorId = nextActiveFrameId;
    } else {
      activeTab.selectedFrameIds = [frameId];
      activeTab.frameSelectionAnchorId = frameId;
    }
    // A focused tag remains active while selection stays inside its range.
    // Clicking or extending outside the range intentionally returns to the
    // document-wide/manual-loop view.
    activeTab.activeTagId = preserveTagFocus ? focusedTagId : undefined;
    setTabCommandScope(activeTab, "frame");
    pixelDocument.activeFrameId = nextActiveFrameId;
    activeTab.selection = null;
    invalidate();
    return nextActiveFrameId;
  };

  const navigateFrame = (direction: -1 | 1) => {
    if (!hasOpenDocument) return false;
    if (isPlaying) {
      setStatus("Pause playback to edit");
      return false;
    }
    const nextFrameId = activeTab.activeTagId
      ? adjacentFocusedFrameId(
        pixelDocument,
        pixelDocument.activeFrameId,
        direction,
        {tagId: activeTab.activeTagId},
        activeTab.loopStartFrameId,
        activeTab.loopEndFrameId,
      )
      : adjacentFrameID(pixelDocument, pixelDocument.activeFrameId, direction);
    if (!nextFrameId) return false;
    return Boolean(selectFrame(nextFrameId));
  };

  const selectLayer = (layerId: string, extend = false, toggle = false) => {
    const ordered = timelineEntries.map(({layer}) => layer.id);
    if (!ordered.includes(layerId)) return;
    const selected = new Set(activeTab.selectedLayerIds.filter((id) => ordered.includes(id)));
    if (extend) {
      const anchorIndex = Math.max(0, ordered.indexOf(activeTab.layerSelectionAnchorId));
      const targetIndex = ordered.indexOf(layerId);
      selected.clear();
      for (let index = Math.min(anchorIndex, targetIndex); index <= Math.max(anchorIndex, targetIndex); index += 1) selected.add(ordered[index]);
    } else if (toggle) {
      if (selected.has(layerId) && selected.size > 1) selected.delete(layerId);
      else selected.add(layerId);
      activeTab.layerSelectionAnchorId = layerId;
    } else {
      selected.clear();
      selected.add(layerId);
      activeTab.layerSelectionAnchorId = layerId;
    }
    activeTab.selectedLayerIds = ordered.filter((id) => selected.has(id));
    pixelDocument.activeLayerId = selected.has(layerId) ? layerId : activeTab.selectedLayerIds[0];
    setTabCommandScope(activeTab, "layer");
    setRenamingLayerId(null);
    setStatus(getLayerByID(pixelDocument, pixelDocument.activeLayerId)?.name ?? "Ready");
    invalidate();
  };

  const layerTargetsFor = (layerId = activeLayer.id) => (
    activeTab.commandScope === "layer" && activeTab.selectedLayerIds.includes(layerId)
      ? pixelDocument.layers.filter((layer) => activeTab.selectedLayerIds.includes(layer.id))
      : pixelDocument.layers.filter((layer) => layer.id === layerId)
  );

  const mutateSelectedLayers = (label: string, mutation: (layerId: string) => boolean) => mutateDocument(label, () => {
    let changed = false;
    for (const layer of [...layerTargetsFor()].reverse()) changed = mutation(layer.id) || changed;
    if (changed) setTabCommandScope(activeTab, "layer");
    return changed;
  });

  const selectedLayerRoots = selectedLayers.filter((layer) => {
    let parentId = layer.parentId;
    while (parentId) {
      if (selectedLayerIdSet.has(parentId)) return false;
      parentId = getLayerByID(pixelDocument, parentId)?.parentId;
    }
    return true;
  });

  const duplicateSelectedLayers = () => mutateDocument("Duplicate Layers", () => {
    const duplicatedIds: string[] = [];
    for (const source of selectedLayerRoots) {
      const duplicate = duplicateLayer(pixelDocument, source.id, nextCopyName(pixelDocument, source.name, ui.copySuffix));
      if (duplicate) duplicatedIds.push(duplicate.id);
    }
    if (duplicatedIds.length === 0) return false;
    activeTab.selectedLayerIds = duplicatedIds;
    activeTab.layerSelectionAnchorId = duplicatedIds[0];
    pixelDocument.activeLayerId = duplicatedIds.at(-1) ?? duplicatedIds[0];
    setTabCommandScope(activeTab, "layer");
    return true;
  });

  const moveSelectedLayers = (direction: "up" | "down") => mutateDocument("Move Layers", () => {
    const ordered = [...selectedLayerRoots].sort((left, right) => pixelDocument.layers.indexOf(left) - pixelDocument.layers.indexOf(right));
    const sequence = direction === "up" ? ordered.reverse() : ordered;
    let changed = false;
    for (const layer of sequence) changed = moveLayer(pixelDocument, layer.id, direction) || changed;
    if (changed) setTabCommandScope(activeTab, "layer");
    return changed;
  });

  const mergeSelectedLayers = () => mutateDocument("Merge Selected Layers", () => {
    const ordered = [...selectedLayers].sort((left, right) => pixelDocument.layers.indexOf(left) - pixelDocument.layers.indexOf(right));
    let changed = false;
    while (ordered.length > 1) {
      const top = ordered.pop();
      if (!top || !mergeLayerDown(pixelDocument, top.id)) break;
      changed = true;
    }
    if (!changed) return false;
    const remaining = ordered[0];
    activeTab.selectedLayerIds = remaining ? [remaining.id] : [pixelDocument.activeLayerId];
    activeTab.layerSelectionAnchorId = activeTab.selectedLayerIds[0];
    setTabCommandScope(activeTab, "layer");
    return true;
  });

  const flattenDocumentLayers = () => mutateDocument("Flatten Visible Layers", () => {
    const flattened = flattenVisibleLayers(pixelDocument, language === "zh" ? "拼合图层" : "Flattened");
    activeTab.selectedLayerIds = [flattened.id];
    activeTab.layerSelectionAnchorId = flattened.id;
    setTabCommandScope(activeTab, "layer");
    return true;
  });

  const createTilemapLayer = () => mutateDocument("Add Tilemap Layer", () => {
    const tileset = createTileset({
      name: language === "zh" ? "图块集" : "Tileset",
      tileWidth: pixelDocument.settings.gridWidth,
      tileHeight: pixelDocument.settings.gridHeight,
    });
    pixelDocument.tilesets.push(tileset);
    const layer = addTilemapLayer(pixelDocument, tileset.id, language === "zh" ? "图块地图" : "Tilemap");
    if (!layer) return false;
    activeTab.selectedLayerIds = [layer.id];
    activeTab.layerSelectionAnchorId = layer.id;
    setSelectedTileID(0);
    setSelectedTileIDs([]);
    setTabCommandScope(activeTab, "layer");
    return true;
  });

  const createSharedTilemapLayer = () => mutateDocument("Add Shared Tilemap Layer", () => {
    if (!activeTileset) return false;
    const layer = addTilemapLayer(pixelDocument, activeTileset.id, language === "zh" ? "共享图块地图" : "Shared Tilemap");
    if (!layer) return false;
    activeTab.selectedLayerIds = [layer.id];
    activeTab.layerSelectionAnchorId = layer.id;
    setTabCommandScope(activeTab, "layer");
    return true;
  });

  const renameActiveTileset = () => {
    if (!activeTileset) return;
    const name = window.prompt(language === "zh" ? "图块集名称" : "Tileset name", activeTileset.name)?.trim();
    if (!name || name === activeTileset.name) return;
    mutateDocument("Rename Tileset", () => {
      activeTileset.name = name;
      return true;
    });
  };

  const activeTilesetReferences = useMemo(() => {
    return collectTilesetReferences(pixelDocument, activeTileset?.id ?? "");
  }, [activeTileset, pixelDocument, revision]);

  const rebuildTilesetGridCaches = (tileset: Tileset) => {
    const layerIDs = new Set(pixelDocument.layers
      .filter((layer) => layer.kind === "tilemap" && layer.tilesetId === tileset.id)
      .map((layer) => layer.id));
    for (const cel of Object.values(pixelDocument.cels)) {
      if (!layerIDs.has(cel.layerId) || !cel.tilemap) continue;
      const size = tilemapPixelSize(tileset, cel.tilemap);
      cel.width = size.width;
      cel.height = size.height;
      if (cel.terrainmap) {
        const allCells = Array.from({length: cel.terrainmap.terrains.length}, (_, index) => ({
          column: index % cel.terrainmap!.columns,
          row: Math.floor(index / cel.terrainmap!.columns),
        }));
        recalculateTerrainCells(
          cel.terrainmap,
          tileset.terrains,
          tilesetGridLayout(tileset, cel.tilemap),
          cel.tilemap.tiles,
          allCells,
        );
      }
    }
    refreshTilemapCaches(pixelDocument);
  };

  const assignActiveLayerTileset = (tilesetID: string) => mutateDocument("Change Layer Tileset", () => {
    if (activeLayer.kind !== "tilemap" || activeLayer.tilesetId === tilesetID) return false;
    const tileset = pixelDocument.tilesets.find((candidate) => candidate.id === tilesetID);
    if (!tileset) return false;
    activeLayer.tilesetId = tileset.id;
    const validTileIDs = new Set(tileset.tiles.map((tile) => tile.id));
    for (const cel of Object.values(pixelDocument.cels)) {
      if (cel.layerId !== activeLayer.id || !cel.tilemap) continue;
      for (let index = 0; index < cel.tilemap.tiles.length; index += 1) {
        if (!validTileIDs.has(tileValueIndex(cel.tilemap.tiles[index]))) cel.tilemap.tiles[index] = 0;
      }
      delete cel.tilemap.gridOffset;
      cel.terrainmap = undefined;
      const size = tilemapPixelSize(tileset, cel.tilemap);
      cel.width = size.width;
      cel.height = size.height;
    }
    rebuildTilesetGridCaches(tileset);
    setSelectedTileID(0);
    setSelectedTileIDs([]);
    setSelectedTerrainID(0);
    return true;
  });

  const createBlankTilesetForLayer = () => mutateDocument("Create Tileset", () => {
    if (activeLayer.kind !== "tilemap") return false;
    const tileset = createTileset({
      name: language === "zh" ? "新图块集" : "New Tileset",
      tileWidth: activeTileset?.tileWidth ?? pixelDocument.settings.gridWidth,
      tileHeight: activeTileset?.tileHeight ?? pixelDocument.settings.gridHeight,
      grid: activeTileset ? {...activeTileset.grid} : {kind: "orthogonal"},
    });
    pixelDocument.tilesets.push(tileset);
    activeLayer.tilesetId = tileset.id;
    for (const cel of Object.values(pixelDocument.cels)) {
      if (cel.layerId !== activeLayer.id || !cel.tilemap) continue;
      cel.tilemap.tiles.fill(0);
      delete cel.tilemap.gridOffset;
      cel.terrainmap = undefined;
      const size = tilemapPixelSize(tileset, cel.tilemap);
      cel.width = size.width;
      cel.height = size.height;
    }
    rebuildTilesetGridCaches(tileset);
    setSelectedTileID(0);
    setSelectedTileIDs([]);
    setSelectedTerrainID(0);
    return true;
  });

  const duplicateActiveTileset = () => mutateDocument("Duplicate Tileset", () => {
    if (!activeTileset || activeLayer.kind !== "tilemap") return false;
    const copy = createTileset({
      name: `${activeTileset.name} ${language === "zh" ? "副本" : "Copy"}`,
      tileWidth: activeTileset.tileWidth,
      tileHeight: activeTileset.tileHeight,
      grid: {...activeTileset.grid},
      terrains: activeTileset.terrains,
      tiles: activeTileset.tiles,
    });
    pixelDocument.tilesets.push(copy);
    activeLayer.tilesetId = copy.id;
    rebuildTilesetGridCaches(copy);
    return true;
  });

  const deleteActiveTileset = () => {
    if (!activeTileset) return;
    const fallback = pixelDocument.tilesets.find((candidate) => candidate.id !== activeTileset.id);
    if (!fallback) {
      setStatus(language === "zh" ? "不能删除项目中的最后一个图块集" : "The last Tileset in a project cannot be deleted");
      return;
    }
    const message = language === "zh"
      ? `删除“${activeTileset.name}”将把 ${activeTilesetReferences.layers.length} 个图层切换到“${fallback.name}”，并清除不兼容单元格与地形。继续吗？`
      : `Delete "${activeTileset.name}"? ${activeTilesetReferences.layers.length} layers will switch to "${fallback.name}", and incompatible cells and Terrain data will be cleared.`;
    if (!window.confirm(message)) return;
    mutateDocument("Delete Tileset", () => {
      const layerIDs = new Set(pixelDocument.layers
        .filter((layer) => layer.kind === "tilemap" && layer.tilesetId === activeTileset.id)
        .map((layer) => layer.id));
      const validTileIDs = new Set(fallback.tiles.map((tile) => tile.id));
      for (const layer of pixelDocument.layers) {
        if (layerIDs.has(layer.id)) layer.tilesetId = fallback.id;
      }
      for (const cel of Object.values(pixelDocument.cels)) {
        if (!layerIDs.has(cel.layerId) || !cel.tilemap) continue;
        for (let index = 0; index < cel.tilemap.tiles.length; index += 1) {
          if (!validTileIDs.has(tileValueIndex(cel.tilemap.tiles[index]))) cel.tilemap.tiles[index] = 0;
        }
        delete cel.tilemap.gridOffset;
        cel.terrainmap = undefined;
        const size = tilemapPixelSize(fallback, cel.tilemap);
        cel.width = size.width;
        cel.height = size.height;
      }
      pixelDocument.tilesets.splice(pixelDocument.tilesets.indexOf(activeTileset), 1);
      rebuildTilesetGridCaches(fallback);
      setSelectedTileID(0);
      setSelectedTileIDs([]);
      setSelectedTerrainID(0);
      return true;
    });
  };

  const updateActiveTilesetGrid = (value: string) => mutateDocument("Change Tilemap Grid", () => {
    if (!activeTileset) return false;
    const nextGrid = value === "isometric"
      ? {
        kind: "isometric" as const,
        cellWidth: activeTileset.tileWidth,
        cellHeight: activeTileset.tileHeight,
        anchorX: Math.round(activeTileset.tileWidth / 2),
        anchorY: activeTileset.tileHeight,
      }
      : value === "hex-pointy-odd"
        ? {kind: "hexagonal" as const, orientation: "pointy" as const, offset: "odd-r" as const}
        : value === "hex-pointy-even"
          ? {kind: "hexagonal" as const, orientation: "pointy" as const, offset: "even-r" as const}
          : value === "hex-flat-odd"
            ? {kind: "hexagonal" as const, orientation: "flat" as const, offset: "odd-q" as const}
            : value === "hex-flat-even"
              ? {kind: "hexagonal" as const, orientation: "flat" as const, offset: "even-q" as const}
              : {kind: "orthogonal" as const};
    if (JSON.stringify(nextGrid) === JSON.stringify(activeTileset.grid)) return false;
    activeTileset.grid = nextGrid;
    const layerIDs = new Set(pixelDocument.layers
      .filter((layer) => layer.kind === "tilemap" && layer.tilesetId === activeTileset.id)
      .map((layer) => layer.id));
    for (const cel of Object.values(pixelDocument.cels)) {
      if (layerIDs.has(cel.layerId) && cel.tilemap) delete cel.tilemap.gridOffset;
    }
    for (const terrain of activeTileset.terrains) {
      terrain.neighborMode = nextGrid.kind === "hexagonal" ? "edge6" : "edge4";
      const maximumMask = terrain.neighborMode === "edge6" ? 0x3f : 0x0f;
      terrain.rules = terrain.rules.filter((rule) => rule.mask <= maximumMask);
    }
    rebuildTilesetGridCaches(activeTileset);
    return true;
  });

  const updateActiveIsometricGrid = (
    field: "cellWidth" | "cellHeight" | "anchorX" | "anchorY",
    value: number,
  ) => mutateDocument("Change Isometric Grid", () => {
    if (!activeTileset || activeTileset.grid.kind !== "isometric" || !Number.isFinite(value)) return false;
    const next = Math.round(value);
    const maximum = field === "anchorX"
      ? activeTileset.tileWidth
      : field === "anchorY"
        ? activeTileset.tileHeight
        : 4096;
    const minimum = field === "cellWidth" || field === "cellHeight" ? 1 : 0;
    const clamped = Math.max(minimum, Math.min(maximum, next));
    if (activeTileset.grid[field] === clamped) return false;
    activeTileset.grid = {...activeTileset.grid, [field]: clamped};
    rebuildTilesetGridCaches(activeTileset);
    return true;
  });

  const updateActiveHexSideLength = (value: number) => {
    if (!activeTileset || activeTileset.grid.kind !== "hexagonal" || !Number.isFinite(value)) return;
    const side = Math.max(1, Math.min(1024, Math.round(value)));
    if (activeTileset.tiles.length > 0 || tilemapBuffersForTileset(activeTileset.id).some((tilemap) => tilemap.tiles.some((cell) => cell !== 0))) {
      setStatus(language === "zh" ? "仅空图块集可以修改六边形边长" : "Hex side length can only change on an empty Tileset");
      return;
    }
    mutateDocument("Change Hex Side Length", () => {
      if (activeTileset.grid.kind !== "hexagonal") return false;
      const width = activeTileset.grid.orientation === "pointy" ? Math.max(1, Math.round(Math.sqrt(3) * side)) : side * 2;
      const height = activeTileset.grid.orientation === "pointy" ? side * 2 : Math.max(1, Math.round(Math.sqrt(3) * side));
      if (width === activeTileset.tileWidth && height === activeTileset.tileHeight) return false;
      activeTileset.tileWidth = width;
      activeTileset.tileHeight = height;
      rebuildTilesetGridCaches(activeTileset);
      return true;
    });
  };

  const convertActiveLayerToTiles = () => mutateDocument("Convert Layer to Tilemap", () => {
    if (!isImageLayer(activeLayer)) return false;
    const result = convertImageLayerToTilemap(pixelDocument, activeLayer.id, {
      tileWidth: pixelDocument.settings.gridWidth,
      tileHeight: pixelDocument.settings.gridHeight,
      palette: pixelDocument.colorMode === "indexed" ? pixelDocument.palette.colors : undefined,
      transparentIndex: pixelDocument.palette.transparentIndex,
    });
    const layerIndex = pixelDocument.layers.findIndex((layer) => layer.id === activeLayer.id);
    if (layerIndex < 0) return false;
    pixelDocument.tilesets.push(result.tileset);
    pixelDocument.layers[layerIndex] = result.layer;
    for (const cel of result.cels) pixelDocument.cels[`${cel.layerId}:${cel.frameId}`] = cel;
    activeTab.selectedLayerIds = [result.layer.id];
    activeTab.layerSelectionAnchorId = result.layer.id;
    setSelectedTileID(result.tileset.tiles[0]?.id ?? 0);
    setSelectedTileIDs(result.tileset.tiles[0] ? [result.tileset.tiles[0].id] : []);
    setTabCommandScope(activeTab, "layer");
    return true;
  });

  const tilemapBuffersForTileset = (tilesetID: string): TilemapData[] => {
    const tilemapLayerIDs = new Set(pixelDocument.layers
      .filter((layer) => layer.kind === "tilemap" && layer.tilesetId === tilesetID)
      .map((layer) => layer.id));
    const buffers: TilemapData[] = [];
    const seen = new Set<TilemapData>();
    for (const cel of Object.values(pixelDocument.cels)) {
      if (!tilemapLayerIDs.has(cel.layerId) || !cel.tilemap || seen.has(cel.tilemap)) continue;
      seen.add(cel.tilemap);
      buffers.push(cel.tilemap);
    }
    return buffers;
  };

  const addEmptyTile = () => {
    if (!activeTileset) return;
    let nextID = 0;
    mutateDocument("Add Tile", () => {
      const pixels = new Uint8ClampedArray(activeTileset.tileWidth * activeTileset.tileHeight * 4);
      const indexes = pixelDocument.colorMode === "indexed"
        ? new Uint8Array(activeTileset.tileWidth * activeTileset.tileHeight).fill(pixelDocument.palette.transparentIndex)
        : undefined;
      const result = addTileInPlace(activeTileset, pixels, indexes);
      nextID = result.tile.id;
      return result.created;
    });
    if (nextID) {
      setSelectedTileID(nextID);
      setSelectedTileIDs([nextID]);
    }
  };

  const importTilesetPNG = async () => {
    if (!activeTileset) return;
    try {
      const decoded = hasWailsAppBridge()
        ? await ImportPNG(language).then((payload) => payload ? parsePNGResponse(payload) : null)
        : await chooseBrowserFile("image/png").then((file) => file ? decodeBrowserPNG(file) : null);
      if (!decoded) return;
      const readOffset = (label: string, fallback: number) => {
        const value = window.prompt(label, String(fallback));
        return value === null ? null : Math.max(0, Math.round(Number(value) || 0));
      };
      const readSize = (label: string, fallback: number) => {
        const value = window.prompt(label, String(fallback));
        if (value === null) return null;
        const size = Math.round(Number(value));
        if (!Number.isFinite(size) || size < 1 || size > 2048) throw new Error(`${label} must be from 1 to 2048`);
        return size;
      };
      const tileWidth = readSize(language === "zh" ? "图块宽度" : "Tile width", activeTileset.tileWidth);
      if (tileWidth === null) return;
      const tileHeight = readSize(language === "zh" ? "图块高度 / 视觉高度" : "Tile / visual height", activeTileset.tileHeight);
      if (tileHeight === null) return;
      const changesDimensions = tileWidth !== activeTileset.tileWidth || tileHeight !== activeTileset.tileHeight;
      if (changesDimensions && (activeTileset.tiles.length > 0 || tilemapBuffersForTileset(activeTileset.id).some((tilemap) => tilemap.tiles.some((value) => value !== 0)))) {
        throw new Error("Tile dimensions can only change while the Tileset and its maps are empty");
      }
      const offsetX = readOffset(language === "zh" ? "水平偏移" : "Offset X", 0);
      if (offsetX === null) return;
      const offsetY = readOffset(language === "zh" ? "垂直偏移" : "Offset Y", 0);
      if (offsetY === null) return;
      const paddingX = readOffset(language === "zh" ? "水平间距" : "Padding X", 0);
      if (paddingX === null) return;
      const paddingY = readOffset(language === "zh" ? "垂直间距" : "Padding Y", 0);
      if (paddingY === null) return;
      const transparentColor = window.prompt(
        language === "zh" ? "透明色（留空表示保留原 Alpha，格式 #RRGGBB）" : "Transparent color (blank keeps source alpha, format #RRGGBB)",
        "",
      );
      if (transparentColor === null) return;
      if (transparentColor !== "" && !/^#[\da-f]{6}$/i.test(transparentColor)) throw new Error("Transparent color must use #RRGGBB");
      const sourcePixels = decoded.pixels.slice();
      if (transparentColor) {
        const [red, green, blue] = [
          Number.parseInt(transparentColor.slice(1, 3), 16),
          Number.parseInt(transparentColor.slice(3, 5), 16),
          Number.parseInt(transparentColor.slice(5, 7), 16),
        ];
        for (let offset = 0; offset < sourcePixels.length; offset += 4) {
          if (sourcePixels[offset] === red && sourcePixels[offset + 1] === green && sourcePixels[offset + 2] === blue) {
            sourcePixels[offset + 3] = 0;
          }
        }
      }
      const sliced = sliceSpriteSheet(sourcePixels, decoded.width, decoded.height, {
        frameWidth: tileWidth,
        frameHeight: tileHeight,
        layout: "matrix",
        offsetX,
        offsetY,
        paddingX,
        paddingY,
      });
      let selected = 0;
      mutateDocument("Import Tileset PNG", () => {
        activeTileset.tileWidth = tileWidth;
        activeTileset.tileHeight = tileHeight;
        if (activeTileset.grid.kind === "isometric") {
          activeTileset.grid.anchorX = Math.min(activeTileset.grid.anchorX, tileWidth);
          activeTileset.grid.anchorY = Math.min(activeTileset.grid.anchorY, tileHeight);
        }
        let changed = false;
        for (const pixels of sliced.frames) {
          const normalized = normalizeImportedTilePixels(pixels, tileWidth, tileHeight,
            pixelDocument.colorMode, pixelDocument.palette);
          const result = addTileInPlace(activeTileset, normalized.pixels, normalized.indexes);
          if (!selected) selected = result.tile.id;
          changed = result.created || changed;
        }
        rebuildTilesetGridCaches(activeTileset);
        return changed;
      });
      if (selected) {
        setSelectedTileID(selected);
        setSelectedTileIDs([selected]);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tileset import failed");
    }
  };

  const exportTilesetBundle = async () => {
    if (!activeTileset || !activeCel?.tilemap || activeTileset.tiles.length === 0) return;
    try {
      const columns = Math.max(1, Math.ceil(Math.sqrt(activeTileset.tiles.length)));
      const sheet = buildSpriteSheet(
        activeTileset.tiles.map((tile) => tile.pixels),
        activeTileset.tileWidth,
        activeTileset.tileHeight,
        {layout: "grid", columns, scale: 1, borderPadding: 0, framePadding: 0},
      );
      const stem = `${activeTileset.name.trim().replace(/[^\w.-]+/g, "-") || "tileset"}-tiles`;
      const metadata = exportTilemapJson({
        tileset: activeTileset,
        tilemap: activeCel.tilemap,
        terrainmap: activeCel.terrainmap,
        cel: activeCel,
        tilesetImage: {
          file: `${stem}.png`,
          width: sheet.width,
          height: sheet.height,
          tiles: activeTileset.tiles.map((tile, index) => ({tileId: tile.id, ...sheet.frames[index]})),
        },
      });
      if (hasWailsAppBridge()) {
        const path = await SavePackedAtlas(sheet.width, sheet.height, bytesToBase64(sheet.pixels), metadata, true, language);
        if (path) setStatus(`${language === "zh" ? "已导出" : "Exported"} ${path}`);
      } else {
        downloadBlob(await browserPNGBlob(sheet.width, sheet.height, sheet.pixels), `${stem}.png`);
        downloadBlob(new Blob([metadata], {type: "application/json"}), `${stem}.json`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tileset export failed");
    }
  };

  const importTilesetBundle = async () => {
    if (!activeTileset || !activeCel?.tilemap) return;
    try {
      let metadataName: string;
      let metadataText: string;
      if (hasWailsAppBridge()) {
        const payload = await OpenTilemapData(language);
        if (!payload) return;
        const decoded = JSON.parse(payload) as {name?: unknown; content?: unknown};
        if (typeof decoded.name !== "string" || typeof decoded.content !== "string") throw new Error("Tileset metadata response is invalid");
        metadataName = decoded.name;
        metadataText = decoded.content;
      } else {
        const file = await chooseBrowserFile(".json,application/json");
        if (!file) return;
        metadataName = file.name;
        metadataText = await file.text();
      }
      const imported = importTilemapJson(metadataText);
      if (!imported.tilesetImage) throw new Error("Tileset metadata does not contain PNG rectangles");
      const image = hasWailsAppBridge()
        ? await ImportPNG(language).then((payload) => payload ? parsePNGResponse(payload) : null)
        : await chooseBrowserFile("image/png").then((file) => file ? decodeBrowserPNG(file) : null);
      if (!image) return;
      if (image.name !== imported.tilesetImage.file) {
        throw new Error(`Tileset metadata ${metadataName} expects ${imported.tilesetImage.file}, received ${image.name}`);
      }
      if (image.width !== imported.tilesetImage.width || image.height !== imported.tilesetImage.height) {
        throw new Error("Tileset PNG dimensions do not match its metadata");
      }
      let selection = {selectedTileId: 0, selectedTerrainId: 0};
      mutateDocument("Import Tileset Bundle", () => {
        selection = importTilesetBundleIntoDocument(
          pixelDocument,
          activeTileset.id,
          activeCel.id,
          imported,
          image,
        );
        return true;
      });
      setSelectedTileID(selection.selectedTileId);
      setSelectedTileIDs(selection.selectedTileId ? [selection.selectedTileId] : []);
      setSelectedTerrainID(selection.selectedTerrainId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tileset bundle import failed");
    }
  };

  const exportActiveTilemapData = async (format: "json" | "csv") => {
    if (!activeTileset || !activeCel?.tilemap) return;
    try {
      const content = format === "json"
        ? exportTilemapJson({
          tileset: activeTileset,
          tilemap: activeCel.tilemap,
          terrainmap: activeCel.terrainmap,
          cel: activeCel,
        })
        : exportTilemapCsv({
          tileset: activeTileset,
          tilemap: activeCel.tilemap,
          terrainmap: activeCel.terrainmap,
          cel: activeCel,
        });
      const stem = `${displayProjectName(pixelDocument.name).replace(/\.pixio$/i, "")}-${activeLayer.name.replace(/\s+/g, "-")}`;
      if (hasWailsAppBridge()) {
        const path = await SaveTilemapData(content, format, stem, language);
        if (path) setStatus(`${language === "zh" ? "已导出" : "Exported"} ${path}`);
      } else {
        downloadBlob(new Blob([content], {type: format === "json" ? "application/json" : "text/csv;charset=utf-8"}), `${stem}.${format}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tilemap export failed");
    }
  };

  const importActiveTilemapData = async () => {
    if (!activeTileset || !activeCel?.tilemap) return;
    try {
      let name: string;
      let content: string;
      if (hasWailsAppBridge()) {
        const payload = await OpenTilemapData(language);
        if (!payload) return;
        const decoded = JSON.parse(payload) as {name?: unknown; content?: unknown};
        if (typeof decoded.name !== "string" || typeof decoded.content !== "string") throw new Error("Tilemap file response is invalid");
        name = decoded.name;
        content = decoded.content;
      } else {
        const file = await chooseBrowserFile(".json,.csv,application/json,text/csv");
        if (!file) return;
        name = file.name;
        content = await file.text();
      }
      mutateDocument("Import Tilemap Data", () => {
        if (name.toLowerCase().endsWith(".csv")) {
          const tilemap = importTilemapCsv(content, {tileset: activeTileset});
          const activeGridOffset = activeCel.tilemap?.gridOffset;
          if (activeGridOffset) tilemap.gridOffset = activeGridOffset;
          const size = tilemapPixelSize(activeTileset, tilemap);
          activeCel.tilemap = tilemap;
          activeCel.terrainmap = undefined;
          activeCel.width = size.width;
          activeCel.height = size.height;
        } else {
          const imported = importTilemapJson(content);
          if (imported.tileset.tileWidth !== activeTileset.tileWidth
            || imported.tileset.tileHeight !== activeTileset.tileHeight
            || imported.tileset.tileIds.some((id) => !activeTileset.tiles.some((tile) => tile.id === id))) {
            throw new Error("Imported tilemap does not match the active Tileset");
          }
          activeTileset.grid = {...imported.tileset.grid};
          activeTileset.terrains = imported.tileset.terrains.map((terrain) => ({
            ...terrain,
            rules: terrain.rules.map((rule) => ({
              ...rule,
              candidates: rule.candidates.map((candidate) => ({...candidate})),
            })),
          }));
          activeCel.tilemap = {...imported.tilemap, tiles: imported.tilemap.tiles.slice()};
          activeCel.terrainmap = imported.terrainmap ? {
            columns: imported.terrainmap.columns,
            rows: imported.terrainmap.rows,
            seed: imported.terrainmap.seed,
            terrains: imported.terrainmap.cells.slice(),
          } : undefined;
          activeCel.x = imported.cel.x;
          activeCel.y = imported.cel.y;
          activeCel.width = imported.cel.width;
          activeCel.height = imported.cel.height;
        }
        renderTilemapCelIntoCache(activeCel, activeTileset, {
          palette: pixelDocument.colorMode === "indexed" ? pixelDocument.palette.colors : undefined,
          transparentIndex: pixelDocument.palette.transparentIndex,
        });
        if (pixelDocument.colorMode === "indexed") syncIndexedCel(pixelDocument, activeCel);
        for (const linked of Object.values(pixelDocument.cels)) {
          if (linked.id === activeCel.id || linked.linkId !== activeCel.linkId) continue;
          linked.tilemap = activeCel.tilemap;
          linked.terrainmap = activeCel.terrainmap;
          linked.pixels = activeCel.pixels;
          linked.indexes = activeCel.indexes;
          linked.width = activeCel.width;
          linked.height = activeCel.height;
        }
        return true;
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tilemap import failed");
    }
  };

  const deleteSelectedTile = () => {
    if (!activeTileset) return;
    const tileIDs = effectiveSelectedTileIDs.length > 0
      ? effectiveSelectedTileIDs
      : effectiveSelectedTileID === 0 ? [] : [effectiveSelectedTileID];
    if (tileIDs.length === 0) return;
    const affected = tileIDs.reduce((total, tileID) => {
      const usage = tileUsage.get(tileID);
      return {cells: total.cells + (usage?.cells ?? 0), rules: total.rules + (usage?.rules ?? 0)};
    }, {cells: 0, rules: 0});
    if (affected.rules > 0) {
      setStatus(language === "zh"
        ? `无法删除：${affected.rules} 条地形规则、${affected.cells} 个地图单元格受影响`
        : `Cannot delete: ${affected.rules} Terrain rules and ${affected.cells} map cells are affected`);
      return;
    }
    if (affected.cells > 0 && !window.confirm(language === "zh"
      ? `删除后将清空 ${affected.cells} 个地图单元格。继续吗？`
      : `Deleting these tiles will clear ${affected.cells} map cells. Continue?`)) return;
    mutateDocument("Delete Tile", () => {
      const cels = Object.values(pixelDocument.cels).filter((cel) => {
        const layer = getLayerByID(pixelDocument, cel.layerId);
        return layer?.kind === "tilemap" && layer.tilesetId === activeTileset.id && cel.tilemap;
      });
      let changed = false;
      const tilemaps = cels.flatMap((cel) => cel.tilemap ? [cel.tilemap] : []);
      for (const tileID of tileIDs) changed = deleteTileInPlace(activeTileset, tileID, tilemaps) || changed;
      if (!changed) return false;
      for (const cel of cels) renderTilemapCelIntoCache(cel, activeTileset, {
        palette: pixelDocument.colorMode === "indexed" ? pixelDocument.palette.colors : undefined,
        transparentIndex: pixelDocument.palette.transparentIndex,
      });
      setSelectedTileID(0);
      setSelectedTileIDs([]);
      return true;
    });
  };

  const duplicateSelectedTiles = () => mutateDocument("Duplicate Tiles", () => {
    if (!activeTileset) return false;
    const selected = new Set(effectiveSelectedTileIDs.length > 0 ? effectiveSelectedTileIDs : [effectiveSelectedTileID]);
    const source = activeTileset.tiles.filter((tile) => selected.has(tile.id));
    if (source.length === 0) return false;
    const used = new Set(activeTileset.tiles.map((tile) => tile.id));
    const copies = source.map((tile) => {
      let id = 1;
      while (used.has(id)) id += 1;
      if (id > 0x1fffffff) throw new Error("Tileset has reached its tile limit");
      used.add(id);
      return {...tile, id, pixels: tile.pixels.slice(), indexes: tile.indexes?.slice()};
    });
    const insertIndex = Math.max(...source.map((tile) => activeTileset.tiles.indexOf(tile))) + 1;
    activeTileset.tiles.splice(insertIndex, 0, ...copies);
    setSelectedTileIDs(copies.map((tile) => tile.id));
    setSelectedTileID(copies[0].id);
    return true;
  });

  const copySelectedTiles = () => {
    if (!activeTileset) return;
    const selected = new Set(effectiveSelectedTileIDs.length > 0 ? effectiveSelectedTileIDs : [effectiveSelectedTileID]);
    const copied = activeTileset.tiles
      .filter((tile) => selected.has(tile.id))
      .map((tile) => ({...tile, pixels: tile.pixels.slice(), indexes: tile.indexes?.slice()}));
    setTileClipboard(copied);
    tileClipboardSourceRef.current = {
      tabID: activeTab.id,
      tilesetID: activeTileset.id,
      width: activeTileset.tileWidth,
      height: activeTileset.tileHeight,
    };
    setStatus(language === "zh" ? `已复制 ${copied.length} 个图块` : `Copied ${copied.length} tiles`);
  };

  const updateTilesetBoxSelection = (start: HTMLButtonElement, end: HTMLButtonElement) => {
    const container = end.closest(".tile-swatch-grid");
    if (!container) return;
    const startRect = start.getBoundingClientRect();
    const endRect = end.getBoundingClientRect();
    const left = Math.min(startRect.left, endRect.left);
    const right = Math.max(startRect.right, endRect.right);
    const top = Math.min(startRect.top, endRect.top);
    const bottom = Math.max(startRect.bottom, endRect.bottom);
    const ids = Array.from(container.querySelectorAll<HTMLButtonElement>("[data-tile-id]")).flatMap((button) => {
      const bounds = button.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const id = Number(button.dataset.tileId);
      return centerX >= left && centerX <= right && centerY >= top && centerY <= bottom && Number.isInteger(id) ? [id] : [];
    });
    setSelectedTileIDs(ids);
    if (ids.length > 0) setSelectedTileID(ids[0]);
  };

  const pasteTiles = () => mutateDocument("Paste Tiles", () => {
    if (!activeTileset || tileClipboard.length === 0) return false;
    const source = tileClipboardSourceRef.current;
    if (!source || source.tabID !== activeTab.id || source.width !== activeTileset.tileWidth || source.height !== activeTileset.tileHeight) {
      setStatus(language === "zh" ? "图块剪贴板的项目或尺寸不匹配" : "Tile clipboard document or dimensions do not match");
      return false;
    }
    const used = new Set(activeTileset.tiles.map((tile) => tile.id));
    const copies = tileClipboard.map((tile) => {
      let id = 1;
      while (used.has(id)) id += 1;
      if (id > 0x1fffffff) throw new Error("Tileset has reached its tile limit");
      used.add(id);
      return {...tile, id, pixels: tile.pixels.slice(), indexes: tile.indexes?.slice()};
    });
    activeTileset.tiles.push(...copies);
    setSelectedTileIDs(copies.map((tile) => tile.id));
    setSelectedTileID(copies[0].id);
    setTileSelectionAnchorID(copies[0].id);
    return true;
  });

  const reorderSelectedTiles = (direction: -1 | 1) => mutateDocument("Reorder Tiles", () => {
    if (!activeTileset) return false;
    const selected = new Set(effectiveSelectedTileIDs.length > 0 ? effectiveSelectedTileIDs : [effectiveSelectedTileID]);
    if (selected.size === 0) return false;
    let changed = false;
    if (direction < 0) {
      for (let index = 1; index < activeTileset.tiles.length; index += 1) {
        if (!selected.has(activeTileset.tiles[index].id) || selected.has(activeTileset.tiles[index - 1].id)) continue;
        [activeTileset.tiles[index - 1], activeTileset.tiles[index]] = [activeTileset.tiles[index], activeTileset.tiles[index - 1]];
        changed = true;
      }
    } else {
      for (let index = activeTileset.tiles.length - 2; index >= 0; index -= 1) {
        if (!selected.has(activeTileset.tiles[index].id) || selected.has(activeTileset.tiles[index + 1].id)) continue;
        [activeTileset.tiles[index], activeTileset.tiles[index + 1]] = [activeTileset.tiles[index + 1], activeTileset.tiles[index]];
        changed = true;
      }
    }
    return changed;
  });

  const terrainNeighborModeForTileset = (): TerrainNeighborMode => {
    if (activeTileset?.grid.kind === "hexagonal") return "edge6";
    return "edge4";
  };

  const recalculateTerrainMapsForTileset = () => {
    if (!activeTileset) return;
    const layerIDs = new Set(pixelDocument.layers
      .filter((layer) => layer.kind === "tilemap" && layer.tilesetId === activeTileset.id)
      .map((layer) => layer.id));
    for (const cel of Object.values(pixelDocument.cels)) {
      if (!layerIDs.has(cel.layerId) || !cel.tilemap || !cel.terrainmap) continue;
      const changedCells = Array.from({length: cel.terrainmap.terrains.length}, (_, index) => ({
        column: index % cel.terrainmap!.columns,
        row: Math.floor(index / cel.terrainmap!.columns),
      }));
      recalculateTerrainCells(
        cel.terrainmap,
        activeTileset.terrains,
        tilesetGridLayout(activeTileset, cel.tilemap),
        cel.tilemap.tiles,
        changedCells,
      );
    }
    refreshTilemapCaches(pixelDocument);
  };

  const addTerrain = () => mutateDocument("Add Terrain", () => {
    if (!activeTileset) return false;
    const used = new Set(activeTileset.terrains.map((terrain) => terrain.id));
    let id = 1;
    while (used.has(id)) id += 1;
    if (id >= terrainEmpty) return false;
    activeTileset.terrains.push({
      id,
      name: `${language === "zh" ? "地形" : "Terrain"} ${id}`,
      color: foregroundColor.length === 7 ? `${foregroundColor}ff` : foregroundColor,
      neighborMode: terrainNeighborModeForTileset(),
      boundary: "empty",
      rules: effectiveSelectedTileID === 0 ? [] : [{
        mask: 0,
        candidates: [{tileId: effectiveSelectedTileID, flags: selectedTileFlags, weight: 1}],
      }],
    });
    setSelectedTerrainID(id);
    setTilemapDrawMode("terrain");
    return true;
  });

  const renameSelectedTerrain = () => {
    if (!activeTerrain) return;
    const name = window.prompt(language === "zh" ? "地形名称" : "Terrain name", activeTerrain.name)?.trim();
    if (!name || name === activeTerrain.name) return;
    mutateDocument("Rename Terrain", () => {
      activeTerrain.name = name;
      return true;
    });
  };

  const duplicateSelectedTerrain = () => mutateDocument("Duplicate Terrain", () => {
    if (!activeTileset || !activeTerrain) return false;
    const used = new Set(activeTileset.terrains.map((terrain) => terrain.id));
    let id = 1;
    while (used.has(id)) id += 1;
    if (id >= terrainEmpty) return false;
    activeTileset.terrains.push({
      ...activeTerrain,
      id,
      name: `${activeTerrain.name} ${language === "zh" ? "副本" : "Copy"}`,
      rules: activeTerrain.rules.map((rule) => ({
        ...rule,
        candidates: rule.candidates.map((candidate) => ({...candidate})),
      })),
    });
    setSelectedTerrainID(id);
    return true;
  });

  const updateSelectedTerrainColor = (color: string) => mutateDocument("Change Terrain Color", () => {
    if (!activeTerrain || !/^#[\da-f]{6}$/i.test(color)) return false;
    const next = `${color.toLowerCase()}ff`;
    if (activeTerrain.color.toLowerCase() === next) return false;
    activeTerrain.color = next;
    return true;
  });

  const deleteSelectedTerrain = () => mutateDocument("Delete Terrain", () => {
    if (!activeTileset || effectiveSelectedTerrainID === 0) return false;
    const index = activeTileset.terrains.findIndex((terrain) => terrain.id === effectiveSelectedTerrainID);
    if (index < 0) return false;
    for (const cel of Object.values(pixelDocument.cels)) {
      const layer = getLayerByID(pixelDocument, cel.layerId);
      if (layer?.kind !== "tilemap" || layer.tilesetId !== activeTileset.id || !cel.terrainmap) continue;
      for (let offset = 0; offset < cel.terrainmap.terrains.length; offset += 1) {
        if (cel.terrainmap.terrains[offset] === effectiveSelectedTerrainID) cel.terrainmap.terrains[offset] = 0;
      }
    }
    activeTileset.terrains.splice(index, 1);
    setSelectedTerrainID(activeTileset.terrains[0]?.id ?? 0);
    recalculateTerrainMapsForTileset();
    return true;
  });

  const updateActiveTerrain = (update: {boundary?: TerrainBoundary; neighborMode?: TerrainNeighborMode}) => mutateDocument("Update Terrain", () => {
    if (!activeTerrain || !activeTileset) return false;
    const nextMode = update.neighborMode ?? activeTerrain.neighborMode;
    if (activeTileset.grid.kind === "hexagonal" && nextMode !== "edge6") return false;
    if (activeTileset.grid.kind === "isometric" && nextMode !== "edge4") return false;
    if (activeTileset.grid.kind === "orthogonal" && nextMode === "edge6") return false;
    const nextBoundary = update.boundary ?? activeTerrain.boundary;
    if (nextMode === activeTerrain.neighborMode && nextBoundary === activeTerrain.boundary) return false;
    const oldMode = activeTerrain.neighborMode;
    activeTerrain.neighborMode = nextMode;
    activeTerrain.boundary = nextBoundary;
    const maximumMask = nextMode === "blob8" ? 0xff : nextMode === "edge6" ? 0x3f : 0x0f;
    const remapMask = (mask: number) => {
      if (oldMode === "edge4" && nextMode === "blob8") {
        return [0, 1, 2, 3].reduce((result, bit) => result | (((mask >> bit) & 1) << (bit * 2)), 0);
      }
      if (oldMode === "blob8" && nextMode === "edge4") {
        return [0, 1, 2, 3].reduce((result, bit) => result | (((mask >> (bit * 2)) & 1) << bit), 0);
      }
      return nextMode === "blob8" ? normalizeBlobMask(mask & maximumMask) : mask & maximumMask;
    };
    const rules = new Map<number, (typeof activeTerrain.rules)[number]>();
    for (const rule of activeTerrain.rules) {
      const mask = remapMask(rule.mask);
      const existing = rules.get(mask);
      if (existing) {
        for (const candidate of rule.candidates) {
          const same = existing.candidates.find((entry) => entry.tileId === candidate.tileId && entry.flags === candidate.flags);
          if (same) same.weight += candidate.weight;
          else existing.candidates.push({...candidate});
        }
      } else rules.set(mask, {...rule, mask, candidates: rule.candidates.map((candidate) => ({...candidate}))});
    }
    activeTerrain.rules = [...rules.values()].sort((left, right) => left.mask - right.mask);
    setTerrainRuleMaskDraft(remapMask);
    recalculateTerrainMapsForTileset();
    return true;
  });

  const assignTerrainRule = () => mutateDocument("Assign Terrain Rule", () => {
    if (!activeTerrain || effectiveSelectedTileID === 0) return false;
    const maximumMask = activeTerrain.neighborMode === "blob8" ? 0xff : activeTerrain.neighborMode === "edge6" ? 0x3f : 0x0f;
    const rawMask = Math.max(0, Math.min(maximumMask, Math.round(terrainRuleMaskDraft)));
    const mask = activeTerrain.neighborMode === "blob8" ? normalizeBlobMask(rawMask) : rawMask;
    const index = activeTerrain.rules.findIndex((candidate) => candidate.mask === mask);
    const weight = Math.max(0.001, Number.isFinite(terrainRuleWeightDraft) ? terrainRuleWeightDraft : 1);
    if (index >= 0) {
      const candidates = activeTerrain.rules[index].candidates;
      const candidateIndex = candidates.findIndex((candidate) => candidate.tileId === effectiveSelectedTileID && candidate.flags === selectedTileFlags);
      if (candidateIndex >= 0) candidates[candidateIndex] = {...candidates[candidateIndex], weight};
      else candidates.push({tileId: effectiveSelectedTileID, flags: selectedTileFlags, weight});
    } else {
      activeTerrain.rules.push({
        mask,
        candidates: [{tileId: effectiveSelectedTileID, flags: selectedTileFlags, weight}],
      });
    }
    activeTerrain.rules.sort((left, right) => left.mask - right.mask);
    recalculateTerrainMapsForTileset();
    return true;
  });

  const fillMissingTerrainRules = () => mutateDocument("Generate Terrain Rules", () => {
    if (!activeTerrain || !activeTerrainDiagnostic || effectiveSelectedTileID === 0 || activeTerrainDiagnostic.missingMasks.length === 0) return false;
    activeTerrain.rules.push(...createTerrainRuleTemplate(activeTerrain.neighborMode, {
      tileId: effectiveSelectedTileID,
      flags: selectedTileFlags,
      weight: Math.max(0.001, terrainRuleWeightDraft),
    }, activeTerrainDiagnostic.missingMasks));
    activeTerrain.rules.sort((left, right) => left.mask - right.mask);
    recalculateTerrainMapsForTileset();
    return true;
  });

  const deleteTerrainRule = (mask: number) => mutateDocument("Delete Terrain Rule", () => {
    if (!activeTerrain) return false;
    const index = activeTerrain.rules.findIndex((rule) => rule.mask === mask);
    if (index < 0) return false;
    activeTerrain.rules.splice(index, 1);
    recalculateTerrainMapsForTileset();
    return true;
  });

  const deleteTerrainCandidate = (mask: number, tileId: number, flags: number) => mutateDocument("Delete Terrain Variant", () => {
    if (!activeTerrain) return false;
    const ruleIndex = activeTerrain.rules.findIndex((rule) => rule.mask === mask);
    if (ruleIndex < 0) return false;
    const candidates = activeTerrain.rules[ruleIndex].candidates;
    const candidateIndex = candidates.findIndex((candidate) => candidate.tileId === tileId && candidate.flags === flags);
    if (candidateIndex < 0) return false;
    candidates.splice(candidateIndex, 1);
    if (candidates.length === 0) activeTerrain.rules.splice(ruleIndex, 1);
    recalculateTerrainMapsForTileset();
    return true;
  });

  const invalidateTilemapCells = (cel: typeof activeCel, tileset: Tileset, cells: readonly TileCell[]) => {
    if (!cel?.tilemap || cells.length === 0) return;
    if (onionSkin) {
      activeTab.compositeCache.clear();
      invalidate();
      return;
    }
    const dirty = tileCellsPixelBounds(tileset, cel.tilemap, cells);
    if (!dirty) return;
    const aliases = Object.values(pixelDocument.cels).filter((candidate) => candidate.linkId === cel.linkId);
    touchTabThumbnailCels(activeTab, aliases.map((candidate) => candidate.id));
    for (const alias of aliases) {
      const bounds = {x: alias.x + dirty.x, y: alias.y + dirty.y, width: dirty.width, height: dirty.height};
      activeTab.compositeCache.repair(pixelDocument, alias.frameId, bounds);
      if (alias.frameId === pixelDocument.activeFrameId) queuePixelRender(bounds);
    }
  };

  const commitTileSelectionResult = (result: TilemapEditResult, label: string) => {
    if (!activeCel?.tilemap || !activeTileset || activeLayerLocked || isPlaying) return;
    const changes = result.changedCells.map(({x, y}) => {
      const index = y * activeCel.tilemap!.columns + x;
      return {index, before: activeCel.tilemap!.tiles[index], after: result.tilemap.tiles[index]};
    }).filter((change) => change.before !== change.after);
    if (changes.length === 0) return;
    let before: PixelDocument | null = null;
    if (activeCel.terrainmap) {
      if (!window.confirm(language === "zh"
        ? "解除当前动画格及其链接动画格的地形管理，保留当前瓦片并进行手工编辑？可通过撤销恢复地形。"
        : "Detach Terrain from this Cel and its linked Cels, keeping the current tiles for manual editing? Undo restores Terrain.")) return;
      before = cloneDocument(pixelDocument);
      replaceCelTerrainAuthority(pixelDocument, activeCel, undefined);
    }
    const command = new TilemapCellsCommand(activeCel.id, changes, label);
    command.redo(pixelDocument);
    history.commit(before ? new DocumentStateCommand(before, pixelDocument, label) : command);
    invalidateTilemapCells(activeCel, activeTileset, result.changedCells.map(({x, y}) => ({column: x, row: y})));
    setStatus(label);
  };

  const copyTileCells = (cut = false) => {
    if (!activeCel?.tilemap || !activeTileset || !tileCellSelection) return;
    tileCellClipboardSourceRef.current = {tabID: activeTab.id, tilesetID: activeTileset.id};
    const size = {tileWidth: activeTileset.tileWidth, tileHeight: activeTileset.tileHeight};
    if (cut) {
      const result = cutTilemapSelection(activeCel.tilemap, tileCellSelection, size);
      setTileCellClipboard(result.clipboard);
      const changedCells = tileRectangleCells(
        {x: tileCellSelection.x, y: tileCellSelection.y},
        {x: tileCellSelection.x + tileCellSelection.width - 1, y: tileCellSelection.y + tileCellSelection.height - 1},
        "filled",
      );
      commitTileSelectionResult({tilemap: result.tilemap, changedCells}, "Cut Tile Cells");
    } else {
      setTileCellClipboard(copyTilemapSelection(activeCel.tilemap, tileCellSelection, size));
    }
  };

  const pasteTileCells = () => {
    if (!activeCel?.tilemap || !activeTileset || !tileCellClipboard) return;
    const source = tileCellClipboardSourceRef.current;
    if (!source || source.tabID !== activeTab.id || source.tilesetID !== activeTileset.id
      || tileCellClipboard.tileWidth !== activeTileset.tileWidth || tileCellClipboard.tileHeight !== activeTileset.tileHeight
      || [...tileCellClipboard.tiles].some((value) => tileValueIndex(value) !== 0 && !activeTileset.tiles.some((tile) => tile.id === tileValueIndex(value)))) {
      setStatus(language === "zh" ? "剪贴板图块与当前图块集不匹配" : "Clipboard tiles do not match the active Tileset");
      return;
    }
    const target = tileCellSelection
      ? {x: tileCellSelection.x, y: tileCellSelection.y}
      : {x: tilemapHoverCell?.column ?? 0, y: tilemapHoverCell?.row ?? 0};
    commitTileSelectionResult(pasteTilemapClipboard(activeCel.tilemap, tileCellClipboard, target), "Paste Tile Cells");
  };

  const transformSelectedTileCells = (operation: "flip-x" | "flip-y" | "cw" | "ccw") => {
    if (!activeCel?.tilemap || !activeTileset || !tileCellSelection) return;
    try {
      if (activeCel.terrainmap) {
        let nextSelection = tileCellSelection;
        const changed = mutateDocument("Transform Terrain Cells", () => {
          const result = transformTerrainSelection(activeCel.terrainmap!, tileCellSelection, operation);
          if (result.changedCells.length === 0) return false;
          replaceCelTerrainAuthority(pixelDocument, activeCel, result.map);
          nextSelection = result.selection;
          return true;
        });
        if (changed) setTileCellSelection(nextSelection);
        return;
      }
      const size = {tileWidth: activeTileset.tileWidth, tileHeight: activeTileset.tileHeight};
      if (activeTileset.grid.kind !== "orthogonal" && (operation === "cw" || operation === "ccw")) {
        throw new Error("90-degree cell rotation is not supported by this grid");
      }
      let result: TilemapEditResult;
      if (activeTileset.grid.kind === "orthogonal") {
        result = operation === "flip-x" || operation === "flip-y"
          ? flipTilemapSelection(activeCel.tilemap, tileCellSelection, operation === "flip-x" ? "horizontal" : "vertical", size)
          : rotateTilemapSelection(activeCel.tilemap, tileCellSelection, operation, size);
      } else {
        const cut = cutTilemapSelection(activeCel.tilemap, tileCellSelection, size);
        const transformed = transformTilemapGrid(
          {columns: cut.clipboard.width, rows: cut.clipboard.height, tiles: cut.clipboard.tiles},
          activeTileset,
          operation === "flip-x" ? "horizontal" : "vertical",
        );
        const pasted = applyTileStamp(cut.tilemap, {
          width: transformed.tilemap.columns,
          height: transformed.tilemap.rows,
          tiles: transformed.tilemap.tiles,
          ...size,
        }, {x: tileCellSelection.x, y: tileCellSelection.y}, {clip: true, emptyMode: "overwrite"});
        const changed = new Map<string, {x: number; y: number}>();
        for (const cell of tileRectangleCells(
          {x: tileCellSelection.x, y: tileCellSelection.y},
          {x: tileCellSelection.x + tileCellSelection.width - 1, y: tileCellSelection.y + tileCellSelection.height - 1},
          "filled",
        )) changed.set(`${cell.x}:${cell.y}`, cell);
        for (const cell of pasted.changedCells) changed.set(`${cell.x}:${cell.y}`, cell);
        result = {tilemap: pasted.tilemap, changedCells: [...changed.values()]};
        setTileCellSelection({
          x: tileCellSelection.x,
          y: tileCellSelection.y,
          width: transformed.tilemap.columns,
          height: transformed.tilemap.rows,
        });
      }
      commitTileSelectionResult(result, "Transform Tile Cells");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tile transform failed");
    }
  };

  const captureTileStampFromSelection = () => {
    if (activeTileset && activeCel?.tilemap && tileCellSelection) {
      setTileStamp(copyTilemapSelection(activeCel.tilemap, tileCellSelection, activeTileset));
      setTilemapToolMode("stamp");
      return;
    }
    if (!activeTileset || !activeCel?.tilemap || !selection) return;
    const start = tilemapCellAtPixel(
      activeTileset,
      activeCel.tilemap,
      selection.x - activeCel.x,
      selection.y - activeCel.y,
    );
    const end = tilemapCellAtPixel(
      activeTileset,
      activeCel.tilemap,
      selection.x + selection.width - 1 - activeCel.x,
      selection.y + selection.height - 1 - activeCel.y,
    );
    const stamp = createTileStamp(
      activeCel.tilemap,
      {x: start.column, y: start.row},
      {x: end.column, y: end.row},
      {tileWidth: activeTileset.tileWidth, tileHeight: activeTileset.tileHeight},
    );
    setTileStamp(stamp);
    setTilemapToolMode("stamp");
  };

  const transformTileStamp = (operation: "flip-x" | "flip-y" | "rotate-cw" | "rotate-ccw") => {
    if (!tileStamp || !activeTileset) return;
    try {
      const size = {tileWidth: activeTileset.tileWidth, tileHeight: activeTileset.tileHeight};
      setTileStamp(operation === "flip-x"
        ? flipTileStamp(tileStamp, "x", size)
        : operation === "flip-y"
          ? flipTileStamp(tileStamp, "y", size)
          : rotateTileStamp(tileStamp, operation === "rotate-cw" ? "cw" : "ccw", size));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tile stamp transform failed");
    }
  };

  const captureTerrainStampFromSelection = () => {
    if (!activeTileset || !activeCel?.tilemap || !activeCel.terrainmap) return;
    if (tileCellSelection) {
      setTerrainStamp(createTerrainStamp(
        activeCel.terrainmap,
        {column: tileCellSelection.x, row: tileCellSelection.y},
        {
          column: tileCellSelection.x + tileCellSelection.width - 1,
          row: tileCellSelection.y + tileCellSelection.height - 1,
        },
      ));
      setTerrainToolMode("stamp");
      return;
    }
    if (!selection) return;
    const start = tilemapCellAtPixel(activeTileset, activeCel.tilemap, selection.x - activeCel.x, selection.y - activeCel.y);
    const end = tilemapCellAtPixel(
      activeTileset,
      activeCel.tilemap,
      selection.x + selection.width - 1 - activeCel.x,
      selection.y + selection.height - 1 - activeCel.y,
    );
    setTerrainStamp(createTerrainStamp(activeCel.terrainmap, start, end));
    setTerrainToolMode("stamp");
  };

  const transformTerrainStamp = (operation: "flip-x" | "flip-y" | "rotate-cw" | "rotate-ccw") => {
    if (!terrainStamp) return;
    setTerrainStamp(operation === "flip-x"
      ? flipTerrainStamp(terrainStamp, "horizontal")
      : operation === "flip-y"
        ? flipTerrainStamp(terrainStamp, "vertical")
        : rotateTerrainStamp(terrainStamp, operation === "rotate-cw" ? "cw" : "ccw"));
  };

  const recalculateTerrainScope = (scope: "selection" | "cel" | "tileset") => mutateDocument("Recalculate Terrain", () => {
    if (!activeTileset || !activeCel?.tilemap || !activeCel.terrainmap) return false;
    const layerIDs = new Set(pixelDocument.layers
      .filter((layer) => layer.kind === "tilemap" && layer.tilesetId === activeTileset.id)
      .map((layer) => layer.id));
    const targets = scope === "tileset"
      ? Object.values(pixelDocument.cels).filter((cel) => layerIDs.has(cel.layerId) && cel.tilemap && cel.terrainmap)
      : [activeCel];
    let changed = false;
    for (const cel of targets) {
      if (!cel.tilemap || !cel.terrainmap) continue;
      let cells: Array<{column: number; row: number}>;
      if (scope === "selection") {
        if (!selection || cel.id !== activeCel.id) continue;
        const start = tilemapCellAtPixel(activeTileset, cel.tilemap, selection.x - cel.x, selection.y - cel.y);
        const end = tilemapCellAtPixel(activeTileset, cel.tilemap, selection.x + selection.width - 1 - cel.x, selection.y + selection.height - 1 - cel.y);
        const minColumn = Math.max(0, Math.min(start.column, end.column));
        const maxColumn = Math.min(cel.tilemap.columns - 1, Math.max(start.column, end.column));
        const minRow = Math.max(0, Math.min(start.row, end.row));
        const maxRow = Math.min(cel.tilemap.rows - 1, Math.max(start.row, end.row));
        cells = [];
        for (let row = minRow; row <= maxRow; row += 1) {
          for (let column = minColumn; column <= maxColumn; column += 1) cells.push({column, row});
        }
      } else {
        cells = Array.from({length: cel.terrainmap.terrains.length}, (_, index) => ({
          column: index % cel.terrainmap!.columns,
          row: Math.floor(index / cel.terrainmap!.columns),
        }));
      }
      const recalculated = recalculateTerrainCells(
        cel.terrainmap,
        activeTileset.terrains,
        tilesetGridLayout(activeTileset, cel.tilemap),
        cel.tilemap.tiles,
        cells,
      );
      changed = recalculated.length > 0 || changed;
    }
    if (changed) refreshTilemapCaches(pixelDocument);
    return changed;
  });

  const handleTilemapPointer = (phase: "start" | "move" | "end", point: {x: number; y: number}, secondary: boolean) => {
    if (!activeTileset || !activeCel?.tilemap || !isTilemapLayer(activeLayer) || activeLayerLocked || isPlaying) return false;
    if (phase !== "start" && tilemapPromptEndedGestureRef.current) return true;
    if (phase === "start") tilemapPromptEndedGestureRef.current = false;
    const acceptsCell = createTilemapSelectionPredicate(selection, activeTileset,
      activeCel.tilemap.columns, activeCel.tilemap.rows,
      {celX: activeCel.x, celY: activeCel.y, gridOffset: activeCel.tilemap.gridOffset});
    const {tiledX, tiledY} = pixelDocument.settings;
    const wrappedPoint = wrapTiledPoint(point, pixelDocument.width, pixelDocument.height, tiledX, tiledY);
    const localPoint = {x: (wrappedPoint ?? point).x - activeCel.x, y: (wrappedPoint ?? point).y - activeCel.y};
    const pointInside = wrappedPoint !== null
      && localPoint.x >= 0 && localPoint.y >= 0 && localPoint.x < activeCel.width && localPoint.y < activeCel.height;
    const pointerSamples = (start: {x: number; y: number}) => wrappedLinePoints(
      start, point, pixelDocument.width, pixelDocument.height, tiledX, tiledY,
    );
    const pointerLineCells = () => {
      const cells = new Map<number, TileCell>();
      for (const sample of pointerSamples(tilemapGestureStartPointRef.current ?? point)) {
        const cell = tilemapCellAtPixel(activeTileset, activeCel.tilemap!, sample.x - activeCel.x, sample.y - activeCel.y);
        if (acceptsCell(cell)) cells.set(cell.row * activeCel.tilemap!.columns + cell.column, cell);
      }
      return [...cells.values()];
    };
    const pointerRectangleCells = (filled: boolean) => {
      const rawStart = tilemapGestureStartPointRef.current;
      if (!rawStart || !tiledStampGeometry) return [];
      const start = tilemapCellAtPixel(activeTileset, activeCel.tilemap!,
        rawStart.x - activeCel.x, rawStart.y - activeCel.y);
      const end = tilemapCellAtPixel(activeTileset, activeCel.tilemap!,
        point.x - activeCel.x, point.y - activeCel.y);
      const cells = terrainRectangleCells(start, end, filled);
      return mapTiledCellTargets(tiledStampGeometry, cells.map((cell) => ({cell, value: 0}))).map(({cell}) => cell);
    };
    const pointedCell = pointInside
      ? tilemapCellAtPixel(activeTileset, activeCel.tilemap, localPoint.x, localPoint.y)
      : null;
    const validPointedCell = pointedCell
      && pointedCell.column >= 0 && pointedCell.row >= 0
      && pointedCell.column < activeCel.tilemap.columns && pointedCell.row < activeCel.tilemap.rows
      ? {x: pointedCell.column, y: pointedCell.row}
      : null;
    const dirtyTileCells: TileCell[] = [];
    if (tilemapDrawMode === "tiles" && tilemapToolMode === "select") {
      if (phase === "start") {
        tilemapGestureStartCellRef.current = validPointedCell;
        const withinSelection = validPointedCell && tileCellSelection
          && validPointedCell.x >= tileCellSelection.x && validPointedCell.y >= tileCellSelection.y
          && validPointedCell.x < tileCellSelection.x + tileCellSelection.width
          && validPointedCell.y < tileCellSelection.y + tileCellSelection.height;
        tileSelectionDragRef.current = withinSelection
          ? {selection: {...tileCellSelection!}, start: validPointedCell!}
          : null;
        if (secondary) setTileCellSelection(null);
        else if (validPointedCell && !withinSelection) setTileCellSelection(createTilemapSelection(activeCel.tilemap, validPointedCell, validPointedCell));
      } else if (validPointedCell && !secondary) {
        const drag = tileSelectionDragRef.current;
        const start = tilemapGestureStartCellRef.current;
        if (drag) {
          const target = {
            x: Math.max(0, Math.min(activeCel.tilemap.columns - drag.selection.width, drag.selection.x + validPointedCell.x - drag.start.x)),
            y: Math.max(0, Math.min(activeCel.tilemap.rows - drag.selection.height, drag.selection.y + validPointedCell.y - drag.start.y)),
          };
          setTileCellSelection({...drag.selection, ...target});
          if (phase === "end") commitTileSelectionResult(moveTilemapSelection(activeCel.tilemap, drag.selection, target), "Move Tile Cells");
        } else if (start) {
          setTileCellSelection(createTilemapSelection(activeCel.tilemap, start, validPointedCell));
        }
      }
      if (phase === "end") {
        tileSelectionDragRef.current = null;
        tilemapGestureStartCellRef.current = null;
      }
      return true;
    }
    if (phase === "start") {
      tilemapEditBeforeRef.current = tilemapDrawMode === "pixels" ? cloneDocument(pixelDocument) : null;
      tilemapEditChangedRef.current = false;
      tilemapAuthorityDeclinedRef.current = false;
      tilemapCellChangesRef.current.clear();
      terrainCellChangesRef.current.clear();
      tilemapGestureStartCellRef.current = validPointedCell;
      tilemapGestureStartPointRef.current = point;
      tilemapLastPointRef.current = point;
    }

    const detachTerrainForWrite = () => {
      if (tilemapAuthorityDeclinedRef.current) return false;
      if (!activeCel.terrainmap) return true;
      // Modal dialogs can consume pointerup. End this gesture after the confirmed write.
      tilemapPromptEndedGestureRef.current = true;
      if (!window.confirm(language === "zh"
        ? "解除当前动画格及其链接动画格的地形管理，保留当前瓦片并进行手工编辑？可通过撤销恢复地形。"
        : "Detach Terrain from this Cel and its linked Cels, keeping the current tiles for manual editing? Undo restores Terrain.")) {
        tilemapAuthorityDeclinedRef.current = true;
        return false;
      }
      tilemapEditBeforeRef.current ??= cloneDocument(pixelDocument);
      replaceCelTerrainAuthority(pixelDocument, activeCel, undefined);
      return true;
    };
    const recordTileCell = (cellX: number, cellY: number, nextValue: number) => {
      if (!acceptsCell({column: cellX, row: cellY})) return false;
      const offset = cellY * activeCel.tilemap!.columns + cellX;
      const current = activeCel.tilemap!.tiles[offset];
      const normalized = nextValue >>> 0;
      if (current === normalized) return false;
      if (!detachTerrainForWrite()) return false;
      const existing = tilemapCellChangesRef.current.get(offset);
      const before = existing?.before ?? current;
      setTileCellInPlace(activeCel.tilemap!, cellX, cellY, normalized);
      if (before === normalized) tilemapCellChangesRef.current.delete(offset);
      else tilemapCellChangesRef.current.set(offset, {before, after: normalized});
      dirtyTileCells.push({column: cellX, row: cellY});
      return true;
    };

    const nextTileValue = secondary || selectedTool === "eraser"
      ? 0
      : (effectiveSelectedTileID | selectedTileFlags) >>> 0;
    let changed = false;
    if (tilemapDrawMode === "tiles") {
      if (tilemapToolMode === "picker") {
        if (phase !== "end" && validPointedCell) {
          const value = pickTileCell(activeCel.tilemap, validPointedCell);
          if (value !== undefined) {
            setSelectedTileID(tileValueIndex(value));
            setSelectedTileIDs(tileValueIndex(value) === 0 ? [] : [tileValueIndex(value)]);
            setSelectedTileFlags(tileValueFlags(value));
          }
        }
      } else if (tilemapToolMode === "fill") {
        if (phase === "start" && validPointedCell) {
          const result = floodFillTilemap(activeCel.tilemap, validPointedCell, nextTileValue, {
            grid: tilesetGridLayout(activeTileset, activeCel.tilemap),
            acceptsCell: ({x, y}) => acceptsCell({column: x, row: y}),
          });
          for (const cell of result.changedCells) {
            changed = recordTileCell(cell.x, cell.y, result.tilemap.tiles[cell.y * result.tilemap.columns + cell.x]) || changed;
          }
        }
      } else if (tilemapToolMode === "stamp") {
        if (phase === "start" && validPointedCell && tileStamp && tiledStampGeometry) {
          const targets = mapTiledTileStampTargets(tiledStampGeometry,
            {column: validPointedCell.x, row: validPointedCell.y}, tileStamp, {emptyMode: tileStampEmptyMode});
          for (const {cell, value} of targets) {
            changed = recordTileCell(cell.column, cell.row, value) || changed;
          }
        }
      } else if ((tilemapToolMode === "line" || tilemapToolMode === "rectangle") && phase === "end") {
        const start = tilemapGestureStartCellRef.current;
        const rawStart = tilemapGestureStartPointRef.current;
        if (tilemapToolMode === "rectangle") {
          for (const cell of pointerRectangleCells(tileRectangleFilled)) {
            changed = recordTileCell(cell.column, cell.row, nextTileValue) || changed;
          }
        } else if (tilemapToolMode === "line" && rawStart && (!start || !validPointedCell
          || crossesTiledBoundary(rawStart, point, pixelDocument.width, pixelDocument.height, tiledX, tiledY))) {
          for (const cell of pointerLineCells()) changed = recordTileCell(cell.column, cell.row, nextTileValue) || changed;
        } else if (start && validPointedCell) {
          const cells = terrainLineCells(tilesetGridLayout(activeTileset, activeCel.tilemap), start, validPointedCell)
            .map(({column, row}) => ({x: column, y: row}));
          for (const cell of cells) changed = recordTileCell(cell.x, cell.y, nextTileValue) || changed;
        }
      } else if (tilemapToolMode === "pencil") {
        const previous = tilemapLastPointRef.current ?? point;
        for (const sample of pointerSamples(previous)) {
          const localX = sample.x - activeCel.x;
          const localY = sample.y - activeCel.y;
          if (localX < 0 || localY < 0 || localX >= activeCel.width || localY >= activeCel.height) continue;
          const cell = tilemapCellAtPixel(activeTileset, activeCel.tilemap, localX, localY);
          changed = recordTileCell(cell.column, cell.row, nextTileValue) || changed;
        }
      }
    } else if (tilemapDrawMode === "terrain") {
      const terrainmap = activeCel.terrainmap
        ?? createTerrainMapData(activeCel.tilemap.columns, activeCel.tilemap.rows, 0);
      const changedTerrainCells = new Map<number, {column: number; row: number}>();
      const nextTerrain = secondary || selectedTool === "eraser" ? terrainEmpty : effectiveSelectedTerrainID;
      const layout = tilesetGridLayout(activeTileset, activeCel.tilemap);
      const recordTerrainCell = (cell: {column: number; row: number}, terrainId = nextTerrain) => {
        if (!acceptsCell(cell)) return;
        const offset = cell.row * terrainmap.columns + cell.column;
        const current = terrainmap.terrains[offset];
        if (current === terrainId) return;
        if (!activeCel.terrainmap) {
          if (tilemapAuthorityDeclinedRef.current) return;
          if (activeCel.tilemap!.tiles.some((value) => value !== 0)) {
            tilemapPromptEndedGestureRef.current = true;
            if (!window.confirm(language === "zh"
              ? "启用地形将替换当前动画格及其链接动画格中的手工瓦片。继续绘制？可通过撤销恢复原瓦片。"
              : "Enabling Terrain replaces manual tiles in this Cel and its linked Cels. Continue painting? Undo restores the original tiles.")) {
              tilemapAuthorityDeclinedRef.current = true;
              return;
            }
          }
          tilemapEditBeforeRef.current = cloneDocument(pixelDocument);
          replaceCelTerrainAuthority(pixelDocument, activeCel, terrainmap);
          for (let index = 0; index < terrainmap.terrains.length; index += 1) {
            dirtyTileCells.push({column: index % terrainmap.columns, row: Math.floor(index / terrainmap.columns)});
          }
        }
        const existing = terrainCellChangesRef.current.get(offset);
        const before = existing?.before ?? current;
        terrainmap.terrains[offset] = terrainId;
        if (before === terrainId) terrainCellChangesRef.current.delete(offset);
        else terrainCellChangesRef.current.set(offset, {before, after: terrainId});
        changedTerrainCells.set(offset, cell);
        dirtyTileCells.push(cell);
        changed = true;
      };
      if (terrainToolMode === "picker") {
        if (phase !== "end" && validPointedCell) {
          const picked = terrainPicker(terrainmap, {
            column: validPointedCell.x,
            row: validPointedCell.y,
          });
          setSelectedTerrainID(picked === terrainEmpty ? 0 : picked);
        }
      } else if (nextTerrain !== 0 || selectedTool === "eraser" || secondary || terrainToolMode === "stamp") {
        if (terrainToolMode === "fill" && phase === "start" && validPointedCell) {
          for (const cell of terrainFloodFill(terrainmap, layout, {
            column: validPointedCell.x,
            row: validPointedCell.y,
          }, acceptsCell)) recordTerrainCell(cell);
        } else if (terrainToolMode === "stamp" && phase === "start" && validPointedCell && terrainStamp && tiledStampGeometry) {
          const targets = mapTiledTerrainStampTargets(tiledStampGeometry, {
            column: validPointedCell.x,
            row: validPointedCell.y,
          }, terrainStamp, {emptyMode: terrainStampEmptyMode});
          for (const {cell, value} of targets) {
            recordTerrainCell(cell, value);
          }
        } else if ((terrainToolMode === "line" || terrainToolMode === "rectangle") && phase === "end") {
          const start = tilemapGestureStartCellRef.current;
          const rawStart = tilemapGestureStartPointRef.current;
          if (terrainToolMode === "rectangle") {
            for (const cell of pointerRectangleCells(terrainRectangleFilled)) recordTerrainCell(cell);
          } else if (terrainToolMode === "line" && rawStart && (!start || !validPointedCell
            || crossesTiledBoundary(rawStart, point, pixelDocument.width, pixelDocument.height, tiledX, tiledY))) {
            for (const cell of pointerLineCells()) recordTerrainCell(cell);
          } else if (start && validPointedCell) {
            const cells = terrainLineCells(layout, {column: start.x, row: start.y}, {column: validPointedCell.x, row: validPointedCell.y});
            for (const cell of cells) recordTerrainCell(cell);
          }
        } else if (terrainToolMode === "brush") {
          const previous = tilemapLastPointRef.current ?? point;
          for (const sample of pointerSamples(previous)) {
            const localX = sample.x - activeCel.x;
            const localY = sample.y - activeCel.y;
            if (localX < 0 || localY < 0 || localX >= activeCel.width || localY >= activeCel.height) continue;
            const center = tilemapCellAtPixel(activeTileset, activeCel.tilemap, localX, localY);
            const candidates = terrainBrushCells(layout, center, terrainBrushRadius, terrainBrushShape);
            const targets = tiledStampGeometry
              ? mapTiledCellTargets(tiledStampGeometry, candidates.map((cell) => ({cell, value: nextTerrain})))
                .map(({cell}) => cell)
              : candidates;
            for (const cell of targets) {
              if (terrainScatterAllows(terrainmap.seed, cell.column, cell.row, terrainScatterPercent)) recordTerrainCell(cell);
            }
          }
        }
      }
      if (changedTerrainCells.size > 0) {
        dirtyTileCells.push(...recalculateTerrainCells(
          terrainmap,
          activeTileset.terrains,
          tilesetGridLayout(activeTileset, activeCel.tilemap),
          activeCel.tilemap.tiles,
          [...changedTerrainCells.values()],
        ));
      }
    } else if (tilemapDrawMode === "pixels") {
      const previous = tilemapLastPointRef.current ?? point;
      for (const sample of pointerSamples(previous)) {
        if (selection && selectionCoverageAt(selection, sample.x, sample.y) === 0) continue;
        const localX = sample.x - activeCel.x;
        const localY = sample.y - activeCel.y;
        if (localX < 0 || localY < 0 || localX >= activeCel.width || localY >= activeCel.height) continue;
        const cell = tilemapCellAtPixel(activeTileset, activeCel.tilemap, localX, localY);
        if (cell.column < 0 || cell.row < 0 || cell.column >= activeCel.tilemap.columns || cell.row >= activeCel.tilemap.rows) continue;
        const imageOrigin = tileCellImageOrigin(activeTileset, activeCel.tilemap, cell);
        if (localX < imageOrigin.x || localY < imageOrigin.y
          || localX >= imageOrigin.x + activeTileset.tileWidth || localY >= imageOrigin.y + activeTileset.tileHeight) continue;
        const nextColor: RGBA = selectedTool === "eraser"
          ? [0, 0, 0, 0]
          : secondary ? backgroundRGBA : foregroundRGBA;
        const pixelOffset = (localY * activeCel.width + localX) * 4;
        if (activeCel.pixels[pixelOffset] === nextColor[0]
          && activeCel.pixels[pixelOffset + 1] === nextColor[1]
          && activeCel.pixels[pixelOffset + 2] === nextColor[2]
          && activeCel.pixels[pixelOffset + 3] === nextColor[3]) continue;
        if (!detachTerrainForWrite()) continue;
        drawTilemapPixelInPlace(activeCel, activeTileset, localX, localY, nextColor, {
          mode: tilePixelSyncMode,
          palette: pixelDocument.colorMode === "indexed" ? pixelDocument.palette.colors : undefined,
          transparentIndex: pixelDocument.palette.transparentIndex,
          referenceTilemaps: tilePixelSyncMode === "auto" ? tilemapBuffersForTileset(activeTileset.id) : undefined,
        });
        changed = true;
      }
    }
    tilemapLastPointRef.current = point;
    if (changed) {
      if (tilemapDrawMode === "pixels") refreshTilemapCaches(pixelDocument);
      if (tilemapDrawMode !== "pixels") renderTilemapCelIntoCache(activeCel, activeTileset, {
        palette: pixelDocument.colorMode === "indexed" ? pixelDocument.palette.colors : undefined,
        transparentIndex: pixelDocument.palette.transparentIndex,
      });
      if (pixelDocument.colorMode === "indexed") syncIndexedCel(pixelDocument, activeCel);
      for (const linked of Object.values(pixelDocument.cels)) {
        if (linked.id === activeCel.id || linked.linkId !== activeCel.linkId) continue;
        linked.tilemap = activeCel.tilemap;
        linked.terrainmap = activeCel.terrainmap;
        linked.pixels = activeCel.pixels;
        linked.indexes = activeCel.indexes;
      }
      tilemapEditChangedRef.current = true;
      if (tilemapDrawMode === "pixels") {
        invalidatePixels({x: 0, y: 0, width: pixelDocument.width, height: pixelDocument.height});
      } else {
        invalidateTilemapCells(activeCel, activeTileset, dirtyTileCells);
      }
    }
    if (phase === "end" || tilemapPromptEndedGestureRef.current) {
      if (tilemapDrawMode === "pixels" && tilePixelSyncMode === "auto" && tilemapEditChangedRef.current) {
        const cleanup = cleanupTilesetInPlace(activeTileset, tilemapBuffersForTileset(activeTileset.id));
        if (cleanup.changed) {
          const remappedSelectedTile = cleanup.tileIDMap.get(selectedTileID);
          if (remappedSelectedTile !== undefined && remappedSelectedTile !== selectedTileID) setSelectedTileID(remappedSelectedTile);
          refreshTilemapCaches(pixelDocument);
          invalidatePixels({x: 0, y: 0, width: pixelDocument.width, height: pixelDocument.height});
        }
      }
      const before = tilemapEditBeforeRef.current;
      if (before && tilemapEditChangedRef.current) {
        const label = tilemapDrawMode === "terrain" ? "Draw Terrain"
          : tilemapDrawMode === "tiles" ? "Draw Tiles" : "Draw Tile Pixels";
        history.commit(new DocumentStateCommand(before, pixelDocument, label));
        setStatus(label);
      } else if (tilemapDrawMode === "tiles" && tilemapCellChangesRef.current.size > 0) {
        const label = tilemapToolMode === "fill"
          ? "Fill Tiles"
          : tilemapToolMode === "stamp"
            ? "Stamp Tiles"
          : tilemapToolMode === "line"
            ? "Draw Tile Line"
            : tilemapToolMode === "rectangle"
              ? "Draw Tile Rectangle"
              : "Draw Tiles";
        history.commit(new TilemapCellsCommand(activeCel.id, [...tilemapCellChangesRef.current].map(([index, change]) => ({
          index,
          before: change.before,
          after: change.after,
        })), label));
        setStatus(label);
      } else if (tilemapDrawMode === "terrain" && terrainCellChangesRef.current.size > 0) {
        history.commit(new TerrainCellsCommand(activeCel.id, [...terrainCellChangesRef.current].map(([index, change]) => ({
          index,
          before: change.before,
          after: change.after,
        })), "Draw Terrain"));
        setStatus("Draw Terrain");
      }
      tilemapEditBeforeRef.current = null;
      tilemapLastPointRef.current = null;
      tilemapGestureStartCellRef.current = null;
      tilemapGestureStartPointRef.current = null;
      tilemapCellChangesRef.current.clear();
      terrainCellChangesRef.current.clear();
      tilemapEditChangedRef.current = false;
      tilemapAuthorityDeclinedRef.current = false;
    }
    return true;
  };

  const deleteCurrentFrames = () => {
    if (selectedFrameIds.length >= pixelDocument.frames.length) return false;
    if (preferences.alerts.deleteFrame && !window.confirm(language === "zh" ? "删除所选帧？" : "Delete the selected frames?")) return false;
    return mutateDocument("Delete Frame", () => {
      if (!deleteFrames(pixelDocument, selectedFrameIds)) return false;
      activeTab.selectedFrameIds = [pixelDocument.activeFrameId];
      activeTab.frameSelectionAnchorId = pixelDocument.activeFrameId;
      setTabCommandScope(activeTab, "frame");
      return true;
    });
  };

  const appendTimelineFrame = (layerId?: string) => {
    if (isPlaying) return;
    mutateDocument(layerId ? "Append Frame and Cel" : "Append Empty Frame", () => {
      const lastFrame = pixelDocument.frames.at(-1);
      if (lastFrame) pixelDocument.activeFrameId = lastFrame.id;
      const extendLoop = shouldExtendTimelineLoopAfterInsertion(activeTab);
      const frame = addEmptyFrame(pixelDocument, lastFrame?.durationMs ?? 100, backgroundClearColor);
      extendTimelineLoopAfterInsertion(activeTab, extendLoop);
      activeTab.selectedFrameIds = [frame.id];
      activeTab.frameSelectionAnchorId = frame.id;
      if (!layerId) {
        setTabCommandScope(activeTab, "frame");
        return true;
      }
      const layer = getLayerByID(pixelDocument, layerId);
      if (!layer || !isCelLayer(layer)) return true;
      const cel = ensureCel(pixelDocument, layer.id, frame.id);
      pixelDocument.activeLayerId = layer.id;
      const key = celSelectionKey(layer.id, frame.id);
      activeTab.selectedCelKeys = [key];
      activeTab.celSelectionAnchor = {layerId: layer.id, frameId: frame.id};
      setTabCommandScope(activeTab, "cels");
      return Boolean(cel);
    });
  };

  const beginTimelineCelDrag = (event: ReactDragEvent<HTMLButtonElement>, layerId: string, frameId: string) => {
    if (isPlaying) return;
    const target = {layerId, frameId};
    const targetKey = celSelectionKey(layerId, frameId);
    let addresses = activeTab.commandScope === "cels" && activeTab.selectedCelKeys.includes(targetKey)
      ? selectedCels.filter((address) => visibleTimelineImageLayerIDs.includes(address.layerId) && Boolean(getCel(pixelDocument, address.layerId, address.frameId)))
      : [target].filter((address) => Boolean(getCel(pixelDocument, address.layerId, address.frameId)));
    if (addresses.length === 0) return;
    if (!activeTab.commandScope || !activeTab.selectedCelKeys.includes(targetKey)) {
      const selected = selectCel(layerId, frameId);
      if (selected && getCel(pixelDocument, selected.layerId, selected.frameId)) addresses = [selected];
    }
    const anchor = activeTab.celSelectionAnchor && addresses.some((address) => celSelectionKey(address.layerId, address.frameId) === celSelectionKey(activeTab.celSelectionAnchor!.layerId, activeTab.celSelectionAnchor!.frameId))
      ? {...activeTab.celSelectionAnchor}
      : {...target};
    const copy = event.ctrlKey || event.metaKey;
    timelineCelDragRef.current = {sourceAddresses: addresses.map((address) => ({...address})), sourceAnchor: anchor, copy};
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("application/x-pixtorio-timeline-cel", JSON.stringify({source: addresses, anchor}));
    event.dataTransfer.setData("text/plain", copy ? "copy-cel" : "move-cel");
    setStatus(copy
      ? (language === "zh" ? "拖动复制动画格" : "Drag to copy cels")
      : (language === "zh" ? "拖动移动动画格" : "Drag to move cels"));
  };

  const handleTimelineCelDragOver = (event: ReactDragEvent<HTMLButtonElement>) => {
    if (!timelineCelDragRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = event.ctrlKey || event.metaKey || timelineCelDragRef.current.copy ? "copy" : "move";
  };

  const finishTimelineCelDrag = (event: ReactDragEvent<HTMLButtonElement>, layerId: string, frameId?: string, targetFrameIndex?: number) => {
    const session = timelineCelDragRef.current;
    if (!session) return;
    event.preventDefault();
    const copy = event.ctrlKey || event.metaKey || session.copy;
    const target = frameId ? {layerId, frameId} : undefined;
    const extendLoop = shouldExtendTimelineLoopAfterInsertion(activeTab);
    let transferred = false;
    const changed = mutateDocument(copy ? "Copy Timeline Cels" : "Move Timeline Cels", () => {
      const result = transferTimelineCels(pixelDocument, {
        sourceAddresses: session.sourceAddresses,
        sourceAnchor: session.sourceAnchor,
        targetAnchor: target,
        targetLayerId: target ? undefined : layerId,
        targetFrameIndex,
        orderedLayerIds: visibleTimelineImageLayerIDs,
        mode: copy ? "copy" : "move",
        backgroundColor: backgroundClearColor,
      });
      if (!result) return false;
      transferred = true;
      extendTimelineLoopAfterInsertion(activeTab, extendLoop);
      const destinationFrame = frameId
        ? pixelDocument.frames.find((frame) => frame.id === frameId)
        : targetFrameIndex === undefined ? undefined : pixelDocument.frames[targetFrameIndex];
      if (!destinationFrame) return false;
      activeTab.selectedCelKeys = result.targetAddresses.map((address) => celSelectionKey(address.layerId, address.frameId));
      activeTab.celSelectionAnchor = {layerId, frameId: destinationFrame.id};
      activeTab.commandScope = "cels";
      activeTab.activeTagId = undefined;
      activeTab.selection = null;
      const selectedFrameIDs = new Set([
        ...result.createdFrameIds,
        ...result.targetAddresses.map((address) => address.frameId),
      ]);
      activeTab.selectedFrameIds = pixelDocument.frames.filter((frame) => selectedFrameIDs.has(frame.id)).map((frame) => frame.id);
      activeTab.frameSelectionAnchorId = destinationFrame.id;
      pixelDocument.activeLayerId = layerId;
      pixelDocument.activeFrameId = destinationFrame.id;
      return true;
    });
    timelineCelDragRef.current = null;
    if (!changed || !transferred) setStatus(language === "zh" ? "动画格无法移动到此处" : "Cels cannot be moved here");
  };

  const cancelTimelineCelDrag = () => {
    timelineCelDragRef.current = null;
  };

  const selectCel = (layerId: string, frameId: string, extend = false, toggle = false) => {
    const target = {layerId, frameId};
    const result = selectTimelineCel(
      pixelDocument,
      visibleTimelineImageLayerIDs,
      activeTab.selectedCelKeys,
      activeTab.celSelectionAnchor,
      target,
      {
        extend,
        toggle,
        active: {layerId: pixelDocument.activeLayerId, frameId: pixelDocument.activeFrameId},
      },
    );
    const addresses = selectedCelAddresses(pixelDocument, result.keys);
    if (addresses.length === 0) return null;
    const targetKey = celSelectionKey(layerId, frameId);
    const nextActive = result.keys.includes(targetKey)
      ? target
      : addresses.find((address) => address.layerId === pixelDocument.activeLayerId && address.frameId === pixelDocument.activeFrameId) ?? addresses[0];

    activeTab.selectedCelKeys = result.keys;
    activeTab.celSelectionAnchor = result.anchor;
    activeTab.commandScope = "cels";
    activeTab.activeTagId = undefined;
    activeTab.selection = null;
    activeTab.selectedFrameIds = pixelDocument.frames
      .filter((frame) => addresses.some((address) => address.frameId === frame.id))
      .map((frame) => frame.id);
    activeTab.frameSelectionAnchorId = nextActive.frameId;
    pixelDocument.activeLayerId = nextActive.layerId;
    pixelDocument.activeFrameId = nextActive.frameId;
    setRenamingLayerId(null);
    setStatus("Selected Cels");
    invalidate();
    return nextActive;
  };

  const focusTimelineCel = (grid: HTMLElement | null, address: CelAddress) => {
    const targetKey = celSelectionKey(address.layerId, address.frameId);
    const target = Array.from(grid?.querySelectorAll<HTMLButtonElement>(".timeline-cel[data-cel-key]") ?? [])
      .find((element) => element.dataset.celKey === targetKey);
    target?.focus();
  };

  const focusTimelineFrame = (root: HTMLElement | null, frameId: string) => {
    const target = Array.from(root?.querySelectorAll<HTMLButtonElement>(".timeline-frame-number[data-frame-id]") ?? [])
      .find((element) => element.dataset.frameId === frameId);
    target?.focus();
  };

  const navigateTimelineCel = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    layerId: string,
    frameId: string,
  ) => {
    const rowIndex = visibleTimelineImageLayerIDs.indexOf(layerId);
    const columnIndex = pixelDocument.frames.findIndex((frame) => frame.id === frameId);
    if (rowIndex < 0 || columnIndex < 0) return;

    const grid = event.currentTarget.closest<HTMLElement>("[role=grid]");
    if (event.key === "ArrowUp" && rowIndex === 0) {
      event.preventDefault();
      const nextActiveFrameId = selectFrame(frameId);
      if (nextActiveFrameId) focusTimelineFrame(grid, nextActiveFrameId);
      return;
    }

    let nextRow = rowIndex;
    let nextColumn = columnIndex;
    if (event.key === "ArrowUp") nextRow = Math.max(0, rowIndex - 1);
    else if (event.key === "ArrowDown") nextRow = Math.min(visibleTimelineImageLayerIDs.length - 1, rowIndex + 1);
    else if (event.key === "ArrowLeft") nextColumn = Math.max(0, columnIndex - 1);
    else if (event.key === "ArrowRight") nextColumn = Math.min(pixelDocument.frames.length - 1, columnIndex + 1);
    else if (event.key === "Home") nextColumn = 0;
    else if (event.key === "End") nextColumn = pixelDocument.frames.length - 1;
    else return;

    event.preventDefault();
    if (nextRow === rowIndex && nextColumn === columnIndex) return;
    const nextLayerId = visibleTimelineImageLayerIDs[nextRow];
    const nextFrameId = pixelDocument.frames[nextColumn]?.id;
    if (!nextLayerId || !nextFrameId) return;
    const nextActive = selectCel(nextLayerId, nextFrameId, event.shiftKey);
    if (nextActive) focusTimelineCel(grid, nextActive);
  };

  const navigateTimelineFrame = (event: ReactKeyboardEvent<HTMLButtonElement>, frameId: string) => {
    const frameIndex = pixelDocument.frames.findIndex((frame) => frame.id === frameId);
    if (frameIndex < 0) return;

    const grid = event.currentTarget.closest<HTMLElement>("[role=grid]");
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextLayerId = visibleTimelineImageLayerIDs.includes(pixelDocument.activeLayerId)
        ? pixelDocument.activeLayerId
        : visibleTimelineImageLayerIDs[0];
      if (!nextLayerId) return;
      const nextActive = selectCel(nextLayerId, frameId);
      if (nextActive) focusTimelineCel(grid, nextActive);
      return;
    }

    let nextIndex = frameIndex;
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, frameIndex - 1);
    else if (event.key === "ArrowRight") nextIndex = Math.min(pixelDocument.frames.length - 1, frameIndex + 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = pixelDocument.frames.length - 1;
    else return;

    event.preventDefault();
    if (nextIndex === frameIndex) return;
    const nextFrameId = pixelDocument.frames[nextIndex]?.id;
    if (!nextFrameId) return;
    const nextActiveFrameId = selectFrame(nextFrameId, event.shiftKey);
    if (nextActiveFrameId) focusTimelineFrame(grid, nextActiveFrameId);
  };

  const selectTag = (tagId: string) => {
    activeTab.activeTagId = tagId || undefined;
    const tag = pixelDocument.tags.find((candidate) => candidate.id === tagId);
    if (tag) {
      syncTabToActiveTag(activeTab);
      pixelDocument.activeFrameId = tag.direction === "reverse" ? tag.toFrameId : tag.fromFrameId;
      playbackDirectionRef.current = 1;
      playbackLoopCountRef.current = 0;
    }
    invalidate();
  };

  const focusCurrentTag = () => {
    const currentTagIsValid = Boolean(activeTab.activeTagId && pixelDocument.tags.some((tag) => tag.id === activeTab.activeTagId));
    const candidateId = currentTagIsValid
      ? activeTab.activeTagId
      : focusTagIdForFrame(pixelDocument, pixelDocument.activeFrameId)
        ?? focusTagIdForFrame(pixelDocument, selectedFrameIds[0]);
    if (!candidateId) {
      setStatus(language === "zh" ? "当前帧没有可聚焦的标签" : "The current frame is not covered by a tag");
      return false;
    }
    activeTab.activeTagId = candidateId;
    if (!syncTabToActiveTag(activeTab)) {
      activeTab.activeTagId = undefined;
      setStatus(language === "zh" ? "无法聚焦当前帧标签" : "Could not focus the selected tag");
      return false;
    }
    const entry = focusedFrameIdAtEntry(pixelDocument, {tagId: candidateId});
    if (entry) pixelDocument.activeFrameId = entry;
    playbackDirectionRef.current = 1;
    playbackLoopCountRef.current = 0;
    setStatus(language === "zh" ? "已聚焦帧标签" : "Frame tag focused");
    invalidate();
    return true;
  };

  const openNewTagDialog = () => {
    const ordered = pixelDocument.frames.filter((frame) => selectedFrameIds.includes(frame.id));
    setTagDialog({
      name: nextTagName(pixelDocument, ui.tagBaseName),
      fromFrameId: ordered[0]?.id ?? pixelDocument.activeFrameId,
      toFrameId: ordered.at(-1)?.id ?? pixelDocument.activeFrameId,
      direction: "forward",
      color: foregroundColor,
      repeat: 0,
    });
  };

  const openEditTagDialog = () => {
    if (!activeTag) return;
    setTagDialog({...activeTag, tagId: activeTag.id});
  };

  const applyTagDialog = () => {
    if (!tagDialog) return;
    let nextTagId = tagDialog.tagId;
    const changed = mutateDocument(tagDialog.tagId ? "Edit Frame Tag" : "Add Frame Tag", () => {
      if (tagDialog.tagId) {
        const updated = updateFrameTag(pixelDocument, tagDialog.tagId, {
          name: tagDialog.name,
          fromFrameId: tagDialog.fromFrameId,
          toFrameId: tagDialog.toFrameId,
          direction: tagDialog.direction,
          color: tagDialog.color,
          repeat: Math.max(0, Math.min(65535, Math.round(tagDialog.repeat))),
        });
        if (updated) syncTabToActiveTag(activeTab);
        return updated;
      }
      const tag = addFrameTag(pixelDocument, tagDialog.name, tagDialog.fromFrameId, tagDialog.toFrameId, tagDialog.direction, tagDialog.color);
      nextTagId = tag?.id;
      if (tag) tag.repeat = Math.max(0, Math.min(65535, Math.round(tagDialog.repeat)));
      if (nextTagId) {
        activeTab.activeTagId = nextTagId;
        syncTabToActiveTag(activeTab);
      }
      return Boolean(tag);
    });
    if (!changed) return;
    setTagDialog(null);
    if (nextTagId) {
      playbackDirectionRef.current = 1;
      invalidate();
    }
  };

  const removeActiveTag = () => {
    if (!activeTag) return;
    const tagId = activeTag.id;
    if (mutateDocument("Delete Frame Tag", () => deleteFrameTag(pixelDocument, tagId))) activeTab.activeTagId = undefined;
  };

  const toggleGroup = (groupId: string) => {
    const collapsed = new Set(activeTab.collapsedGroupIds);
    if (collapsed.has(groupId)) collapsed.delete(groupId);
    else collapsed.add(groupId);
    activeTab.collapsedGroupIds = collapsed;
    setUIRevision((value) => value + 1);
  };

  const toggleDetachedPreview = () => {
    const current = detachedPreviewRef.current;
    if (current && !current.closed) {
      current.close();
      detachedPreviewRef.current = null;
      setPreviewOpen(false);
      return;
    }
    const preview = window.open("", "pixtorio-animation-preview", "popup=yes,width=360,height=420,resizable=yes");
    if (!preview) {
      setPreviewOpen((value) => !value);
      return;
    }
    preview.document.open();
    preview.document.write(`<!doctype html><html data-theme="${lightTheme ? "light" : "dark"}"><head><meta charset="utf-8"><title>Pixtorio</title><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#1c1d20;color:#ddd;font:12px "Segoe UI",sans-serif}html[data-theme=light] body{background:#dde0e3;color:#333}main{display:grid;grid-template-rows:minmax(0,1fr) 34px;width:100%;height:100%}.stage{display:grid;place-items:center;padding:12px}.stage canvas{max-width:100%;max-height:100%;width:auto;height:auto;image-rendering:pixelated;box-shadow:0 0 0 1px rgb(127 127 127 / 45%)}footer{display:flex;align-items:center;justify-content:center;border-top:1px solid rgb(127 127 127 / 35%)}</style></head><body><main><div class="stage"><canvas></canvas></div><footer data-counter></footer></main></body></html>`);
    preview.document.close();
    detachedPreviewRef.current = preview;
    setPreviewOpen(false);
    invalidate();
  };

  const showAllPanels = () => {
    setCanvasOnly(false);
    setInspectorVisible(true);
    setTimelineVisible(true);
  };

  const toggleFullscreen = () => {
    if (hasWailsRuntimeBridge()) {
      void WindowIsFullscreen().then((fullscreen) => {
        if (fullscreen) WindowUnfullscreen();
        else WindowFullscreen();
        setIsFullscreen(!fullscreen);
      }).catch(() => undefined);
      return;
    }
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    const target = document.documentElement;
    if (target.requestFullscreen) void target.requestFullscreen().catch(() => undefined);
  };

  const togglePlayback = () => {
    playbackDirectionRef.current = 1;
    playbackLoopCountRef.current = 0;
    if (isPlaying && preferences.timeline.rewindOnStop) {
      const startFrameId = activeTag?.direction === "reverse"
        ? activeTag.toFrameId
        : activeTag?.fromFrameId ?? activeTab.loopStartFrameId;
      syncPlaybackFrameSelection(activeTab, startFrameId);
      invalidate();
    } else if (!isPlaying) {
      syncPlaybackFrameSelection(activeTab);
    }
    setIsPlaying((value) => !value);
  };

  const dispatchCommandShortcut = (command: CommandShortcutID) => {
    switch (command) {
      case "new": newDocument(); return;
      case "newFromSelection": newDocumentFromSelection(); return;
      case "open": void openPixio(); return;
      case "importPNG": void importPNG(); return;
      case "importSpriteSheet": void importSpriteSheet(); return;
      case "importPNGSequence": void importPNGSequence(); return;
      case "save": void savePixio(); return;
      case "saveAs": void savePixio(true); return;
      case "exportPNG": setExportDialog("png"); return;
      case "exportGIF": setExportDialog("gif"); return;
      case "exportSpriteSheet": setExportDialog("sheet"); return;
      case "exportPNGSequence": void exportPNGSequence(); return;
      case "closeDocument": closeTab(activeTab); return;
      case "undo": undo(); return;
      case "redo": redo(); return;
      case "selectAll":
        setSelection({x: 0, y: 0, width: pixelDocument.width, height: pixelDocument.height});
        setStatus("Selected All");
        return;
      case "deselect":
        if (selection) {
          setSelection(null);
          setStatus("Selection cleared");
        }
        return;
      case "reselect":
        if (!selection && activeTab.lastSelection) setSelection(cloneSelection(activeTab.lastSelection));
        return;
      case "copy":
        if (activeTab.commandScope === "cels") copyCurrentCels();
        else if (activeTab.commandScope === "canvas" && selection) copyCurrentSelection();
        return;
      case "copyMerged": copyMergedSelection(); return;
      case "cut":
        if (activeTab.commandScope === "cels") cutCurrentCels();
        else if (activeTab.commandScope === "canvas" && selection) cutCurrentSelection();
        return;
      case "paste":
        if (activeTab.commandScope === "cels") pasteCurrentCels();
        else if (activeTab.commandScope === "canvas") void pasteSystemSelection();
        return;
      case "pasteSpecialNewSprite": void pasteSpecialNewSprite(); return;
      case "pasteSpecialNewLayer": void pasteSpecialToLayer(false); return;
      case "pasteSpecialReferenceLayer": void pasteSpecialToLayer(true); return;
      case "fillSelection": fillCurrentSelection(); return;
      case "strokeSelection": strokeCurrentSelection(); return;
      case "copySelectionToLayer": selectionToNewLayer(false); return;
      case "cutSelectionToLayer": selectionToNewLayer(true); return;
      case "copySelectedFramesToDocument": openCrossDocumentCopyDialog(); return;
      case "copySelectedLayersToDocument": openCrossDocumentCopyDialog("layers"); return;
      case "shiftPixelsLeft": shiftCurrentPixels(-1, 0); return;
      case "shiftPixelsRight": shiftCurrentPixels(1, 0); return;
      case "shiftPixelsUp": shiftCurrentPixels(0, -1); return;
      case "shiftPixelsDown": shiftCurrentPixels(0, 1); return;
      case "selectOpaque": selectOpaqueContent(); return;
      case "selectColor": selectForegroundColor(); return;
      case "selectAllLayerCels": selectAllLayerCels(); return;
      case "selectLinkedCels": selectLinkedCels(); return;
      case "invertSelection": adjustSelection("invert"); return;
      case "growSelection": adjustSelection("grow"); return;
      case "shrinkSelection": adjustSelection("shrink"); return;
      case "borderSelection": adjustSelection("border"); return;
      case "featherSelection":
        if (selection) setSelection(featherSelection(selection, selectionFeatherAmount, pixelDocument.width, pixelDocument.height));
        return;
      case "scaleSelection": transformCurrentSelection("scale"); return;
      case "rotateSelectionCCW": transformCurrentSelection("counterclockwise"); return;
      case "rotateSelectionCW": transformCurrentSelection("clockwise"); return;
      case "flipSelectionHorizontal": transformCurrentSelection("horizontal"); return;
      case "flipSelectionVertical": transformCurrentSelection("vertical"); return;
      case "applySelectionPosition": moveCurrentSelectionNumerically(); return;
      case "applySelectionRotation": rotateCurrentSelectionArbitrary(); return;
      case "createBrushFromSelection": createBrushFromSelection(); return;
      case "createPatternFromSelection": createPatternFromSelection(); return;
      case "createSliceFromSelection": createSliceFromSelection(); return;
      case "duplicateSprite": duplicateCurrentSprite(); return;
      case "spriteSize": openSpriteSizeDialog(); return;
      case "canvasSize": openResizeDialog(); return;
      case "trimCanvas": mutateDocument("Trim Canvas", () => trimDocument(pixelDocument)); return;
      case "rotateSpriteCW": mutateDocument("Rotate Sprite Clockwise", () => rotateDocument(pixelDocument, "cw")); return;
      case "rotateSpriteCCW": mutateDocument("Rotate Sprite Counterclockwise", () => rotateDocument(pixelDocument, "ccw")); return;
      case "rotateSprite180": mutateDocument("Rotate Sprite 180", () => rotateDocument(pixelDocument, "180")); return;
      case "flipSpriteHorizontal": mutateDocument("Flip Sprite Horizontally", () => flipDocument(pixelDocument, "horizontal")); return;
      case "flipSpriteVertical": mutateDocument("Flip Sprite Vertically", () => flipDocument(pixelDocument, "vertical")); return;
      case "colorConfiguration": openColorProfileDialog(); return;
      case "adjustmentBrightnessContrast": openAdjustment("brightness-contrast"); return;
      case "adjustmentHSL": openAdjustment("hsl"); return;
      case "adjustmentInvert": openAdjustment("invert"); return;
      case "adjustmentConvolution": openAdjustment("convolution"); return;
      case "adjustmentMedian": openAdjustment("median"); return;
      case "adjustmentDespeckle": openAdjustment("despeckle"); return;
      case "adjustmentCurves": openAdjustment("curves"); return;
      case "adjustmentHSVHSL": openAdjustment("hsv-hsl"); return;
      case "adjustmentChannels": openAdjustment("channel-mask"); return;
      case "effectOutline": openAdjustment("outline"); return;
      case "effectShading": applyShadeEffect(); return;
      case "addPaletteColor": addPaletteColor(); return;
      case "updatePaletteColor": updatePaletteColor(); return;
      case "removePaletteColor": removePaletteColor(); return;
      case "extractPalette": extractDocumentPalette(); return;
      case "sortPalette": sortDocumentPalette(); return;
      case "saveDefaultPalette":
        try { saveDefaultPalette(localStorage, pixelDocument.palette); setStatus(language === "zh" ? "默认调色板已保存，用于新建文件" : "Default palette saved for new documents"); }
        catch { setStatus(language === "zh" ? "无法保存默认调色板" : "Could not save default palette"); }
        return;
      case "applyDefaultPalette": mutateDocument(language === "zh" ? "应用默认调色板" : "Apply Default Palette", () => applyDocumentPalette(pixelDocument, readDefaultPalette(localStorage))); return;
      case "resetDefaultPalette":
        try { resetDefaultPalette(localStorage); setStatus(language === "zh" ? "已恢复内置默认调色板，当前文件不变" : "Built-in default palette restored; current document unchanged"); }
        catch { setStatus(language === "zh" ? "无法恢复默认调色板" : "Could not restore default palette"); }
        return;
      case "importPalette": void importPaletteFile(); return;
      case "exportGPL": exportPaletteFile("gpl"); return;
      case "exportJASCPAL": exportPaletteFile("jasc-pal"); return;
      case "addLayer":
        mutateDocument("Add Layer", () => { const layer = addLayer(pixelDocument, nextLayerName(pixelDocument, ui.layerBaseName)); if (!layer) return false; setTabCommandScope(activeTab, "layer"); return true; });
        return;
      case "addGroup":
        mutateDocument("Add Layer Group", () => { const group = addLayerGroup(pixelDocument, nextGroupName(pixelDocument, ui.groupBaseName)); if (!group) return false; setTabCommandScope(activeTab, "layer"); return true; });
        return;
      case "addTilemapLayer": createTilemapLayer(); return;
      case "convertLayerToTilemap": convertActiveLayerToTiles(); return;
      case "duplicateLayer": duplicateSelectedLayers(); return;
      case "layerProperties": openLayerProperties(); return;
      case "moveLayerUp": moveSelectedLayers("up"); return;
      case "moveLayerDown": moveSelectedLayers("down"); return;
      case "mergeLayerDown":
        if (selectedLayers.length > 1) mergeSelectedLayers();
        else mutateDocument("Merge Layer Down", () => { const changed = mergeLayerDown(pixelDocument); if (changed) { activeTab.selectedLayerIds = [pixelDocument.activeLayerId]; setTabCommandScope(activeTab, "layer"); } return changed; });
        return;
      case "mergeSelectedLayers": mergeSelectedLayers(); return;
      case "flattenVisibleLayers": flattenDocumentLayers(); return;
      case "toggleLayerVisibility":
        mutateDocument(activeLayer.visible ? "Hide Layer" : "Show Layer", () => { let changed = false; for (const target of layerTargetsFor()) changed = setLayerVisibility(pixelDocument, target.id, !activeLayer.visible) || changed; return changed; });
        return;
      case "toggleLayerLock":
        mutateDocument(activeLayer.locked ? "Unlock Layer" : "Lock Layer", () => { let changed = false; for (const target of layerTargetsFor()) changed = setLayerLocked(pixelDocument, target.id, !activeLayer.locked) || changed; return changed; });
        return;
      case "toggleAlphaLock":
        if (isImageLayer(activeLayer)) mutateSelectedLayers("Change Alpha Lock", (layerId) => setLayerAlphaLock(pixelDocument, layerId, !activeLayer.alphaLock));
        return;
      case "toggleContinuous":
        if (isImageLayer(activeLayer)) mutateSelectedLayers("Change Continuous Layers", (layerId) => setLayerContinuous(pixelDocument, layerId, !activeLayer.continuous));
        return;
      case "addFrame":
        mutateDocument("Add Frame", () => { const extendLoop = shouldExtendTimelineLoopAfterInsertion(activeTab); const frame = addFrame(pixelDocument); extendTimelineLoopAfterInsertion(activeTab, extendLoop); activeTab.selectedFrameIds = [frame.id]; activeTab.frameSelectionAnchorId = frame.id; setTabCommandScope(activeTab, "frame"); return true; });
        return;
      case "newEmptyFrame":
        mutateDocument("New Empty Frame", () => { const extendLoop = shouldExtendTimelineLoopAfterInsertion(activeTab); const frame = addEmptyFrame(pixelDocument, 100, backgroundClearColor); extendTimelineLoopAfterInsertion(activeTab, extendLoop); activeTab.selectedFrameIds = [frame.id]; activeTab.frameSelectionAnchorId = frame.id; setTabCommandScope(activeTab, "frame"); return true; });
        return;
      case "duplicateFrame":
        mutateDocument("Duplicate Frame", () => { const extendLoop = shouldExtendTimelineLoopAfterInsertion(activeTab); const frames = duplicateFrames(pixelDocument, selectedFrameIds); if (frames.length === 0) return false; extendTimelineLoopAfterInsertion(activeTab, extendLoop); activeTab.selectedFrameIds = frames.map((frame) => frame.id); activeTab.frameSelectionAnchorId = frames[0].id; setTabCommandScope(activeTab, "frame"); return true; });
        return;
      case "deleteFrame": deleteCurrentFrames(); return;
      case "moveFrameBackward": mutateDocument("Move Frame", () => { const changed = moveFrames(pixelDocument, selectedFrameIds, "backward"); if (changed) setTabCommandScope(activeTab, "frame"); return changed; }); return;
      case "moveFrameForward": mutateDocument("Move Frame", () => { const changed = moveFrames(pixelDocument, selectedFrameIds, "forward"); if (changed) setTabCommandScope(activeTab, "frame"); return changed; }); return;
      case "previousFrame": navigateFrame(-1); return;
      case "nextFrame": navigateFrame(1); return;
      case "reverseFrames": mutateDocument("Reverse Frames", () => reverseFrames(pixelDocument, selectedFrameIds)); return;
      case "createCels":
        mutateDocument("Create Cels", () => { const addresses = activeTab.commandScope === "cels" && selectedCels.length ? selectedCels : [{layerId: activeLayer.id, frameId: pixelDocument.activeFrameId}]; let changed = false; for (const address of addresses) { if (getCel(pixelDocument, address.layerId, address.frameId)) continue; changed = Boolean(ensureCel(pixelDocument, address.layerId, address.frameId)) || changed; } return changed; });
        return;
      case "duplicateCels": duplicateCurrentCels(); return;
      case "duplicateLinkedCels": duplicateCurrentCels(true); return;
      case "deleteCels": clearCurrentCels(); return;
      case "linkCels": linkCurrentCels(); return;
      case "unlinkCels": unlinkCurrentCels(); return;
      case "celProperties": openCelProperties(); return;
      case "applyCelTransform": applySelectedCelTransform(); return;
      case "rasterizeCels": rasterizeSelectedCels(); return;
      case "togglePlayback": togglePlayback(); return;
      case "addTag": openNewTagDialog(); return;
      case "editTag": openEditTagDialog(); return;
      case "deleteTag": removeActiveTag(); return;
      case "focusTag": focusCurrentTag(); return;
      case "toggleInspector": setInspectorVisible((value) => !value); return;
      case "toggleTimeline": setTimelineVisible((value) => !value); return;
      case "togglePixelGrid": setShowPixelGrid((value) => !value); return;
      case "toggleOnionSkin": setOnionSkin((value) => !value); return;
      case "toggleCanvasOnly": setCanvasOnly((value) => !value); return;
      case "showAllPanels": showAllPanels(); return;
      case "toggleFullscreen": toggleFullscreen(); return;
      case "detachedPreview": toggleDetachedPreview(); return;
      case "resetWorkspace":
        setInspectorWidth(defaultWorkspaceDimensions.inspectorWidth);
        setTimelineHeight(defaultWorkspaceDimensions.timelineHeight);
        setInspectorVisible(defaultWorkspaceVisibility.inspectorVisible);
        setTimelineVisible(defaultWorkspaceVisibility.timelineVisible);
        setCanvasOnly(false);
        setWorkspaceLayoutSelected("");
        setWorkspaceLayoutNotice("reset");
        return;
      case "showHistory": setHistoryOpen(true); return;
      case "openPreferences": setSettingsOpen(true); return;
      case "toggleTheme": setLightTheme((value) => !value); return;
      case "switchLanguage": setLanguage((value) => value === "en" ? "zh" : "en"); return;
      case "toggleGridSnap": mutateDocument("Change Grid Snapping", () => { pixelDocument.settings.snapToGrid = !pixelDocument.settings.snapToGrid; return true; }); return;
      case "toggleMirrorX": mutateDocument("Change Symmetry", () => { pixelDocument.settings.symmetryX = !pixelDocument.settings.symmetryX; return true; }); return;
      case "toggleMirrorY": mutateDocument("Change Symmetry", () => { pixelDocument.settings.symmetryY = !pixelDocument.settings.symmetryY; return true; }); return;
      case "toggleTileX": mutateDocument("Change Tiled Preview", () => { pixelDocument.settings.tiledX = !pixelDocument.settings.tiledX; return true; }); return;
      case "toggleTileY": mutateDocument("Change Tiled Preview", () => { pixelDocument.settings.tiledY = !pixelDocument.settings.tiledY; return true; }); return;
      case "addVerticalGuide": mutateDocument("Add Guide", () => { pixelDocument.guides.push({id: `guide-${Date.now()}-${pixelDocument.guides.length}`, axis: "vertical", position: pixelDocument.width / 2}); return true; }); return;
      case "addHorizontalGuide": mutateDocument("Add Guide", () => { pixelDocument.guides.push({id: `guide-${Date.now()}-${pixelDocument.guides.length}`, axis: "horizontal", position: pixelDocument.height / 2}); return true; }); return;
      case "setRGBA": changeColorMode("rgba"); return;
      case "setGrayscale": changeColorMode("grayscale"); return;
      case "setIndexed": changeColorMode("indexed"); return;
      case "setBitmap": changeColorMode("bitmap"); return;
      case "zoomIn": changeZoom(1); return;
      case "zoomOut": changeZoom(-1); return;
      case "delete":
        if ((selectedTool === "slice" || (selectedTool === "transform" && !selection)) && sliceBatchIDs.length > 0) deleteSelectedSlices();
        else if (activeTab.commandScope === "cels") clearCurrentCels();
        else if (activeTab.commandScope === "frame") deleteCurrentFrames();
        else if (activeTab.commandScope === "layer") {
          if (preferences.alerts.deleteLayer && !window.confirm(language === "zh" ? "删除所选图层？" : "Delete the selected layers?")) return;
          mutateDocument("Delete Layer", () => {
            let changed = false;
            for (const layerId of [...activeTab.selectedLayerIds].reverse()) {
              if (!getLayerByID(pixelDocument, layerId)) continue;
              changed = deleteLayer(pixelDocument, layerId) || changed;
            }
            activeTab.selectedLayerIds = [pixelDocument.activeLayerId];
            activeTab.layerSelectionAnchorId = pixelDocument.activeLayerId;
            return changed;
          });
        } else if (selection) {
          if (activeCel && canEditPixels) {
            commitPixelMutation("Delete Selection", () => clearSelection(activeCel.pixels, activeCel.width, selection, activeClearColor));
            if (!preferences.selection.keepAfterDelete) setSelection(null);
          } else if (isPlaying) setStatus("Pause playback to edit");
          else setStatus(isImageLayer(activeLayer) ? `${activeLayer.name} is locked` : "Select an image layer");
        }
        return;
      default: {
        const unreachable: never = command;
        throw new Error(`Unhandled command shortcut: ${unreachable}`);
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "escape" && canvasOnly) {
        event.preventDefault();
        setCanvasOnly(false);
        return;
      }
      if (key === "escape" && canvasDialog) {
        event.preventDefault();
        setCanvasDialog(null);
        return;
      }
      if (key === "escape" && layerPropertiesDialog) {
        event.preventDefault();
        setLayerPropertiesDialog(null);
        return;
      }
      if (key === "escape" && slicePropertiesDialog) {
        event.preventDefault();
        setSlicePropertiesDialog(null);
        return;
      }
      if (key === "escape" && tagDialog) {
        event.preventDefault();
        setTagDialog(null);
        return;
      }
      if (key === "escape" && crossDocumentCopyDialog) {
        event.preventDefault();
        setCrossDocumentCopyDialog(null);
        return;
      }
      if (key === "escape" && exportDialog) {
        event.preventDefault();
        setExportDialog(null);
        return;
      }
      if (key === "escape" && adjustmentDialog) {
        event.preventDefault();
        setAdjustmentDialog(null);
        return;
      }
      if (key === "escape" && spriteImportDialog) {
        event.preventDefault();
        setSpriteImportDialog(null);
        return;
      }
      if (key === "escape" && settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
        return;
      }
      if (key === "escape" && historyOpen) {
        event.preventDefault();
        setHistoryOpen(false);
        return;
      }
      if (key === "escape" && colorProfileDialog) {
        event.preventDefault();
        setColorProfileDialog(false);
        return;
      }
      if (key === "escape" && isViewMenuOpen) {
        event.preventDefault();
        setIsViewMenuOpen(false);
        return;
      }
      if (key === "escape" && isPaletteMenuOpen) {
        event.preventDefault();
        setIsPaletteMenuOpen(false);
        return;
      }
      if (key === "escape" && isSpriteMenuOpen) {
        event.preventDefault();
        setIsSpriteMenuOpen(false);
        setIsImageEffectsMenuOpen(false);
        return;
      }
      if (key === "escape" && isEditMenuOpen) {
        event.preventDefault();
        setIsEditMenuOpen(false);
        setIsPasteSpecialMenuOpen(false);
        setIsShiftPixelsMenuOpen(false);
        return;
      }
      if (key === "escape" && isRecentProjectsMenuOpen) {
        event.preventDefault();
        setIsRecentProjectsMenuOpen(false);
        return;
      }
      if (key === "escape" && isFileMenuOpen) {
        event.preventDefault();
        setIsFileMenuOpen(false);
        return;
      }
      if (celPropertiesDialog || canvasDialog || layerPropertiesDialog || slicePropertiesDialog || tagDialog || crossDocumentCopyDialog || exportDialog || adjustmentDialog || spriteImportDialog || settingsOpen || historyOpen || colorProfileDialog || isViewMenuOpen) return;
      const command = commandForShortcutEvent(event, commandShortcutAssignments);
      const editableTarget = isEditableTarget(event.target);
      if (command && editableTarget) return;
      const contextualDeleteScope = activeTab.commandScope === "frame" || activeTab.commandScope === "layer";
      if (hasOpenDocument && !editableTarget && contextualDeleteScope && isUnmodifiedDeletionKey(event) && (!command || command === "delete")) {
        event.preventDefault();
        dispatchCommandShortcut("delete");
        return;
      }
      const targetElement = typeof Element !== "undefined" && event.target instanceof Element ? event.target : null;
      const isTimelineNavigationKey = ["arrowleft", "arrowright", "arrowup", "arrowdown", "home", "end"].includes(key);
      const isTimelineNavigationTarget = Boolean(targetElement?.closest(".timeline-frame-number, .timeline-cel, .document-tab"));
      const preservesSelectionNavigation = Boolean(selection && (selectedTool === "selection" || selectedTool === "transform"));
      // Timeline grid buttons and document tabs own their arrow navigation.
      // Let their local selection handler run without a second global move.
      if (isTimelineNavigationTarget && isTimelineNavigationKey && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return;
      // Selection and transform tools reserve unmodified navigation keys for
      // moving or adjusting the current selection when that interaction is active.
      if (preservesSelectionNavigation && isTimelineNavigationKey && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return;
      if (!hasOpenDocument && command && !documentOptionalCommandIDs.has(command)) {
        if (command) event.preventDefault();
        return;
      }
      if (command) {
        event.preventDefault();
        dispatchCommandShortcut(command);
        return;
      }
      if (editableTarget) return;
      if (hasOpenDocument && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (key === "arrowleft" || key === "arrowright")) {
        event.preventDefault();
        dispatchCommandShortcut(key === "arrowleft" ? "previousFrame" : "nextFrame");
        return;
      }
      if (key === "backspace" && selection) {
        event.preventDefault();
        if (activeCel && canEditPixels) {
          commitPixelMutation("Delete Selection", () => clearSelection(activeCel.pixels, activeCel.width, selection, activeClearColor));
          if (!preferences.selection.keepAfterDelete) setSelection(null);
        } else if (isPlaying) {
          setStatus("Pause playback to edit");
        } else {
          setStatus(isImageLayer(activeLayer) ? `${activeLayer.name} is locked` : "Select an image layer");
        }
        return;
      }
      if (key === "escape" && selection) {
        setSelection(null);
        setStatus("Selection cleared");
        return;
      }
      const nextTool = !event.ctrlKey && !event.metaKey && !event.altKey ? shortcutToolByKey[key] : undefined;
      if (nextTool) {
        event.preventDefault();
        activateTool(nextTool);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeCel, activeClearColor, activeLayer, activeTab, activateTool, adjustmentDialog, canEditPixels, canvasDialog, canvasOnly, celPropertiesDialog, clearCurrentCels, colorProfileDialog, commandShortcutAssignments, commitPixelMutation, crossDocumentCopyDialog, dispatchCommandShortcut, exportDialog, hasOpenDocument, historyOpen, isEditMenuOpen, isFileMenuOpen, isPaletteMenuOpen, isPlaying, isRecentProjectsMenuOpen, isSpriteMenuOpen, isViewMenuOpen, layerPropertiesDialog, preferences.selection.keepAfterDelete, selection, settingsOpen, shortcutToolByKey, slicePropertiesDialog, spriteImportDialog, tagDialog]);

  const siblingLayers = pixelDocument.layers.filter((layer) => layer.parentId === activeLayer.parentId);
  const activeSiblingIndex = siblingLayers.findIndex((layer) => layer.id === activeLayer.id);
  const mergeTarget = siblingLayers[activeSiblingIndex - 1] ?? null;
  const selectedRootIdSet = new Set(selectedLayerRoots.map((layer) => layer.id));
  const selectedRootParentIds = new Set(selectedLayerRoots.map((layer) => layer.parentId ?? ""));
  const selectedRootSiblings = selectedRootParentIds.size === 1
    ? pixelDocument.layers.filter((layer) => (layer.parentId ?? "") === (selectedLayerRoots[0]?.parentId ?? ""))
    : [];
  const canMoveSelectedLayersUp = selectedRootSiblings.some((layer, index) => selectedRootIdSet.has(layer.id) && index < selectedRootSiblings.length - 1 && !selectedRootIdSet.has(selectedRootSiblings[index + 1].id));
  const canMoveSelectedLayersDown = selectedRootSiblings.some((layer, index) => selectedRootIdSet.has(layer.id) && index > 0 && !selectedRootIdSet.has(selectedRootSiblings[index - 1].id));
  const selectedImageSiblings = selectedLayers.length > 1
    && selectedLayers.every((layer) => isImageLayer(layer) && layer.role !== "reference" && !isLayerEffectivelyLocked(pixelDocument, layer))
    && new Set(selectedLayers.map((layer) => layer.parentId ?? "")).size === 1;
  const selectedSiblingIndexes = selectedImageSiblings
    ? selectedLayers.map((layer) => pixelDocument.layers.filter((candidate) => candidate.parentId === layer.parentId).findIndex((candidate) => candidate.id === layer.id)).sort((left, right) => left - right)
    : [];
  const canMergeSelectedLayers = selectedSiblingIndexes.length > 1 && selectedSiblingIndexes.every((value, index) => index === 0 || value === selectedSiblingIndexes[index - 1] + 1);
  const canMergeDown = Boolean(
    isImageLayer(activeLayer)
      && mergeTarget
      && isImageLayer(mergeTarget)
      && activeLayer.role !== "reference"
      && mergeTarget.role !== "reference"
      && !activeLayerLocked
      && !isLayerEffectivelyLocked(pixelDocument, mergeTarget),
  );
  const activeFrameIndex = pixelDocument.frames.findIndex((frame) => frame.id === pixelDocument.activeFrameId);
  const selectedFrameIDSet = new Set(selectedFrameIds);
  const canMoveFramesBackward = pixelDocument.frames.some((frame, index) => (
    index > 0 && selectedFrameIDSet.has(frame.id) && !selectedFrameIDSet.has(pixelDocument.frames[index - 1].id)
  ));
  const canMoveFramesForward = pixelDocument.frames.some((frame, index) => (
    index < pixelDocument.frames.length - 1
      && selectedFrameIDSet.has(frame.id)
      && !selectedFrameIDSet.has(pixelDocument.frames[index + 1].id)
  ));

  const scrollDocumentTabs = (direction: -1 | 1) => {
    const container = documentTabsRef.current;
    if (!container) return;
    const tabWidth = container.querySelector<HTMLElement>(".document-tab")?.offsetWidth ?? 190;
    const target = direction < 0
      ? Math.floor((container.scrollLeft - 1) / tabWidth) * tabWidth
      : Math.ceil((container.scrollLeft + 1) / tabWidth) * tabWidth;
    container.scrollTo({left: Math.max(0, target), behavior: "smooth"});
  };

  const applyPreferences = (next: AppPreferences) => {
    setPreferences(next);
    setLightTheme(next.general.theme === "light");
    setLanguage(next.general.language);
    setAutosaveSeconds(next.files.autosaveSeconds);
    setHistoryLimitMB(next.undo.memoryLimitMB);
    setPixelPerfect(next.drawing.pixelPerfect);
    setPressureEnabled(next.drawing.pressure);
    setBrushDynamicsEnabled(next.drawing.brushDynamics);
    setNewDocumentColorMode(next.color.defaultColorMode);
    setNewDocumentBackground(next.background.defaultFill);
    setShowPixelGrid(next.grid.showPixelGrid);
  };
  const uiScale = preferences.general.uiScale / 100;
  const fileMenuPopoverStyle = useConstrainedMenuStyle({
    open: isFileMenuOpen,
    anchorRef: fileMenuRef,
    menuRef: fileMenuPopoverRef,
    uiScalePercent: preferences.general.uiScale,
    kind: "main",
  });
  const editMenuPopoverStyle = useConstrainedMenuStyle({
    open: isEditMenuOpen,
    anchorRef: editMenuRef,
    menuRef: editMenuPopoverRef,
    uiScalePercent: preferences.general.uiScale,
    kind: "main",
  });
  const spriteMenuPopoverStyle = useConstrainedMenuStyle({
    open: isSpriteMenuOpen,
    anchorRef: spriteMenuRef,
    menuRef: spriteMenuPopoverRef,
    uiScalePercent: preferences.general.uiScale,
    kind: "main",
  });
  const viewMenuPopoverStyle = useConstrainedMenuStyle({
    open: isViewMenuOpen,
    anchorRef: viewMenuRef,
    menuRef: viewMenuPopoverRef,
    uiScalePercent: preferences.general.uiScale,
    kind: "main",
  });
  const recentProjectsMenuStyle = useConstrainedMenuStyle({
    open: isRecentProjectsMenuOpen,
    anchorRef: recentProjectsAnchorRef,
    menuRef: recentProjectsMenuRef,
    uiScalePercent: preferences.general.uiScale,
    kind: "submenu",
  });
  const pasteSpecialMenuStyle = useConstrainedMenuStyle({
    open: isPasteSpecialMenuOpen,
    anchorRef: pasteSpecialAnchorRef,
    menuRef: pasteSpecialMenuRef,
    uiScalePercent: preferences.general.uiScale,
    kind: "submenu",
  });
  const shiftPixelsMenuStyle = useConstrainedMenuStyle({
    open: isShiftPixelsMenuOpen,
    anchorRef: shiftPixelsAnchorRef,
    menuRef: shiftPixelsMenuRef,
    uiScalePercent: preferences.general.uiScale,
    kind: "submenu",
  });
  const imageEffectsMenuStyle = useConstrainedMenuStyle({
    open: isImageEffectsMenuOpen,
    anchorRef: imageEffectsAnchorRef,
    menuRef: imageEffectsMenuRef,
    uiScalePercent: preferences.general.uiScale,
    kind: "submenu",
  });
  const runContextAction = (action: () => void) => {
    setContextMenu(null);
    action();
  };
  const contextMenuButton = (label: string, icon: ReactNode, action: () => void, disabled = false, danger = false) => (
    <button
      type="button"
      role="menuitem"
      className={danger ? "is-danger" : undefined}
      disabled={disabled}
      onClick={() => runContextAction(action)}
    >
      {icon}<span className="context-menu-label">{label}</span>
    </button>
  );
  const contextMenuDivider = () => <div className="menu-divider" role="separator" />;
  const renderContextMenuContents = () => {
    if (!contextMenu) return null;
    const target = contextMenu.target;
    if (target.kind === "document") {
      const tab = tabs.find((candidate) => candidate.id === target.tabId);
      if (!tab) return null;
      const index = tabs.indexOf(tab);
      return <>
        {contextMenuButton(language === "zh" ? "保存" : "Save", <Save size={16} />, () => dispatchCommandShortcut("save"))}
        {contextMenuButton(language === "zh" ? "另存为" : "Save As", <SaveAll size={16} />, () => dispatchCommandShortcut("saveAs"))}
        {contextMenuButton(language === "zh" ? "重命名" : "Rename", <Pencil size={16} />, () => {
          setDocumentNameDraft(displayProjectName(tab.document.name));
          setRenamingDocumentTabID(tab.id);
        }, isPlaying)}
        {contextMenuButton(language === "zh" ? "复制为新项目" : "Duplicate Sprite", <Copy size={16} />, () => dispatchCommandShortcut("duplicateSprite"), isPlaying)}
        {contextMenuDivider()}
        {contextMenuButton(language === "zh" ? "关闭" : "Close", <X size={16} />, () => closeTab(tab))}
        {contextMenuButton(language === "zh" ? "关闭其他文件" : "Close Others", <X size={16} />, () => {
          for (const candidate of [...tabs]) if (candidate.id !== tab.id) closeTab(candidate);
        }, tabs.length < 2)}
        {contextMenuButton(language === "zh" ? "关闭右侧文件" : "Close Tabs to the Right", <ChevronRight size={16} />, () => {
          for (const candidate of [...tabs].slice(index + 1)) closeTab(candidate);
        }, index >= tabs.length - 1)}
      </>;
    }
    if (target.kind === "layer") {
      const layer = getLayerByID(pixelDocument, target.layerId);
      if (!layer) return null;
      return <>
        {contextMenuButton(language === "zh" ? "重命名" : "Rename", <Pencil size={16} />, () => {
          setLayerNameDraft(layer.name);
          setRenamingLayerId(layer.id);
        }, isPlaying)}
        {contextMenuButton(language === "zh" ? "图层属性" : "Layer Properties", <SlidersHorizontal size={16} />, openLayerProperties, isPlaying)}
        {contextMenuButton(language === "zh" ? "复制图层" : "Duplicate Layer", <Copy size={16} />, duplicateSelectedLayers, isPlaying)}
        {contextMenuDivider()}
        {contextMenuButton(layer.visible ? (language === "zh" ? "隐藏" : "Hide") : (language === "zh" ? "显示" : "Show"), layer.visible ? <EyeOff size={16} /> : <Eye size={16} />, () => dispatchCommandShortcut("toggleLayerVisibility"), isPlaying)}
        {contextMenuButton(layer.locked ? (language === "zh" ? "解锁" : "Unlock") : (language === "zh" ? "锁定" : "Lock"), layer.locked ? <Unlock size={16} /> : <Lock size={16} />, () => dispatchCommandShortcut("toggleLayerLock"), isPlaying)}
        {isImageLayer(layer) && contextMenuButton(language === "zh" ? "切换锁定透明度" : "Toggle Alpha Lock", <Droplets size={16} />, () => dispatchCommandShortcut("toggleAlphaLock"), isPlaying)}
        {isImageLayer(layer) && contextMenuButton(language === "zh" ? "切换连续动画格" : "Toggle Continuous Cels", <Waypoints size={16} />, () => dispatchCommandShortcut("toggleContinuous"), isPlaying)}
        {contextMenuDivider()}
        {contextMenuButton(language === "zh" ? "上移" : "Move Up", <ChevronUp size={16} />, () => moveSelectedLayers("up"), isPlaying || !canMoveSelectedLayersUp)}
        {contextMenuButton(language === "zh" ? "下移" : "Move Down", <ChevronDown size={16} />, () => moveSelectedLayers("down"), isPlaying || !canMoveSelectedLayersDown)}
        {contextMenuButton(selectedLayers.length > 1 ? (language === "zh" ? "合并所选图层" : "Merge Selected Layers") : (language === "zh" ? "向下合并" : "Merge Down"), <Merge size={16} />, () => selectedLayers.length > 1 ? mergeSelectedLayers() : dispatchCommandShortcut("mergeLayerDown"), isPlaying || (selectedLayers.length > 1 ? !canMergeSelectedLayers : !canMergeDown))}
        {contextMenuButton(language === "zh" ? "拼合可见图层" : "Flatten Visible Layers", <Layers size={16} />, flattenDocumentLayers, isPlaying || pixelDocument.layers.filter((candidate) => candidate.role !== "reference").length < 2)}
        {isImageLayer(layer) && contextMenuButton(language === "zh" ? "转换为图块地图" : "Convert to Tilemap", <Grid2X2 size={16} />, convertActiveLayerToTiles, isPlaying)}
        {contextMenuDivider()}
        {contextMenuButton(language === "zh" ? "删除图层" : "Delete Layer", <Trash2 size={16} />, () => dispatchCommandShortcut("delete"), isPlaying, true)}
      </>;
    }
    if (target.kind === "frame") {
      const frame = pixelDocument.frames.find((candidate) => candidate.id === target.frameId);
      if (!frame) return null;
      return <>
        {contextMenuButton(language === "zh" ? "新建帧" : "Add Frame", <Plus size={16} />, () => dispatchCommandShortcut("addFrame"), isPlaying)}
        {contextMenuButton(language === "zh" ? "新建空帧" : "New Empty Frame", <FilePlus size={16} />, () => dispatchCommandShortcut("newEmptyFrame"), isPlaying)}
        {contextMenuButton(language === "zh" ? "复制帧" : "Duplicate Frame", <Copy size={16} />, () => dispatchCommandShortcut("duplicateFrame"), isPlaying)}
        {contextMenuButton(language === "zh" ? "删除帧" : "Delete Frame", <Trash2 size={16} />, () => dispatchCommandShortcut("deleteFrame"), isPlaying || selectedFrameIds.length >= pixelDocument.frames.length, true)}
        {contextMenuDivider()}
        {contextMenuButton(language === "zh" ? "前移" : "Move Earlier", <ChevronLeft size={16} />, () => dispatchCommandShortcut("moveFrameBackward"), isPlaying || !canMoveFramesBackward)}
        {contextMenuButton(language === "zh" ? "后移" : "Move Later", <ChevronRight size={16} />, () => dispatchCommandShortcut("moveFrameForward"), isPlaying || !canMoveFramesForward)}
        {contextMenuButton(language === "zh" ? "反转所选帧" : "Reverse Selected Frames", <RotateCcw size={16} />, () => dispatchCommandShortcut("reverseFrames"), isPlaying || selectedFrameIds.length < 2)}
        {contextMenuButton(language === "zh" ? "设置帧时长…" : "Set Frame Duration…", <SlidersHorizontal size={16} />, () => {
          const input = window.prompt(language === "zh" ? "帧时长（毫秒）" : "Frame duration (milliseconds)", String(Math.round(frame.durationMs)));
          if (input === null) return;
          const duration = Math.max(1, Math.min(60_000, Math.round(Number(input) || 0)));
          mutateDocument("Change Frame Duration", () => setFramesDuration(pixelDocument, selectedFrameIds, duration));
        }, isPlaying)}
        {contextMenuDivider()}
        {contextMenuButton(language === "zh" ? "设为循环起点" : "Set Loop Start", <ChevronLeft size={16} />, () => {
          activeTab.loopStartFrameId = frame.id;
          activeTab.activeTagId = undefined;
          setUIRevision((value) => value + 1);
        })}
        {contextMenuButton(language === "zh" ? "设为循环终点" : "Set Loop End", <ChevronRight size={16} />, () => {
          activeTab.loopEndFrameId = frame.id;
          activeTab.activeTagId = undefined;
          setUIRevision((value) => value + 1);
        })}
        {contextMenuButton(language === "zh" ? "从所选帧创建标签" : "Create Tag from Selection", <Target size={16} />, openNewTagDialog, isPlaying)}
        {contextMenuButton(language === "zh" ? "复制到其他打开文件" : "Copy to Open Document", <Copy size={16} />, () => dispatchCommandShortcut("copySelectedFramesToDocument"), isPlaying || tabs.length < 2)}
      </>;
    }
    if (target.kind === "cel") {
      const cel = getCel(pixelDocument, target.layerId, target.frameId);
      return <>
        {!cel && contextMenuButton(language === "zh" ? "创建动画格" : "Create Cel", <FilePlus size={16} />, () => dispatchCommandShortcut("createCels"), isPlaying)}
        {contextMenuButton(language === "zh" ? "复制" : "Copy", <Copy size={16} />, copyCurrentCels, isPlaying || !cel)}
        {contextMenuButton(language === "zh" ? "剪切" : "Cut", <FileDown size={16} />, cutCurrentCels, isPlaying || !cel)}
        {contextMenuButton(language === "zh" ? "粘贴" : "Paste", <FileUp size={16} />, pasteCurrentCels, isPlaying || !celClipboardRef.current)}
        {contextMenuButton(language === "zh" ? "删除动画格" : "Delete Cel", <Trash2 size={16} />, clearCurrentCels, isPlaying || !cel, true)}
        {contextMenuDivider()}
        {contextMenuButton(language === "zh" ? "复制动画格" : "Duplicate Cels", <Copy size={16} />, () => dispatchCommandShortcut("duplicateCels"), isPlaying || !cel)}
        {contextMenuButton(language === "zh" ? "复制并链接" : "Duplicate Linked Cels", <Link2 size={16} />, () => dispatchCommandShortcut("duplicateLinkedCels"), isPlaying || !cel)}
        {contextMenuButton(language === "zh" ? "链接动画格" : "Link Cels", <Link2 size={16} />, linkCurrentCels, isPlaying || linkableCelGroups.length === 0 || !celGroupsEditable(linkableCelGroups))}
        {contextMenuButton(language === "zh" ? "取消链接" : "Unlink Cels", <Unlink2 size={16} />, unlinkCurrentCels, isPlaying || unlinkableCelGroups.length === 0 || !celGroupsEditable(unlinkableCelGroups))}
        {contextMenuButton(language === "zh" ? "动画格属性" : "Cel Properties", <SlidersHorizontal size={16} />, openCelProperties, isPlaying || !cel)}
        {contextMenuButton(language === "zh" ? "选择链接动画格" : "Select Linked Cels", <Link2 size={16} />, () => dispatchCommandShortcut("selectLinkedCels"), !cel)}
        {contextMenuButton(language === "zh" ? "选择本层全部动画格" : "Select All Cels in Layer", <Layers size={16} />, () => dispatchCommandShortcut("selectAllLayerCels"), !cel)}
        {contextMenuDivider()}
        {contextMenuButton(language === "zh" ? "应用动画格变换" : "Apply Cel Transform", <Move size={16} />, applySelectedCelTransform, isPlaying || !transformTargetCelsEditable)}
        {contextMenuButton(language === "zh" ? "栅格化到画布" : "Rasterize to Canvas", <Grid2X2 size={16} />, rasterizeSelectedCels, isPlaying || !transformTargetCelsEditable)}
      </>;
    }
    if (target.kind === "slice") {
      const slice = pixelDocument.slices.find((candidate) => candidate.id === target.sliceId);
      if (!slice) return null;
      const key = slice.keys.find((candidate) => candidate.frameId === pixelDocument.activeFrameId);
      return <>
        {contextMenuButton(language === "zh" ? "切片属性" : "Slice Properties", <SlidersHorizontal size={16} />, () => openSliceProperties(slice.id))}
        {contextMenuButton(language === "zh" ? "添加当前帧关键帧" : "Add Current-frame Key", <Plus size={16} />, addCurrentSliceKey, Boolean(key))}
        {contextMenuButton(language === "zh" ? "删除当前帧关键帧" : "Delete Current-frame Key", <Trash2 size={16} />, deleteCurrentSliceKey, !key || slice.keys.length <= 1, true)}
        {contextMenuButton(key?.center ? (language === "zh" ? "移除九宫格中心" : "Remove Nine-patch Center") : (language === "zh" ? "添加九宫格中心" : "Add Nine-patch Center"), <Grid2X2 size={16} />, () => {
          if (!key) return;
          editCurrentSliceKey({center: key.center ? undefined : {x: Math.floor(key.width / 4), y: Math.floor(key.height / 4), width: Math.max(1, Math.floor(key.width / 2)), height: Math.max(1, Math.floor(key.height / 2))}}, "Toggle Nine-patch");
        }, !key)}
        {contextMenuDivider()}
        {contextMenuButton(language === "zh" ? "删除切片" : "Delete Slice", <Trash2 size={16} />, deleteSelectedSlices, false, true)}
      </>;
    }
    if (target.kind === "tile") {
      const tile = activeTileset?.tiles.find((candidate) => candidate.id === target.tileId);
      return <>
        {contextMenuButton(language === "zh" ? "选择图块" : "Select Tile", <Check size={16} />, () => setSelectedTileID(target.tileId))}
        {contextMenuButton(language === "zh" ? "切换到像素编辑" : "Edit Tile Pixels", <Pencil size={16} />, () => setTilemapDrawMode("pixels"), !tile)}
        {contextMenuButton(language === "zh" ? "复制为新图块" : "Duplicate as New Tile", <Copy size={16} />, () => {
          if (!activeTileset || !tile) return;
          let nextID = 0;
          mutateDocument("Duplicate Tile", () => {
            const result = addTileInPlace(activeTileset, tile.pixels.slice(), tile.indexes?.slice());
            nextID = result.tile.id;
            return result.created;
          });
          if (nextID) setSelectedTileID(nextID);
        }, isPlaying || !tile)}
        {contextMenuButton(language === "zh" ? "删除图块" : "Delete Tile", <Trash2 size={16} />, deleteSelectedTile, isPlaying || !tile, true)}
      </>;
    }
    if (target.kind === "guide") {
      const guide = pixelDocument.guides.find((candidate) => candidate.id === target.guideId);
      if (!guide) return null;
      return <>
        {contextMenuButton(language === "zh" ? "设置精确位置…" : "Set Exact Position…", <Move size={16} />, () => {
          const input = window.prompt(language === "zh" ? "参考线位置" : "Guide position", String(guide.position));
          if (input === null) return;
          const maximum = guide.axis === "vertical" ? pixelDocument.width : pixelDocument.height;
          const position = Math.max(0, Math.min(maximum, Math.round(Number(input) || 0)));
          mutateDocument("Move Guide", () => { guide.position = position; return true; });
        })}
        {contextMenuButton(language === "zh" ? "切换方向" : "Switch Orientation", <RotateCw size={16} />, () => mutateDocument("Change Guide Orientation", () => {
          guide.axis = guide.axis === "vertical" ? "horizontal" : "vertical";
          guide.position = Math.min(guide.axis === "vertical" ? pixelDocument.width : pixelDocument.height, guide.position);
          return true;
        }))}
        {contextMenuButton(language === "zh" ? "删除参考线" : "Delete Guide", <Trash2 size={16} />, () => mutateDocument("Delete Guide", () => {
          const index = pixelDocument.guides.findIndex((candidate) => candidate.id === guide.id);
          if (index < 0) return false;
          pixelDocument.guides.splice(index, 1);
          return true;
        }), false, true)}
      </>;
    }
    if (target.kind === "tag") {
      const tag = pixelDocument.tags.find((candidate) => candidate.id === target.tagId);
      if (!tag) return null;
      return <>
        {contextMenuButton(language === "zh" ? "聚焦标签" : "Focus Tag", <Target size={16} />, focusCurrentTag, isPlaying)}
        {contextMenuButton(language === "zh" ? "编辑标签" : "Edit Tag", <Pencil size={16} />, openEditTagDialog, isPlaying)}
        {contextMenuButton(language === "zh" ? "删除标签" : "Delete Tag", <Trash2 size={16} />, removeActiveTag, isPlaying, true)}
      </>;
    }
    return <>
      {contextMenuButton(target.panel === "inspector" ? (language === "zh" ? "隐藏侧栏" : "Hide Inspector") : (language === "zh" ? "隐藏时间轴" : "Hide Timeline"), <EyeOff size={16} />, () => target.panel === "inspector" ? setInspectorVisible(false) : setTimelineVisible(false))}
      {contextMenuButton(language === "zh" ? "显示所有面板" : "Show All Panels", <PanelTopOpen size={16} />, showAllPanels)}
      {contextMenuButton(language === "zh" ? "恢复默认尺寸" : "Restore Default Size", <RotateCcw size={16} />, () => {
        if (target.panel === "inspector") setInspectorWidth(defaultWorkspaceDimensions.inspectorWidth);
        else setTimelineHeight(defaultWorkspaceDimensions.timelineHeight);
      })}
      {contextMenuButton(language === "zh" ? "重置工作区布局" : "Reset Workspace Layout", <RotateCcw size={16} />, () => dispatchCommandShortcut("resetWorkspace"))}
    </>;
  };

  return (
    <div
      className={`${lightTheme ? "app-shell is-light" : "app-shell"}${preferences.general.paletteSeparators ? " has-palette-separators" : ""}${canvasOnly ? " is-canvas-only" : ""}`}
      style={{
        "--inspector-width": inspectorVisible ? `${inspectorWidth}px` : "0px",
        "--timeline-height": timelineVisible ? `${timelineHeight}px` : "0px",
        "--ui-scale": uiScale,
        zoom: uiScale,
      } as CSSProperties}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
      onDrop={(event) => { if (event.dataTransfer.files.length > 0) { event.preventDefault(); void importDroppedFiles(event.dataTransfer.files); } }}
    >
      {canvasOnly && <button
        className="canvas-only-exit icon-button"
        type="button"
        title={language === "zh" ? "退出画布独占模式" : "Exit canvas-only mode"}
        aria-label={language === "zh" ? "退出画布独占模式" : "Exit canvas-only mode"}
        onClick={() => setCanvasOnly(false)}
      ><PanelTopOpen size={17} /></button>}
      <div
        ref={menuLayerRef}
        style={{position: "fixed", inset: 0, zIndex: 20, pointerEvents: "none"}}
      />
      {contextMenu && menuLayerRef.current && createPortal(
        <div
          ref={contextMenuRef}
          className="editor-context-menu"
          role="menu"
          aria-label={language === "zh" ? "上下文菜单" : "Context menu"}
          style={{left: contextMenu.left, top: contextMenu.top}}
          onContextMenu={(event) => event.preventDefault()}
        >
          {renderContextMenuContents()}
        </div>,
        menuLayerRef.current,
      )}
      <header className="topbar">
        <div className="file-menu" ref={fileMenuRef} onPointerEnter={() => {
          if (!preferences.general.expandMenusOnHover || (!isFileMenuOpen && !isEditMenuOpen && !isSpriteMenuOpen && !isViewMenuOpen)) return;
          setIsFileMenuOpen(true); setIsEditMenuOpen(false); setIsSpriteMenuOpen(false); setIsViewMenuOpen(false);
        }}>
          <button
            className={isFileMenuOpen ? "menu-trigger is-open" : "menu-trigger"}
            type="button"
            aria-haspopup="menu"
            aria-expanded={isFileMenuOpen}
            onClick={() => { setIsEditMenuOpen(false); setIsSpriteMenuOpen(false); setIsViewMenuOpen(false); setIsFileMenuOpen((value) => !value); }}
          >
            {ui.file} <ChevronDown size={14} aria-hidden="true" />
          </button>
          {isFileMenuOpen && menuLayerRef.current && createPortal(<div
            ref={fileMenuPopoverRef}
            className="file-menu-popover"
            role="menu"
            aria-label={ui.file}
            style={fileMenuPopoverStyle}
            onPointerMove={(event) => {
              const item = event.target instanceof Element ? event.target.closest("button") : null;
              if (item && !item.classList.contains("recent-projects-trigger")) setIsRecentProjectsMenuOpen(false);
            }}
          >
            <button type="button" role="menuitem" onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("new"); }}><FilePlus size={16} />{ui.newProject}<span>{formatShortcutForPlatform(commandShortcutAssignments.new)}</span></button>
            <button type="button" role="menuitem" disabled={!hasOpenDocument || !selection} onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("newFromSelection"); }}><BoxSelect size={16} />{language === "zh" ? "从选区新建" : "New from selection"}<span>{formatShortcutForPlatform(commandShortcutAssignments.newFromSelection)}</span></button>
            <button type="button" role="menuitem" onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("open"); }}><FolderOpen size={16} />{ui.openProject}<span>{formatShortcutForPlatform(commandShortcutAssignments.open)}</span></button>
            <div className="file-menu-submenu" ref={recentProjectsAnchorRef}>
              <button
                className={`submenu-trigger recent-projects-trigger${isRecentProjectsMenuOpen ? " is-open" : ""}`}
                type="button"
                role="menuitem"
                disabled={recentProjects.length === 0}
                aria-haspopup="menu"
                aria-expanded={isRecentProjectsMenuOpen}
                onPointerEnter={() => { if (recentProjects.length > 0) setIsRecentProjectsMenuOpen(true); }}
                onFocus={() => { if (recentProjects.length > 0) setIsRecentProjectsMenuOpen(true); }}
                onClick={() => setIsRecentProjectsMenuOpen((value) => recentProjects.length > 0 && !value)}
              ><HistoryIcon size={16} />{ui.recentProjects}<ChevronRight size={14} /></button>
              {isRecentProjectsMenuOpen && menuLayerRef.current && createPortal(<div
                ref={recentProjectsMenuRef}
                className="file-menu-popover recent-projects-submenu"
                role="menu"
                aria-label={ui.recentProjects}
                style={recentProjectsMenuStyle}
              >
                {recentProjects.map((path) => <button
                  key={path}
                  type="button"
                  role="menuitem"
                  className="recent-menu-project"
                  title={path}
                  onClick={() => {
                    setIsRecentProjectsMenuOpen(false);
                    setIsFileMenuOpen(false);
                    void openRecentProject(path);
                  }}
                >{path.split(/[\\/]/).pop()}</button>)}
              </div>, menuLayerRef.current)}
            </div>
            <button type="button" role="menuitem" onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("importPNG"); }}><FileImage size={16} />{ui.importPNG}<span>{formatShortcutForPlatform(commandShortcutAssignments.importPNG)}</span></button>
            <button type="button" role="menuitem" onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("importSpriteSheet"); }}><Grid2X2 size={16} />{language === "zh" ? "导入精灵表" : "Import sprite sheet"}<span>{formatShortcutForPlatform(commandShortcutAssignments.importSpriteSheet)}</span></button>
            <button type="button" role="menuitem" onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("importPNGSequence"); }}><FolderPlus size={16} />{language === "zh" ? "导入 PNG 序列" : "Import PNG sequence"}<span>{formatShortcutForPlatform(commandShortcutAssignments.importPNGSequence)}</span></button>
            <div className="menu-divider" role="separator" />
            <button type="button" role="menuitem" disabled={!hasOpenDocument} onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("save"); }}><Save size={16} />{ui.saveProject}<span>{formatShortcutForPlatform(commandShortcutAssignments.save)}</span></button>
            <button type="button" role="menuitem" disabled={!hasOpenDocument} onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("saveAs"); }}><SaveAll size={16} />{ui.saveAs}<span>{formatShortcutForPlatform(commandShortcutAssignments.saveAs)}</span></button>
            <div className="menu-divider" role="separator" />
            <button type="button" role="menuitem" disabled={!hasOpenDocument} onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("exportPNG"); }}><Download size={16} />{ui.exportPNG}<span>{formatShortcutForPlatform(commandShortcutAssignments.exportPNG)}</span></button>
            <button type="button" role="menuitem" disabled={!hasOpenDocument} onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("exportGIF"); }}><FileImage size={16} />{ui.exportGIF}<span>{formatShortcutForPlatform(commandShortcutAssignments.exportGIF)}</span></button>
            <button type="button" role="menuitem" disabled={!hasOpenDocument} onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("exportSpriteSheet"); }}><Grid2X2 size={16} />{ui.exportSpriteSheet}<span>{formatShortcutForPlatform(commandShortcutAssignments.exportSpriteSheet)}</span></button>
            <button type="button" role="menuitem" disabled={!hasOpenDocument} onClick={() => { setIsFileMenuOpen(false); dispatchCommandShortcut("exportPNGSequence"); }}><Folder size={16} />{language === "zh" ? "导出 PNG 序列" : "Export PNG sequence"}<span>{formatShortcutForPlatform(commandShortcutAssignments.exportPNGSequence)}</span></button>
          </div>, menuLayerRef.current)}
        </div>
        <div className="file-menu" ref={editMenuRef} onPointerEnter={() => {
          if (!preferences.general.expandMenusOnHover || !hasOpenDocument || (!isFileMenuOpen && !isEditMenuOpen && !isSpriteMenuOpen && !isViewMenuOpen)) return;
          setIsFileMenuOpen(false); setIsEditMenuOpen(true); setIsSpriteMenuOpen(false); setIsViewMenuOpen(false);
        }}>
          <button
            className={isEditMenuOpen ? "menu-trigger is-open" : "menu-trigger"}
            type="button"
            disabled={!hasOpenDocument}
            aria-haspopup="menu"
            aria-expanded={isEditMenuOpen}
            onClick={() => {
              setIsFileMenuOpen(false);
              setIsSpriteMenuOpen(false);
              setIsViewMenuOpen(false);
              setIsEditMenuOpen((value) => !value);
              setIsPasteSpecialMenuOpen(false);
              setIsShiftPixelsMenuOpen(false);
            }}
          >
            {language === "zh" ? "编辑" : "Edit"} <ChevronDown size={14} aria-hidden="true" />
          </button>
          {isEditMenuOpen && menuLayerRef.current && createPortal(<div ref={editMenuPopoverRef} className="file-menu-popover edit-menu-popover" role="menu" aria-label={language === "zh" ? "编辑" : "Edit"} style={editMenuPopoverStyle}>
            <button type="button" role="menuitem" disabled={!history.canUndo} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("undo"); }}><Undo2 size={16} />{ui.undo}<span>{formatShortcutForPlatform(commandShortcutAssignments.undo)}</span></button>
            <button type="button" role="menuitem" disabled={!history.canRedo} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("redo"); }}><Redo2 size={16} />{ui.redo}<span>{formatShortcutForPlatform(commandShortcutAssignments.redo)}</span></button>
            <div className="menu-divider" role="separator" />
            <button type="button" role="menuitem" disabled={!selection || !activeCel} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("copy"); }}><Copy size={16} />{language === "zh" ? "复制" : "Copy"}<span>{formatShortcutForPlatform(commandShortcutAssignments.copy)}</span></button>
            <button type="button" role="menuitem" disabled={!selection} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("copyMerged"); }}><Layers size={16} />{language === "zh" ? "复制合并结果" : "Copy Merged"}<span>{formatShortcutForPlatform(commandShortcutAssignments.copyMerged)}</span></button>
            <button type="button" role="menuitem" disabled={!selection || !canEditPixels} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("cut"); }}><FileDown size={16} />{language === "zh" ? "剪切" : "Cut"}<span>{formatShortcutForPlatform(commandShortcutAssignments.cut)}</span></button>
            <button type="button" role="menuitem" disabled={!canEditPixels} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("paste"); }}><FileUp size={16} />{language === "zh" ? "粘贴" : "Paste"}<span>{formatShortcutForPlatform(commandShortcutAssignments.paste)}</span></button>
            <div className="file-menu-submenu" ref={pasteSpecialAnchorRef}>
              <button className={isPasteSpecialMenuOpen ? "submenu-trigger is-open" : "submenu-trigger"} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={isPasteSpecialMenuOpen} onClick={() => { setIsPasteSpecialMenuOpen((value) => !value); setIsShiftPixelsMenuOpen(false); }}><FilePlus size={16} />{language === "zh" ? "选择性粘贴" : "Paste Special"}<ChevronRight size={14} /></button>
              {isPasteSpecialMenuOpen && menuLayerRef.current && createPortal(<div ref={pasteSpecialMenuRef} className="file-menu-popover edit-submenu" role="menu" aria-label={language === "zh" ? "选择性粘贴" : "Paste Special"} style={pasteSpecialMenuStyle}>
                <button type="button" role="menuitem" onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("pasteSpecialNewSprite"); }}><FilePlus size={16} />{language === "zh" ? "粘贴为新项目" : "Paste as New Sprite"}<span>{formatShortcutForPlatform(commandShortcutAssignments.pasteSpecialNewSprite)}</span></button>
                <button type="button" role="menuitem" onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("pasteSpecialNewLayer"); }}><Layers size={16} />{language === "zh" ? "粘贴为新图层" : "Paste as New Layer"}<span>{formatShortcutForPlatform(commandShortcutAssignments.pasteSpecialNewLayer)}</span></button>
                <button type="button" role="menuitem" onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("pasteSpecialReferenceLayer"); }}><Eye size={16} />{language === "zh" ? "粘贴为参考图层" : "Paste as Reference Layer"}<span>{formatShortcutForPlatform(commandShortcutAssignments.pasteSpecialReferenceLayer)}</span></button>
              </div>, menuLayerRef.current)}
            </div>
            <div className="menu-divider" role="separator" />
            <button type="button" role="menuitem" disabled={!selection || !canEditPixels} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("fillSelection"); }}><PaintBucket size={16} />{language === "zh" ? "填充选区" : "Fill Selection"}<span>{formatShortcutForPlatform(commandShortcutAssignments.fillSelection)}</span></button>
            <button type="button" role="menuitem" disabled={!selection || !canEditPixels} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("strokeSelection"); }}><Square size={16} />{language === "zh" ? "描边选区" : "Stroke Selection"}<span>{formatShortcutForPlatform(commandShortcutAssignments.strokeSelection)}</span></button>
            <button type="button" role="menuitem" disabled={!selection || !activeCel || !canEditPixels} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("copySelectionToLayer"); }}><Copy size={16} />{language === "zh" ? "复制选区到新图层" : "Copy Selection to New Layer"}<span>{formatShortcutForPlatform(commandShortcutAssignments.copySelectionToLayer)}</span></button>
            <button type="button" role="menuitem" disabled={!selection || !activeCel || !canEditPixels} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("cutSelectionToLayer"); }}><FileDown size={16} />{language === "zh" ? "剪切选区到新图层" : "Cut Selection to New Layer"}<span>{formatShortcutForPlatform(commandShortcutAssignments.cutSelectionToLayer)}</span></button>
            <button type="button" role="menuitem" disabled={!activeCel} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("selectAllLayerCels"); }}><Layers size={16} />{language === "zh" ? "选择当前图层全部动画格" : "Select All Cels in Layer"}<span>{formatShortcutForPlatform(commandShortcutAssignments.selectAllLayerCels)}</span></button>
            <button type="button" role="menuitem" disabled={!activeCel} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("selectLinkedCels"); }}><Link2 size={16} />{language === "zh" ? "选择链接动画格" : "Select Linked Cels"}<span>{formatShortcutForPlatform(commandShortcutAssignments.selectLinkedCels)}</span></button>
            <button type="button" role="menuitem" disabled={isPlaying || tabs.length < 2 || selectedFrameIds.length === 0} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("copySelectedFramesToDocument"); }}><Copy size={16} />{language === "zh" ? "复制所选帧到其他文件" : "Copy Selected Frames to Open Document"}<span>{formatShortcutForPlatform(commandShortcutAssignments.copySelectedFramesToDocument)}</span></button>
            <button type="button" role="menuitem" disabled={isPlaying || tabs.length < 2 || activeTab.commandScope !== "layer" || selectedLayers.length === 0} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("copySelectedLayersToDocument"); }}><Layers size={16} />{language === "zh" ? "复制所选图层到其他文件" : "Copy Selected Layers to Open Document"}<span>{formatShortcutForPlatform(commandShortcutAssignments.copySelectedLayersToDocument)}</span></button>
            <button type="button" role="menuitem" disabled={!hasOpenDocument} onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("layerProperties"); }}><Settings size={16} />{language === "zh" ? "图层属性" : "Layer Properties"}<span>{formatShortcutForPlatform(commandShortcutAssignments.layerProperties)}</span></button>
            <div className="file-menu-submenu" ref={shiftPixelsAnchorRef}>
              <button className={isShiftPixelsMenuOpen ? "submenu-trigger is-open" : "submenu-trigger"} type="button" role="menuitem" disabled={!canEditPixels} aria-haspopup="menu" aria-expanded={isShiftPixelsMenuOpen} onClick={() => { setIsShiftPixelsMenuOpen((value) => !value); setIsPasteSpecialMenuOpen(false); }}><Move size={16} />{language === "zh" ? "环绕平移像素" : "Shift Pixels"}<ChevronRight size={14} /></button>
              {isShiftPixelsMenuOpen && menuLayerRef.current && createPortal(<div ref={shiftPixelsMenuRef} className="file-menu-popover edit-submenu" role="menu" aria-label={language === "zh" ? "环绕平移像素" : "Shift Pixels"} style={shiftPixelsMenuStyle}>
                <button type="button" role="menuitem" onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("shiftPixelsLeft"); }}><ChevronLeft size={16} />{language === "zh" ? "向左 1 像素" : "Left 1 Pixel"}<span>{formatShortcutForPlatform(commandShortcutAssignments.shiftPixelsLeft)}</span></button>
                <button type="button" role="menuitem" onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("shiftPixelsRight"); }}><ChevronRight size={16} />{language === "zh" ? "向右 1 像素" : "Right 1 Pixel"}<span>{formatShortcutForPlatform(commandShortcutAssignments.shiftPixelsRight)}</span></button>
                <button type="button" role="menuitem" onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("shiftPixelsUp"); }}><ChevronUp size={16} />{language === "zh" ? "向上 1 像素" : "Up 1 Pixel"}<span>{formatShortcutForPlatform(commandShortcutAssignments.shiftPixelsUp)}</span></button>
                <button type="button" role="menuitem" onClick={() => { setIsEditMenuOpen(false); dispatchCommandShortcut("shiftPixelsDown"); }}><ChevronDown size={16} />{language === "zh" ? "向下 1 像素" : "Down 1 Pixel"}<span>{formatShortcutForPlatform(commandShortcutAssignments.shiftPixelsDown)}</span></button>
              </div>, menuLayerRef.current)}
            </div>
          </div>, menuLayerRef.current)}
        </div>
        <div className="file-menu" ref={spriteMenuRef} onPointerEnter={() => {
          if (!preferences.general.expandMenusOnHover || !hasOpenDocument || (!isFileMenuOpen && !isEditMenuOpen && !isSpriteMenuOpen && !isViewMenuOpen)) return;
          setIsFileMenuOpen(false); setIsEditMenuOpen(false); setIsSpriteMenuOpen(true); setIsViewMenuOpen(false);
        }}>
          <button className={isSpriteMenuOpen ? "menu-trigger is-open" : "menu-trigger"} type="button" disabled={!hasOpenDocument} aria-haspopup="menu" aria-expanded={isSpriteMenuOpen} onClick={() => { setIsFileMenuOpen(false); setIsEditMenuOpen(false); setIsViewMenuOpen(false); setIsImageEffectsMenuOpen(false); setIsSpriteMenuOpen((value) => !value); }}>
            {language === "zh" ? "图像" : "Sprite"} <ChevronDown size={14} aria-hidden="true" />
          </button>
          {isSpriteMenuOpen && menuLayerRef.current && createPortal(<div ref={spriteMenuPopoverRef} className="file-menu-popover sprite-menu-popover" role="menu" aria-label={language === "zh" ? "图像" : "Sprite"} style={spriteMenuPopoverStyle}>
            <button type="button" role="menuitem" disabled={isPlaying} onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("duplicateSprite"); }}><Copy size={16} />{language === "zh" ? "复制精灵" : "Duplicate Sprite"}<span>{formatShortcutForPlatform(commandShortcutAssignments.duplicateSprite)}</span></button>
            <div className="menu-divider" role="separator" />
            <p className="menu-label">{ui.animation}</p>
            <button type="button" role="menuitem" disabled={isPlaying} onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("addFrame"); }}><Plus size={16} />{ui.addFrame}<span>{formatShortcutForPlatform(commandShortcutAssignments.addFrame)}</span></button>
            <button type="button" role="menuitem" disabled={isPlaying} onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("newEmptyFrame"); }}><FilePlus size={16} />{ui.newEmptyFrame}<span>{formatShortcutForPlatform(commandShortcutAssignments.newEmptyFrame)}</span></button>
            <button type="button" role="menuitem" disabled={isPlaying || (!activeCel && !selectedCels.some(({layerId, frameId}) => Boolean(getCel(pixelDocument, layerId, frameId))))} onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("duplicateCels"); }}><Copy size={16} />{ui.duplicateCels}<span>{formatShortcutForPlatform(commandShortcutAssignments.duplicateCels)}</span></button>
            <button type="button" role="menuitem" disabled={isPlaying || (!activeCel && !selectedCels.some(({layerId, frameId}) => Boolean(getCel(pixelDocument, layerId, frameId))))} onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("duplicateLinkedCels"); }}><Link2 size={16} />{ui.duplicateLinkedCels}<span>{formatShortcutForPlatform(commandShortcutAssignments.duplicateLinkedCels)}</span></button>
            <button type="button" role="menuitem" disabled={isPlaying || pixelDocument.frames.length < 2} onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("previousFrame"); }}><ChevronLeft size={16} />{ui.previousFrame}<span>{formatShortcutForPlatform(commandShortcutAssignments.previousFrame)}</span></button>
            <button type="button" role="menuitem" disabled={isPlaying || pixelDocument.frames.length < 2} onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("nextFrame"); }}><ChevronRight size={16} />{ui.nextFrame}<span>{formatShortcutForPlatform(commandShortcutAssignments.nextFrame)}</span></button>
            <div className="menu-divider" role="separator" />
            <button type="button" role="menuitem" onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("spriteSize"); }}><Scaling size={16} />{language === "zh" ? "缩放图像内容" : "Sprite size"}<span>{formatShortcutForPlatform(commandShortcutAssignments.spriteSize)}</span></button>
            <button type="button" role="menuitem" onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("canvasSize"); }}><Crop size={16} />{language === "zh" ? "画布尺寸" : "Canvas size"}<span>{formatShortcutForPlatform(commandShortcutAssignments.canvasSize)}</span></button>
            <button type="button" role="menuitem" onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("trimCanvas"); }}><BoxSelect size={16} />{language === "zh" ? "裁去透明边缘" : "Trim transparent borders"}<span>{formatShortcutForPlatform(commandShortcutAssignments.trimCanvas)}</span></button>
            <div className="file-menu-submenu" ref={imageEffectsAnchorRef}>
              <button className={isImageEffectsMenuOpen ? "submenu-trigger is-open" : "submenu-trigger"} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={isImageEffectsMenuOpen} onClick={() => setIsImageEffectsMenuOpen((value) => !value)}><SlidersHorizontal size={16} />{language === "zh" ? "调整与效果" : "Adjustments and effects"}<ChevronRight size={14} /></button>
              {isImageEffectsMenuOpen && menuLayerRef.current && createPortal(<div ref={imageEffectsMenuRef} className="file-menu-popover image-effects-submenu" role="menu" aria-label={language === "zh" ? "调整与效果" : "Adjustments and effects"} style={imageEffectsMenuStyle}>
                <p className="menu-label">{language === "zh" ? "调整" : "Adjustments"}</p>
                <button type="button" role="menuitem" disabled={!canOpenAdjustment} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("adjustmentBrightnessContrast"); }}><Sun size={16} />{language === "zh" ? "亮度 / 对比度" : "Brightness / Contrast"}<span>{formatShortcutForPlatform(commandShortcutAssignments.adjustmentBrightnessContrast)}</span></button>
                <button type="button" role="menuitem" disabled={!canOpenAdjustment} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("adjustmentHSL"); }}><Blend size={16} />{language === "zh" ? "色相 / 饱和度" : "Hue / Saturation"}<span>{formatShortcutForPlatform(commandShortcutAssignments.adjustmentHSL)}</span></button>
                <button type="button" role="menuitem" disabled={!canOpenAdjustment} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("adjustmentInvert"); }}><Replace size={16} />{language === "zh" ? "反相" : "Invert"}<span>{formatShortcutForPlatform(commandShortcutAssignments.adjustmentInvert)}</span></button>
                <button type="button" role="menuitem" disabled={!canOpenAdjustment} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("adjustmentConvolution"); }}><Grid2X2 size={16} />{language === "zh" ? "卷积" : "Convolution"}<span>{formatShortcutForPlatform(commandShortcutAssignments.adjustmentConvolution)}</span></button>
                <button type="button" role="menuitem" disabled={!canOpenAdjustment} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("adjustmentMedian"); }}><Grid2X2 size={16} />{language === "zh" ? "中值滤波" : "Median"}<span>{formatShortcutForPlatform(commandShortcutAssignments.adjustmentMedian)}</span></button>
                <button type="button" role="menuitem" disabled={!canOpenAdjustment} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("adjustmentDespeckle"); }}><SprayCan size={16} />{language === "zh" ? "去斑" : "Despeckle"}<span>{formatShortcutForPlatform(commandShortcutAssignments.adjustmentDespeckle)}</span></button>
                <button type="button" role="menuitem" disabled={!canOpenAdjustment} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("adjustmentCurves"); }}><Spline size={16} />{language === "zh" ? "曲线" : "Curves"}<span>{formatShortcutForPlatform(commandShortcutAssignments.adjustmentCurves)}</span></button>
                <button type="button" role="menuitem" disabled={!canOpenAdjustment} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("adjustmentHSVHSL"); }}><Blend size={16} />HSV / HSL<span>{formatShortcutForPlatform(commandShortcutAssignments.adjustmentHSVHSL)}</span></button>
                <button type="button" role="menuitem" disabled={!canOpenAdjustment} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("adjustmentChannels"); }}><Layers size={16} />{language === "zh" ? "通道" : "Channels"}<span>{formatShortcutForPlatform(commandShortcutAssignments.adjustmentChannels)}</span></button>
                <div className="menu-divider" role="separator" />
                <p className="menu-label">{language === "zh" ? "效果" : "Effects"}</p>
                <button type="button" role="menuitem" disabled={!canOpenAdjustment} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("effectOutline"); }}><SquaresUnite size={16} />{language === "zh" ? "轮廓" : "Outline"}<span>{formatShortcutForPlatform(commandShortcutAssignments.effectOutline)}</span></button>
                <button type="button" role="menuitem" disabled={!canEditPixels} onClick={() => { setIsSpriteMenuOpen(false); setIsImageEffectsMenuOpen(false); dispatchCommandShortcut("effectShading"); }}><WandSparkles size={16} />{language === "zh" ? "着色" : "Shading"}<span>{formatShortcutForPlatform(commandShortcutAssignments.effectShading)}</span></button>
              </div>, menuLayerRef.current)}
            </div>
            <div className="menu-divider" role="separator" />
            <button type="button" role="menuitem" onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("rotateSpriteCW"); }}><RotateCw size={16} />{language === "zh" ? "顺时针旋转 90°" : "Rotate 90° clockwise"}<span>{formatShortcutForPlatform(commandShortcutAssignments.rotateSpriteCW)}</span></button>
            <button type="button" role="menuitem" onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("rotateSpriteCCW"); }}><RotateCcw size={16} />{language === "zh" ? "逆时针旋转 90°" : "Rotate 90° counterclockwise"}<span>{formatShortcutForPlatform(commandShortcutAssignments.rotateSpriteCCW)}</span></button>
            <button type="button" role="menuitem" onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("rotateSprite180"); }}><RotateCw size={16} />{language === "zh" ? "旋转 180°" : "Rotate 180°"}<span>{formatShortcutForPlatform(commandShortcutAssignments.rotateSprite180)}</span></button>
            <button type="button" role="menuitem" onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("flipSpriteHorizontal"); }}><FlipHorizontal2 size={16} />{ui.flipHorizontal}<span>{formatShortcutForPlatform(commandShortcutAssignments.flipSpriteHorizontal)}</span></button>
            <button type="button" role="menuitem" onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("flipSpriteVertical"); }}><FlipVertical2 size={16} />{ui.flipVertical}<span>{formatShortcutForPlatform(commandShortcutAssignments.flipSpriteVertical)}</span></button>
            <div className="menu-divider" role="separator" />
            <button type="button" role="menuitem" onClick={() => { setIsSpriteMenuOpen(false); dispatchCommandShortcut("colorConfiguration"); }}><Sun size={16} />{language === "zh" ? "颜色配置" : "Color configuration"}<span>{formatShortcutForPlatform(commandShortcutAssignments.colorConfiguration)}</span></button>
          </div>, menuLayerRef.current)}
        </div>
        <div className="file-menu" ref={viewMenuRef} onPointerEnter={() => {
          if (!preferences.general.expandMenusOnHover || (!isFileMenuOpen && !isEditMenuOpen && !isSpriteMenuOpen && !isViewMenuOpen)) return;
          setIsFileMenuOpen(false); setIsEditMenuOpen(false); setIsSpriteMenuOpen(false); setIsViewMenuOpen(true);
        }}>
          <button className={isViewMenuOpen ? "menu-trigger is-open" : "menu-trigger"} type="button" aria-haspopup="menu" aria-expanded={isViewMenuOpen} onClick={() => { setIsFileMenuOpen(false); setIsEditMenuOpen(false); setIsSpriteMenuOpen(false); setIsViewMenuOpen((value) => !value); }}>
            {language === "zh" ? "视图" : "View"} <ChevronDown size={14} aria-hidden="true" />
          </button>
          {isViewMenuOpen && menuLayerRef.current && createPortal(<div ref={viewMenuPopoverRef} className="file-menu-popover view-menu-popover" role="menu" aria-label={language === "zh" ? "视图" : "View"} style={viewMenuPopoverStyle}>
            <button type="button" role="menuitemcheckbox" aria-checked={inspectorVisible} onClick={() => { setIsViewMenuOpen(false); dispatchCommandShortcut("toggleInspector"); }}>
              {inspectorVisible ? <Eye size={16} /> : <EyeOff size={16} />}
              {inspectorVisible ? (language === "zh" ? "隐藏侧栏" : "Hide Inspector") : (language === "zh" ? "显示侧栏" : "Show Inspector")}<span>{formatShortcutForPlatform(commandShortcutAssignments.toggleInspector)}</span>
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={timelineVisible} onClick={() => { setIsViewMenuOpen(false); dispatchCommandShortcut("toggleTimeline"); }}>
              {timelineVisible ? <Eye size={16} /> : <EyeOff size={16} />}
              {timelineVisible ? (language === "zh" ? "隐藏时间轴" : "Hide Timeline") : (language === "zh" ? "显示时间轴" : "Show Timeline")}<span>{formatShortcutForPlatform(commandShortcutAssignments.toggleTimeline)}</span>
            </button>
            <div className="menu-divider" role="separator" />
            <button type="button" role="menuitemcheckbox" aria-checked={showPixelGrid} onClick={() => { setIsViewMenuOpen(false); dispatchCommandShortcut("togglePixelGrid"); }}><Grid2X2 size={16} />{language === "zh" ? "像素网格" : "Pixel Grid"}<span>{formatShortcutForPlatform(commandShortcutAssignments.togglePixelGrid)}</span></button>
            <button type="button" role="menuitemcheckbox" disabled={!hasOpenDocument} aria-checked={onionSkin} onClick={() => { setIsViewMenuOpen(false); dispatchCommandShortcut("toggleOnionSkin"); }}><Eye size={16} />{language === "zh" ? "洋葱皮" : "Onion Skin"}<span>{formatShortcutForPlatform(commandShortcutAssignments.toggleOnionSkin)}</span></button>
            <button type="button" role="menuitem" disabled={!hasOpenDocument} onClick={() => { setIsViewMenuOpen(false); dispatchCommandShortcut("detachedPreview"); }}><Eye size={16} />{language === "zh" ? "独立动画预览" : "Detached Preview"}<span>{formatShortcutForPlatform(commandShortcutAssignments.detachedPreview)}</span></button>
            <div className="menu-divider" role="separator" />
            <button type="button" role="menuitemcheckbox" aria-checked={canvasOnly} onClick={() => { setIsViewMenuOpen(false); dispatchCommandShortcut("toggleCanvasOnly"); }}>
              {canvasOnly ? <EyeOff size={16} /> : <Eye size={16} />}
              {language === "zh" ? "画布独占模式" : "Canvas-only mode"}<span>{formatShortcutForPlatform(commandShortcutAssignments.toggleCanvasOnly)}</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { setIsViewMenuOpen(false); dispatchCommandShortcut("showAllPanels"); }}><PanelTopOpen size={16} />{language === "zh" ? "显示所有面板" : "Show all panels"}<span>{formatShortcutForPlatform(commandShortcutAssignments.showAllPanels)}</span></button>
            <button type="button" role="menuitem" onClick={() => { setIsViewMenuOpen(false); dispatchCommandShortcut("toggleFullscreen"); }}><Fullscreen size={16} />{isFullscreen ? (language === "zh" ? "退出全屏" : "Exit full screen") : (language === "zh" ? "进入全屏" : "Enter full screen")}<span>{formatShortcutForPlatform(commandShortcutAssignments.toggleFullscreen)}</span></button>
            <div className="menu-divider" role="separator" />
            <button type="button" role="menuitem" onClick={() => { setIsViewMenuOpen(false); dispatchCommandShortcut("resetWorkspace"); }}><RotateCcw size={16} />{language === "zh" ? "重置工作区布局" : "Reset Workspace Layout"}<span>{formatShortcutForPlatform(commandShortcutAssignments.resetWorkspace)}</span></button>
          </div>, menuLayerRef.current)}
        </div>
        {hasOpenDocument && <div className="document-tab-strip">
          {tabScrollState.hasOverflow && <button className="document-scroll-button" type="button" title={ui.previousDocuments} aria-label={ui.previousDocuments} disabled={!tabScrollState.canGoBack} onClick={() => scrollDocumentTabs(-1)}><ChevronLeft size={16} /></button>}
          <div className="document-tabs" ref={documentTabsRef} role="tablist" aria-label={ui.openDocuments}>
          {tabs.map((tab) => {
            const selected = tab.id === activeTab.id;
            return <div
              key={tab.id}
              className={selected ? "document-tab is-active" : "document-tab"}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              title={displayProjectName(tab.document.name)}
              onClick={() => { setActiveTabID(tab.id); setRenamingLayerId(null); setRenamingDocumentTabID(null); setIsPlaying(false); invalidate(); }}
              onContextMenu={(event) => {
                setActiveTabID(tab.id);
                setRenamingLayerId(null);
                setRenamingDocumentTabID(null);
                setIsPlaying(false);
                openContextMenu(event, {kind: "document", tabId: tab.id});
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (openKeyboardContextMenu(event, {kind: "document", tabId: tab.id})) return;
                if (isActivationKey(event.key)) {
                  event.preventDefault();
                  event.currentTarget.click();
                  return;
                }
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                const tabElements = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
                const currentIndex = tabElements.indexOf(event.currentTarget);
                if (currentIndex < 0 || tabElements.length < 2) return;
                const nextIndex = event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabElements.length - 1
                    : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabElements.length) % tabElements.length;
                event.preventDefault();
                tabElements[nextIndex].focus();
                tabElements[nextIndex].click();
              }}
            >
              <span className={tab.history.isDirty ? "dirty-dot" : ""} />
              {renamingDocumentTabID === tab.id ? (
                <input
                  type="text"
                  className="document-tab-name-input"
                  value={documentNameDraft}
                  autoFocus
                  aria-label={ui.projectName}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setDocumentNameDraft(event.target.value)}
                  onBlur={() => finishDocumentRename(tab)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      cancelDocumentRenameRef.current = true;
                      event.currentTarget.blur();
                    }
                  }}
                />
              ) : <span
                className="document-tab-name"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setActiveTabID(tab.id);
                  setDocumentNameDraft(displayProjectName(tab.document.name));
                  setRenamingDocumentTabID(tab.id);
                }}
              >{displayProjectName(tab.document.name)}</span>}
              <button
                className="document-tab-close"
                type="button"
                title={`${ui.closeDocument} ${displayProjectName(tab.document.name)}`}
                aria-label={`${ui.closeDocument} ${displayProjectName(tab.document.name)}`}
                onClick={(event) => { event.stopPropagation(); closeTab(tab); }}
              ><X size={13} /></button>
            </div>;
          })}
          </div>
          {tabScrollState.hasOverflow && <button className="document-scroll-button" type="button" title={ui.nextDocuments} aria-label={ui.nextDocuments} disabled={!tabScrollState.canGoForward} onClick={() => scrollDocumentTabs(1)}><ChevronRight size={16} /></button>}
        </div>}
        <div className="topbar-actions">
          {hasOpenDocument && <>
            <button className="icon-button" onClick={undo} disabled={!history.canUndo} title={preferences.undo.showTooltip ? ui.undo : undefined} aria-label={ui.undo}><Undo2 size={17} /></button>
            <button className="icon-button" onClick={redo} disabled={!history.canRedo} title={preferences.undo.showTooltip ? ui.redo : undefined} aria-label={ui.redo}><Redo2 size={17} /></button>
            <button className="icon-button" type="button" title={language === "zh" ? "历史记录" : "History"} aria-label={language === "zh" ? "历史记录" : "History"} onClick={() => setHistoryOpen(true)}><HistoryIcon size={17} /></button>
            <span className="toolbar-separator" />
          </>}
          <button className="icon-button" onClick={() => setLightTheme((value) => !value)} title={ui.toggleTheme}><Sun size={17} /></button>
          <button className="icon-button" type="button" title={ui.switchLanguage} aria-label={ui.switchLanguage} onClick={() => setLanguage((value) => value === "en" ? "zh" : "en")}><Languages size={17} /></button>
          <button className="icon-button" type="button" title={language === "zh" ? "偏好设置" : "Preferences"} aria-label={language === "zh" ? "偏好设置" : "Preferences"} onClick={() => setSettingsOpen(true)}><Settings size={17} /></button>
        </div>
      </header>

      {hasOpenDocument && <>
      <aside className="tool-rail" aria-label={ui.tools}>
        {toolGroups.map((group) => {
          const displayedTool = group.tools.includes(selectedTool)
            ? selectedTool
            : group.tools.includes(preferredToolByGroup[group.id])
              ? preferredToolByGroup[group.id]
              : group.defaultTool;
          const definition = toolDefinitionByID.get(displayedTool)!;
          const Icon = definition.icon;
          const isActive = group.tools.includes(selectedTool);
          const hasMenu = group.tools.length > 1;
          return <div className="tool-group-slot" key={group.id}>
            <button
              type="button"
              className={`${isActive ? "tool-button is-active" : "tool-button"}${hasMenu ? " has-tool-menu" : ""}`}
              title={`${ui.toolsByID[displayedTool]}${hasMenu ? ` · ${language === "zh" ? "长按或右键选择工具" : "Hold or right-click to choose a tool"}` : ""}`}
              aria-label={ui.toolsByID[displayedTool]}
              aria-pressed={isActive}
              aria-haspopup={hasMenu ? "menu" : undefined}
              aria-expanded={hasMenu ? openToolGroupID === group.id : undefined}
              onPointerDown={(event) => beginToolGroupLongPress(group, event)}
              onPointerUp={clearToolGroupLongPress}
              onPointerCancel={clearToolGroupLongPress}
              onPointerLeave={clearToolGroupLongPress}
              onContextMenu={(event) => {
                if (!hasMenu) return;
                event.preventDefault();
                clearToolGroupLongPress();
                openToolGroupMenu(group, event.currentTarget);
              }}
              onKeyDown={(event) => {
                if (!hasMenu || (event.key !== "ArrowRight" && event.key !== "ArrowDown")) return;
                event.preventDefault();
                openToolGroupMenu(group, event.currentTarget);
              }}
              onClick={() => {
                if (toolGroupSuppressClickRef.current === group.id) {
                  toolGroupSuppressClickRef.current = null;
                  return;
                }
                activateTool(displayedTool);
              }}
            ><Icon size={19} /></button>
          </div>;
        })}
      </aside>
      {openToolGroupID && menuLayerRef.current && (() => {
        const group = toolGroups.find((candidate) => candidate.id === openToolGroupID);
        if (!group) return null;
        return createPortal(<div
          ref={toolGroupMenuRef}
          className="tool-group-popover"
          role="menu"
          aria-label={language === "zh" ? "选择工具" : "Choose tool"}
          style={{left: toolGroupMenuPosition.left, top: toolGroupMenuPosition.top}}
        >
          {group.tools.map((tool) => {
            const definition = toolDefinitionByID.get(tool)!;
            const Icon = definition.icon;
            const shortcut = shortcutAssignments[tool]?.toUpperCase();
            return <button
              key={tool}
              type="button"
              role="menuitemradio"
              aria-checked={selectedTool === tool}
              className={selectedTool === tool ? "is-active" : ""}
              onClick={() => activateTool(tool)}
            >
              <Icon size={17} />
              <span>{ui.toolsByID[tool]}</span>
              {shortcut && <kbd>{shortcut}</kbd>}
            </button>;
          })}
        </div>, menuLayerRef.current);
      })()}

      <main className="workspace" onPointerDown={() => {
        if (activeTab.commandScope === "canvas" && activeTab.selectedCelKeys.length === 0) return;
        if (!preferences.timeline.keepSelection) {
          activeTab.selectedCelKeys = [];
          activeTab.celSelectionAnchor = null;
          activeTab.selectedFrameIds = [pixelDocument.activeFrameId];
          activeTab.frameSelectionAnchorId = pixelDocument.activeFrameId;
        }
        setTabCommandScope(activeTab, "canvas");
        setUIRevision((value) => value + 1);
      }}>
        <PixelCanvas
          interactionGuardRef={mcpInteractionGuardRef}
          width={pixelDocument.width}
          height={pixelDocument.height}
          pixels={activeCel?.pixels ?? transparentPixels}
          displayPixels={displayPixels}
          displayDirtyBounds={displayDirtyBounds}
          revision={revision}
          documentKey={activeTab.id}
          lightTheme={lightTheme}
          checkerSize={preferences.background.checkerSize}
          checkerLight={preferences.background.checkerLight}
          checkerDark={preferences.background.checkerDark}
          zoom={zoom}
          color={foregroundRGBA}
          secondaryColor={backgroundRGBA}
          backgroundLayer={activeLayer.role === "background"}
          brushSize={brushSize}
          brushShape={brushShape}
          bitmapBrush={bitmapBrush}
          patternBrush={documentPatternBrush}
          patternAlignment={patternAlignment}
          patternOrigin={patternOrigin}
          brushSpacing={brushSpacing}
          pixelPerfect={pixelPerfect}
          pressureEnabled={pressureEnabled}
          brushDynamicsEnabled={brushDynamicsEnabled}
          brushDynamics={brushDynamics}
          brushStabilizer={brushStabilizer}
          polygonSides={polygonSides}
          brushAngle={brushAngle}
          inkMode={inkMode}
          gradientDither={gradientDither}
          gradientType={gradientType}
          shapeFillMode={shapeFillMode}
          blurRadius={blurRadius}
          jumbleAmount={jumbleAmount}
          alphaLock={activeLayer.alphaLock}
          symmetryX={pixelDocument.settings.symmetryX}
          symmetryY={pixelDocument.settings.symmetryY}
          symmetryAxisX={pixelDocument.settings.symmetryAxisX}
          symmetryAxisY={pixelDocument.settings.symmetryAxisY}
          tiledX={pixelDocument.settings.tiledX}
          tiledY={pixelDocument.settings.tiledY}
          gridWidth={pixelDocument.settings.gridWidth}
          gridHeight={pixelDocument.settings.gridHeight}
          gridOffsetX={pixelDocument.settings.gridOffsetX}
          gridOffsetY={pixelDocument.settings.gridOffsetY}
          snapToGrid={pixelDocument.settings.snapToGrid}
          showPixelGrid={showPixelGrid}
          pixelGridColor={preferences.grid.pixelGridColor}
          pixelGridOpacity={preferences.grid.pixelGridOpacity}
          gridLineColor={preferences.grid.lineColor}
          gridLineOpacity={preferences.grid.lineOpacity}
          tileGridLines={activeTileGridLines}
          tileCellOverlays={tileCellOverlays}
          tileImagePreviews={tileImagePreviews}
          guideColor={preferences.guides.guideColor}
          showSelectionEdges={preferences.selection.showEdges}
          wheelZoom={preferences.editor.wheelZoom}
          zoomFromCenter={preferences.editor.zoomFromCenter}
          autoFitOnOpen={preferences.editor.autoFitOnOpen}
          previewShiftLine={preferences.editor.previewShiftLine}
          cursorPreview={preferences.cursor.preview}
          cursorScale={preferences.cursor.scale}
          cursorColor={preferences.cursor.color}
          guides={pixelDocument.guides}
          sliceOverlays={sliceOverlays}
          activeSliceId={activeSlice?.id ?? ""}
          selectedSliceIds={selectedSliceIds}
          selectionAntialias={selectionAntialias}
          tool={selectedTool}
          editable={canEditPixels}
          cropEnabled={!isPlaying}
          onZoomChange={setZoom}
          onPixelsChanged={invalidatePixels}
          onEditCommit={commitEdit}
          onEnsureEditablePixels={ensureActiveCelForEdit}
          onColorPicked={(pickedColor: RGBA) => {
            setForegroundColor(rgbaToHex(pickedColor));
            setForegroundAlpha(Math.round(pickedColor[3] / 2.55));
            setColorTarget("foreground");
            if (preferences.editor.discardCustomBrushOnEyedropper) {
              setBitmapBrush(null);
              setPatternBrush(null);
              setBrushShape("square");
              setBrushPreset("square");
            }
          }}
          onSecondaryColorPicked={(pickedColor: RGBA) => {
            setBackgroundColor(rgbaToHex(pickedColor));
            setBackgroundAlpha(Math.round(pickedColor[3] / 2.55));
            setColorTarget("background");
            if (preferences.editor.discardCustomBrushOnEyedropper) {
              setBitmapBrush(null);
              setPatternBrush(null);
              setBrushShape("square");
              setBrushPreset("square");
            }
          }}
           onBlockedEdit={() => setStatus(isPlaying ? "Pause playback to edit" : isImageLayer(activeLayer) ? `${activeLayer.name} is locked` : "Select an image layer")}
          onCursorChange={setCursor}
          selection={selection}
          selectionOperation={selectionOperation}
          selectionMode={selectionMode}
          selectionTolerance={selectionTolerance}
          transformMode={transformMode}
          transformPivot={activeTab.transformPivot}
          onTransformPivotChange={updateTransformPivot}
          onTransformSelectionFromContent={() => canEditPixels
            ? layerOpaqueContentSelection(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId)
            : null}
          onGuideChange={(id, position) => mutateDocument("Move Guide", () => {
            const guide = pixelDocument.guides.find((candidate) => candidate.id === id);
            if (!guide || guide.position === position) return false;
            guide.position = position;
            return true;
          })}
          onOverlayContextMenu={(target: CanvasContextTarget, position) => {
            if (target.kind === "slice") {
              setActiveSliceId(target.id);
              if (!selectedSliceIds.includes(target.id)) setSelectedSliceIds([target.id]);
              showContextMenu({kind: "slice", sliceId: target.id}, position.clientX, position.clientY);
              return;
            }
            showContextMenu({kind: "guide", guideId: target.id}, position.clientX, position.clientY);
          }}
          onGridOffsetChange={(x, y) => mutateDocument("Move Grid", () => {
            if (pixelDocument.settings.gridOffsetX === x && pixelDocument.settings.gridOffsetY === y) return false;
            pixelDocument.settings.gridOffsetX = x;
            pixelDocument.settings.gridOffsetY = y;
            return true;
          })}
          onSliceBoundsChange={(id, bounds) => mutateDocument("Edit Slice", () => {
            return updateSliceKey(pixelDocument, id, pixelDocument.activeFrameId, bounds);
          })}
          onSliceBatchBoundsChange={(changes) => mutateDocument("Edit Slices", () => (
            resizeSliceKeys(pixelDocument, pixelDocument.activeFrameId, changes)
          ))}
          onSliceCreate={createSliceFromBounds}
          onActiveSliceChange={setActiveSliceId}
          onSliceSelectionChange={setSelectedSliceIds}
          onSliceDoubleClick={openSliceProperties}
          onSelectionChange={setSelection}
          onCelMovePointer={handleCelMovePointer}
          onCrop={cropCanvas}
          textPreview={textRaster}
          onTextPlace={placeText}
          onTilemapPointer={activeTileset && (selectedTool === "pencil" || selectedTool === "eraser") ? handleTilemapPointer : undefined}
          onTilemapHover={activeTileset && activeCel?.tilemap ? (point) => {
            if (!point) {
              setTilemapHoverCell(null);
              return;
            }
            const cell = tilemapCellAtPixel(activeTileset, activeCel.tilemap!, point.x - activeCel.x, point.y - activeCel.y);
            const next = cell.column >= 0 && cell.row >= 0
              && cell.column < activeCel.tilemap!.columns && cell.row < activeCel.tilemap!.rows
              ? cell
              : null;
            setTilemapHoverCell((current) => current?.column === next?.column && current?.row === next?.row ? current : next);
          } : undefined}
        />
      </main>

      {inspectorVisible && <aside className="inspector" onContextMenu={(event) => {
        if (event.target === event.currentTarget) openContextMenu(event, {kind: "panel", panel: "inspector"});
      }}>
        <section className="panel-section color-section">
          <div className="color-section-header" onContextMenu={(event) => openContextMenu(event, {kind: "panel", panel: "inspector"})}>
            <h2>{ui.color}</h2>
            <select className="color-mode-select" value={pixelDocument.colorMode} disabled={isPlaying} aria-label={ui.colorMode} title={ui.colorMode} onChange={(event) => changeColorMode(event.target.value as ColorMode)}>
              <option value="rgba">{ui.rgbaMode}</option>
              <option value="grayscale">{ui.grayscaleMode}</option>
              <option value="indexed">{ui.indexedMode}</option>
              <option value="bitmap">{ui.bitmapMode}</option>
            </select>
          </div>
          {pixelDocument.colorMode === "indexed" && <div className="color-settings-row">
            <label>
              <span>{language === "zh" ? "抖动" : "Dither"}</span>
              <select className="color-mode-select" value={indexedDither} disabled={isPlaying} aria-label={language === "zh" ? "索引色抖动" : "Indexed dithering"} title={language === "zh" ? "索引色转换抖动" : "Indexed conversion dithering"} onChange={(event) => setIndexedDither(event.target.value as DitherMode)}><option value="none">{language === "zh" ? "无抖动" : "No dither"}</option><option value="ordered">{language === "zh" ? "有序抖动" : "Ordered"}</option><option value="floyd-steinberg">Floyd-Steinberg</option></select>
            </label>
          </div>}
          <div className="color-editor-row">
            <div className="color-pair">
              <label className={`color-chip is-foreground${colorTarget === "foreground" ? " is-active" : ""}`} style={colorChipBackground(foregroundColor, foregroundAlpha)} title={ui.foreground}>
                <input type="color" value={foregroundColor} aria-label={ui.foreground} onPointerDown={() => setColorTarget("foreground")} onChange={(event) => { setColorTarget("foreground"); setForegroundColor(event.target.value); }} />
              </label>
              <label className={`color-chip is-background${colorTarget === "background" ? " is-active" : ""}`} style={colorChipBackground(backgroundColor, backgroundAlpha)} title={ui.background}>
                <input type="color" value={backgroundColor} aria-label={ui.background} onPointerDown={() => setColorTarget("background")} onChange={(event) => { setColorTarget("background"); setBackgroundColor(event.target.value); }} />
              </label>
            </div>
            <div className="color-editor-summary">
              <span>{colorTarget === "foreground" ? ui.foreground : ui.background}</span>
              <code title={editedColorText}>{editedColorSummary}</code>
            </div>
            <button className="swap-colors" type="button" title={ui.swapColors} aria-label={ui.swapColors} onClick={() => { setForegroundColor(backgroundColor); setForegroundAlpha(backgroundAlpha); setBackgroundColor(foregroundColor); setBackgroundAlpha(foregroundAlpha); }}><ChevronLeft size={13} /><ChevronRight size={13} /></button>
          </div>
          <div className="color-model-tabs" role="tablist" aria-label={ui.color}>
            <button type="button" role="tab" aria-selected={colorEditorMode === "rgba"} className={colorEditorMode === "rgba" ? "is-active" : ""} onClick={() => setColorEditorMode("rgba")}>RGBA</button>
            <button type="button" role="tab" aria-selected={colorEditorMode === "hsla"} className={colorEditorMode === "hsla" ? "is-active" : ""} onClick={() => setColorEditorMode("hsla")}>HSLA</button>
          </div>
          <div className="color-channel-grid">
            {colorChannels.map((channel) => (
              <label className={`color-channel${channel.key === "a" ? " is-alpha" : ""}`} key={`${colorEditorMode}-${channel.key}`}>
                <span>{channel.label}</span>
                <input type="range" min="0" max={channel.maximum} value={Math.round(channel.value)} onChange={(event) => updateColorChannel(channel.key, Number(event.target.value))} />
                <input className="color-channel-number" type="number" min="0" max={channel.maximum} value={Math.round(channel.value)} aria-label={`${colorEditorMode.toUpperCase()} ${channel.label}`} onChange={(event) => updateColorChannel(channel.key, Number(event.target.value))} />
                <span className="color-channel-unit">{channel.maximum === 100 ? "%" : ""}</span>
              </label>
            ))}
          </div>
          <details className="color-selector-panel">
            <summary>{language === "zh" ? "颜色选择器" : "Color selector"}</summary>
            <label className="compact-field"><span>{language === "zh" ? "类型" : "Type"}</span><select value={colorSelectorMode} onChange={(event) => setColorSelectorMode(event.target.value as ColorSelectorMode)}><option value="spectrum">{language === "zh" ? "光谱" : "Spectrum"}</option><option value="wheel">{language === "zh" ? "色轮" : "Color wheel"}</option><option value="tint-shade-tone">{language === "zh" ? "色调 / 明暗" : "Tint / shade / tone"}</option></select></label>
            <ColorSelector
              mode={colorSelectorMode}
              color={colorTarget === "foreground" ? foregroundColor : backgroundColor}
              label={language === "zh" ? "调整当前颜色" : "Adjust current color"}
              onChange={(color) => colorTarget === "foreground" ? setForegroundColor(color) : setBackgroundColor(color)}
            />
          </details>
          <div className="panel-subheading">
            <span>{ui.palette}</span>
            <div className="mini-actions palette-actions" ref={paletteMenuRef}>
              <button type="button" title={ui.addColor} aria-label={ui.addColor} disabled={isPlaying} onClick={addPaletteColor}><Plus size={13} /></button>
              <button className="palette-edit" type="button" title={ui.editColor} aria-label={ui.editColor} disabled={isPlaying || !hasSelectedPaletteColor} onClick={updatePaletteColor}>
                <Pencil size={12} />
              </button>
              <button type="button" title={ui.removeColor} aria-label={ui.removeColor} disabled={isPlaying || pixelDocument.palette.colors.length <= 1 || !hasSelectedPaletteColor} onClick={removePaletteColor}><Trash2 size={13} /></button>
              <button className={isPaletteMenuOpen ? "is-open" : ""} type="button" title={language === "zh" ? "调色板菜单" : "Palette menu"} aria-label={language === "zh" ? "调色板菜单" : "Palette menu"} aria-haspopup="menu" aria-expanded={isPaletteMenuOpen} onClick={() => setIsPaletteMenuOpen((value) => !value)}><MoreHorizontal size={14} /></button>
              {isPaletteMenuOpen && <div className="file-menu-popover palette-menu-popover" role="menu" aria-label={language === "zh" ? "调色板文件与管理" : "Palette files and management"}>
                <button type="button" role="menuitem" disabled={isPlaying} onClick={() => { setIsPaletteMenuOpen(false); extractDocumentPalette(); }}><WandSparkles size={16} />{ui.extractPalette}</button>
                <button type="button" role="menuitem" disabled={isPlaying} onClick={() => { setIsPaletteMenuOpen(false); sortDocumentPalette(); }}><Shuffle size={16} />{ui.sortPalette}</button>
                <button type="button" role="menuitem" onClick={() => {
                  setIsPaletteMenuOpen(false);
                  try { saveDefaultPalette(localStorage, pixelDocument.palette); setStatus(language === "zh" ? "默认调色板已保存，用于新建文件" : "Default palette saved for new documents"); }
                  catch { setStatus(language === "zh" ? "无法保存默认调色板" : "Could not save default palette"); }
                }}><Save size={16} />{language === "zh" ? "保存为默认调色板" : "Save as default palette"}</button>
                <button type="button" role="menuitem" disabled={isPlaying} onClick={() => {
                  setIsPaletteMenuOpen(false);
                  mutateDocument(language === "zh" ? "应用默认调色板" : "Apply Default Palette", () => applyDocumentPalette(pixelDocument, readDefaultPalette(localStorage)));
                }}><FolderOpen size={16} />{language === "zh" ? "应用默认调色板" : "Apply default palette"}</button>
                <button type="button" role="menuitem" onClick={() => {
                  setIsPaletteMenuOpen(false);
                  try { resetDefaultPalette(localStorage); setStatus(language === "zh" ? "已恢复内置默认调色板，当前文件不变" : "Built-in default palette restored; current document unchanged"); }
                  catch { setStatus(language === "zh" ? "无法恢复默认调色板" : "Could not restore default palette"); }
                }}><RotateCcw size={16} />{language === "zh" ? "恢复内置默认调色板" : "Restore built-in default palette"}</button>
                <div className="menu-divider" role="separator" />
                <button type="button" role="menuitem" disabled={isPlaying} onClick={() => { setIsPaletteMenuOpen(false); void importPaletteFile(); }}><FileUp size={16} />{language === "zh" ? "导入调色板" : "Import palette"}</button>
                <button type="button" role="menuitem" onClick={() => { setIsPaletteMenuOpen(false); exportPaletteFile("gpl"); }}><FileDown size={16} />{language === "zh" ? "导出 GPL" : "Export GPL"}</button>
                <button type="button" role="menuitem" onClick={() => { setIsPaletteMenuOpen(false); exportPaletteFile("jasc-pal"); }}><FileDown size={16} />{language === "zh" ? "导出 JASC-PAL" : "Export JASC-PAL"}</button>
              </div>}
            </div>
          </div>
          {pixelDocument.colorMode === "indexed" && <label className="compact-field transparent-index-field" title={language === "zh" ? "移动透明槽位并重映射索引，保留画面外观" : "Move the transparent slot and remap indexes, preserving artwork"}>
            <span>{language === "zh" ? "透明索引" : "Transparent"}</span>
            <select aria-label={language === "zh" ? "透明索引" : "Transparent index"} value={pixelDocument.palette.transparentIndex} disabled={isPlaying} onChange={(event) => mutateDocument(language === "zh" ? "移动透明索引" : "Move Transparent Index", () => relocateTransparentIndex(pixelDocument, Number(event.target.value)))}>
              {pixelDocument.palette.colors.map((color, index) => <option key={index} value={index}>{index}: {color.toUpperCase()}</option>)}
            </select>
          </label>}
          <div className="swatch-grid" aria-label={ui.palette}>
            {pixelDocument.palette.colors.map((swatch, index) => (
              <button
                key={`${swatch}-${index}`}
                className={paletteIndex === index ? "swatch is-selected" : "swatch"}
                style={colorChipBackground(swatch)}
                onClick={() => { setSelectedPaletteIndex(index); usePaletteColor(swatch, "foreground"); }}
                onContextMenu={(event) => { event.preventDefault(); setSelectedPaletteIndex(index); usePaletteColor(swatch, "background"); }}
                title={swatch}
                aria-label={`${ui.useColor} ${swatch}`}
              />
            ))}
          </div>
        </section>

        <div className="inspector-scroll">
        {activeTileset && <section className="panel-section tilemap-section tool-settings-section">
          <div className="tilemap-heading"><h2>{language === "zh" ? "图块地图" : "Tilemap"}</h2><span>{activeTileset.tileWidth} × {activeTileset.tileHeight}</span></div>
          <div className="tilemap-tileset-actions">
            <button type="button" className="panel-command" onClick={renameActiveTileset}>{language === "zh" ? "重命名图块集" : "Rename Tileset"}</button>
            <button type="button" className="panel-command" onClick={createSharedTilemapLayer}>{language === "zh" ? "新建共享图层" : "New Shared Layer"}</button>
            <button type="button" className="panel-command" onClick={createBlankTilesetForLayer}>{language === "zh" ? "新建图块集" : "New Tileset"}</button>
            <button type="button" className="panel-command" onClick={duplicateActiveTileset}>{language === "zh" ? "复制图块集" : "Duplicate Tileset"}</button>
          </div>
          <label className="compact-field"><span>{language === "zh" ? "图层图块集" : "Layer Tileset"}</span><select value={activeTileset.id} onChange={(event) => assignActiveLayerTileset(event.target.value)}>
            {pixelDocument.tilesets.map((tileset) => <option key={tileset.id} value={tileset.id}>{tileset.name}</option>)}
          </select></label>
          <div className="tileset-reference-summary">
            <span>{language === "zh" ? "引用" : "References"}: {activeTilesetReferences.layers.length} {language === "zh" ? "图层" : "layers"} · {activeTilesetReferences.cels.length} Cels · {activeTilesetReferences.terrains.length} Terrain</span>
            <button type="button" title={language === "zh" ? "删除图块集" : "Delete Tileset"} disabled={pixelDocument.tilesets.length < 2} onClick={deleteActiveTileset}><Trash2 size={13} /></button>
          </div>
          <TilesetReferencesPanel references={activeTilesetReferences} language={language}
            firstFrame={preferences.timeline.firstFrame} onSelectLayer={selectLayer} onSelectCel={selectCel}
            onSelectTerrain={(id) => { setSelectedTerrainID(id); setTilemapDrawMode("terrain"); }} />
          <label className="compact-field"><span>{language === "zh" ? "网格" : "Grid"}</span><select value={activeTileset.grid.kind === "hexagonal"
            ? `hex-${activeTileset.grid.orientation}-${activeTileset.grid.offset.startsWith("odd") ? "odd" : "even"}`
            : activeTileset.grid.kind} onChange={(event) => updateActiveTilesetGrid(event.target.value)}>
            <option value="orthogonal">{language === "zh" ? "正交" : "Orthogonal"}</option>
            <option value="isometric">{language === "zh" ? "等距" : "Isometric"}</option>
            <option value="hex-pointy-odd">Hex pointy odd-r</option>
            <option value="hex-pointy-even">Hex pointy even-r</option>
            <option value="hex-flat-odd">Hex flat odd-q</option>
            <option value="hex-flat-even">Hex flat even-q</option>
          </select></label>
          {activeTileset.grid.kind === "isometric" && <div className="tilemap-grid-fields">
            <label className="compact-field"><span>{language === "zh" ? "底面宽" : "Cell width"}</span><input type="number" min={1} max={4096} value={activeTileset.grid.cellWidth} onChange={(event) => updateActiveIsometricGrid("cellWidth", Number(event.target.value))} /></label>
            <label className="compact-field"><span>{language === "zh" ? "底面高" : "Cell height"}</span><input type="number" min={1} max={4096} value={activeTileset.grid.cellHeight} onChange={(event) => updateActiveIsometricGrid("cellHeight", Number(event.target.value))} /></label>
            <label className="compact-field"><span>{language === "zh" ? "锚点 X" : "Anchor X"}</span><input type="number" min={0} max={activeTileset.tileWidth} value={activeTileset.grid.anchorX} onChange={(event) => updateActiveIsometricGrid("anchorX", Number(event.target.value))} /></label>
            <label className="compact-field"><span>{language === "zh" ? "锚点 Y" : "Anchor Y"}</span><input type="number" min={0} max={activeTileset.tileHeight} value={activeTileset.grid.anchorY} onChange={(event) => updateActiveIsometricGrid("anchorY", Number(event.target.value))} /></label>
          </div>}
          {activeTileset.grid.kind === "hexagonal" && <div className="tilemap-grid-fields">
            <label className="compact-field"><span>{language === "zh" ? "边长" : "Side length"}</span><input type="number" min={1} max={1024} value={Math.round((activeTileset.grid.orientation === "pointy" ? activeTileset.tileHeight : activeTileset.tileWidth) / 2)} onChange={(event) => updateActiveHexSideLength(Number(event.target.value))} /></label>
            <div className="tileset-reference-summary"><span>{activeTileset.tileWidth} × {activeTileset.tileHeight} {language === "zh" ? "边界框" : "bounds"}</span></div>
          </div>}
          <div className="tilemap-data-actions">
            <button type="button" className="panel-command" onClick={() => void importActiveTilemapData()}><FileUp size={13} /><span>{language === "zh" ? "导入地图" : "Import map"}</span></button>
            <button type="button" className="panel-command" onClick={() => void exportActiveTilemapData("json")}><Download size={13} /><span>JSON</span></button>
            <button type="button" className="panel-command" onClick={() => void exportActiveTilemapData("csv")}><Download size={13} /><span>CSV</span></button>
          </div>
          <button type="button" className="panel-command" onClick={() => void importTilesetBundle()}><FileUp size={13} /><span>{language === "zh" ? "导入 PNG 与地图元数据" : "Import PNG and map metadata"}</span></button>
          <div className="color-model-tabs" role="tablist" aria-label={language === "zh" ? "图块绘制模式" : "Tile drawing mode"}>
            <button type="button" role="tab" aria-selected={tilemapDrawMode === "tiles"} className={tilemapDrawMode === "tiles" ? "is-active" : ""} onClick={() => setTilemapDrawMode("tiles")}>{language === "zh" ? "绘制图块" : "Draw Tiles"}</button>
            <button type="button" role="tab" aria-selected={tilemapDrawMode === "pixels"} className={tilemapDrawMode === "pixels" ? "is-active" : ""} onClick={() => setTilemapDrawMode("pixels")}>{language === "zh" ? "绘制像素" : "Draw Pixels"}</button>
            <button type="button" role="tab" aria-selected={tilemapDrawMode === "terrain"} className={tilemapDrawMode === "terrain" ? "is-active" : ""} onClick={() => setTilemapDrawMode("terrain")}>{language === "zh" ? "地形" : "Terrain"}</button>
          </div>
          {tilemapDrawMode === "tiles" && <>
            <div className="tilemap-tool-actions" role="toolbar" aria-label={language === "zh" ? "图块工具" : "Tile tools"}>
              <button type="button" className={tilemapToolMode === "pencil" ? "is-active" : ""} aria-pressed={tilemapToolMode === "pencil"} title={language === "zh" ? "图块铅笔" : "Tile pencil"} onClick={() => setTilemapToolMode("pencil")}><Pencil size={14} /></button>
              <button type="button" className={tilemapToolMode === "picker" ? "is-active" : ""} aria-pressed={tilemapToolMode === "picker"} title={language === "zh" ? "拾取图块" : "Pick tile"} onClick={() => setTilemapToolMode("picker")}><Pipette size={14} /></button>
              <button type="button" className={tilemapToolMode === "fill" ? "is-active" : ""} aria-pressed={tilemapToolMode === "fill"} title={language === "zh" ? "填充图块" : "Fill tiles"} onClick={() => setTilemapToolMode("fill")}><PaintBucket size={14} /></button>
              <button type="button" className={tilemapToolMode === "line" ? "is-active" : ""} aria-pressed={tilemapToolMode === "line"} title={language === "zh" ? "图块直线" : "Tile line"} onClick={() => setTilemapToolMode("line")}><Slash size={14} /></button>
              <button type="button" className={tilemapToolMode === "rectangle" ? "is-active" : ""} aria-pressed={tilemapToolMode === "rectangle"} title={language === "zh" ? "图块矩形" : "Tile rectangle"} onClick={() => setTilemapToolMode("rectangle")}><Square size={14} /></button>
              <button type="button" className={tilemapToolMode === "stamp" ? "is-active" : ""} aria-pressed={tilemapToolMode === "stamp"} disabled={!tileStamp} title={language === "zh" ? "图块印章" : "Tile stamp"} onClick={() => setTilemapToolMode("stamp")}><Copy size={14} /></button>
              <button type="button" className={tilemapToolMode === "select" ? "is-active" : ""} aria-pressed={tilemapToolMode === "select"} title={language === "zh" ? "图块单元格选区" : "Tile cell selection"} onClick={() => setTilemapToolMode("select")}><BoxSelect size={14} /></button>
            </div>
            {tilemapToolMode === "rectangle" && <label className="brush-option-row is-single"><input type="checkbox" checked={tileRectangleFilled} onChange={(event) => setTileRectangleFilled(event.target.checked)} />{language === "zh" ? "填充矩形" : "Filled rectangle"}</label>}
            {tilemapToolMode === "select" && <div className="tilemap-tool-actions" role="toolbar" aria-label={language === "zh" ? "图块选区命令" : "Tile selection commands"}>
              <button type="button" disabled={!tileCellSelection} title={language === "zh" ? "复制单元格" : "Copy cells"} onClick={() => copyTileCells(false)}><Copy size={14} /></button>
              <button type="button" disabled={!tileCellSelection} title={language === "zh" ? "剪切单元格" : "Cut cells"} onClick={() => copyTileCells(true)}><Scissors size={14} /></button>
              <button type="button" disabled={!tileCellClipboard} title={language === "zh" ? "粘贴单元格" : "Paste cells"} onClick={pasteTileCells}><ClipboardPaste size={14} /></button>
              <button type="button" disabled={!tileCellSelection} title={language === "zh" ? "水平翻转单元格" : "Flip cells horizontally"} onClick={() => transformSelectedTileCells("flip-x")}><FlipHorizontal2 size={14} /></button>
              <button type="button" disabled={!tileCellSelection} title={language === "zh" ? "垂直翻转单元格" : "Flip cells vertically"} onClick={() => transformSelectedTileCells("flip-y")}><FlipVertical2 size={14} /></button>
              <button type="button" disabled={!tileCellSelection || activeTileset.grid.kind !== "orthogonal"} title={language === "zh" ? "顺时针旋转单元格（仅正交网格）" : "Rotate cells clockwise (orthogonal only)"} onClick={() => transformSelectedTileCells("cw")}><RotateCw size={14} /></button>
              <button type="button" disabled={!tileCellSelection || activeTileset.grid.kind !== "orthogonal"} title={language === "zh" ? "逆时针旋转单元格（仅正交网格）" : "Rotate cells counterclockwise (orthogonal only)"} onClick={() => transformSelectedTileCells("ccw")}><RotateCcw size={14} /></button>
              <button type="button" disabled={!tileCellSelection} title={language === "zh" ? "清除单元格选区" : "Clear cell selection"} onClick={() => setTileCellSelection(null)}><X size={14} /></button>
            </div>}
            <button type="button" className="panel-command" disabled={!selection && !tileCellSelection} onClick={captureTileStampFromSelection}>{language === "zh" ? "从选区创建图块印章" : "Create stamp from selection"}</button>
            {tileStamp && <div className="tile-stamp-settings">
              <span>{tileStamp.width} × {tileStamp.height}</span>
              <select value={tileStampEmptyMode} onChange={(event) => setTileStampEmptyMode(event.target.value as "overwrite" | "skip")} aria-label={language === "zh" ? "空图块行为" : "Empty tile behavior"}>
                <option value="overwrite">{language === "zh" ? "覆盖空格" : "Overwrite empty"}</option>
                <option value="skip">{language === "zh" ? "跳过空格" : "Skip empty"}</option>
              </select>
              <div className="mini-actions">
                <button type="button" title={language === "zh" ? "水平翻转印章" : "Flip stamp horizontally"} onClick={() => transformTileStamp("flip-x")}><FlipHorizontal2 size={13} /></button>
                <button type="button" title={language === "zh" ? "垂直翻转印章" : "Flip stamp vertically"} onClick={() => transformTileStamp("flip-y")}><FlipVertical2 size={13} /></button>
                <button type="button" title={language === "zh" ? "顺时针旋转印章" : "Rotate stamp clockwise"} onClick={() => transformTileStamp("rotate-cw")}><RotateCw size={13} /></button>
                <button type="button" title={language === "zh" ? "逆时针旋转印章" : "Rotate stamp counterclockwise"} onClick={() => transformTileStamp("rotate-ccw")}><RotateCcw size={13} /></button>
              </div>
            </div>}
            <div className="tilemap-tool-actions" role="toolbar" aria-label={language === "zh" ? "图块变换" : "Tile transforms"}>
              <button type="button" className={(selectedTileFlags & tileFlipX) !== 0 ? "is-active" : ""} aria-pressed={(selectedTileFlags & tileFlipX) !== 0} disabled={effectiveSelectedTileID === 0} title={language === "zh" ? "水平翻转" : "Flip horizontally"} onClick={() => setSelectedTileFlags((value) => (value ^ tileFlipX) >>> 0)}><FlipHorizontal2 size={14} /></button>
              <button type="button" className={(selectedTileFlags & tileFlipY) !== 0 ? "is-active" : ""} aria-pressed={(selectedTileFlags & tileFlipY) !== 0} disabled={effectiveSelectedTileID === 0} title={language === "zh" ? "垂直翻转" : "Flip vertically"} onClick={() => setSelectedTileFlags((value) => (value ^ tileFlipY) >>> 0)}><FlipVertical2 size={14} /></button>
              <button type="button" className={(selectedTileFlags & tileFlipDiagonal) !== 0 ? "is-active" : ""} aria-pressed={(selectedTileFlags & tileFlipDiagonal) !== 0} disabled={effectiveSelectedTileID === 0 || activeTileset.tileWidth !== activeTileset.tileHeight} title={language === "zh" ? "对角翻转" : "Flip diagonally"} onClick={() => setSelectedTileFlags((value) => (value ^ tileFlipDiagonal) >>> 0)}><RotateCw size={14} /></button>
            </div>
          </>}
          {tilemapDrawMode === "pixels" && <label className="compact-field"><span>{language === "zh" ? "像素同步" : "Pixel sync"}</span><select value={tilePixelSyncMode} onChange={(event) => setTilePixelSyncMode(event.target.value as TilePixelSyncMode)}>
            <option value="manual">Manual</option><option value="auto">Auto</option><option value="stack">Stack</option>
          </select></label>}
          {tilemapDrawMode === "terrain" && <>
            <div className="tilemap-tool-actions" role="toolbar" aria-label={language === "zh" ? "地形工具" : "Terrain tools"}>
              <button type="button" className={terrainToolMode === "brush" ? "is-active" : ""} aria-pressed={terrainToolMode === "brush"} title={language === "zh" ? "地形笔刷" : "Terrain brush"} onClick={() => setTerrainToolMode("brush")}><Pencil size={14} /></button>
              <button type="button" className={terrainToolMode === "picker" ? "is-active" : ""} aria-pressed={terrainToolMode === "picker"} title={language === "zh" ? "拾取地形" : "Pick Terrain"} onClick={() => setTerrainToolMode("picker")}><Pipette size={14} /></button>
              <button type="button" className={terrainToolMode === "fill" ? "is-active" : ""} aria-pressed={terrainToolMode === "fill"} title={language === "zh" ? "填充地形" : "Fill Terrain"} onClick={() => setTerrainToolMode("fill")}><PaintBucket size={14} /></button>
              <button type="button" className={terrainToolMode === "line" ? "is-active" : ""} aria-pressed={terrainToolMode === "line"} title={language === "zh" ? "地形直线" : "Terrain line"} onClick={() => setTerrainToolMode("line")}><Slash size={14} /></button>
              <button type="button" className={terrainToolMode === "rectangle" ? "is-active" : ""} aria-pressed={terrainToolMode === "rectangle"} title={language === "zh" ? "地形矩形" : "Terrain rectangle"} onClick={() => setTerrainToolMode("rectangle")}><Square size={14} /></button>
              <button type="button" className={terrainToolMode === "stamp" ? "is-active" : ""} aria-pressed={terrainToolMode === "stamp"} disabled={!terrainStamp} title={language === "zh" ? "地形印章" : "Terrain stamp"} onClick={() => setTerrainToolMode("stamp")}><Copy size={14} /></button>
            </div>
            {terrainToolMode === "brush" && <div className="terrain-brush-settings">
              <label className="compact-field"><span>{language === "zh" ? "半径" : "Radius"}</span><input type="number" min="0" max="16" value={terrainBrushRadius} onChange={(event) => setTerrainBrushRadius(Math.max(0, Math.min(16, Math.round(Number(event.target.value) || 0))))} /></label>
              <label className="compact-field"><span>{language === "zh" ? "形状" : "Shape"}</span><select value={activeTileset.grid.kind === "hexagonal" ? "native" : terrainBrushShape} disabled={activeTileset.grid.kind === "hexagonal"} onChange={(event) => setTerrainBrushShape(event.target.value as "native" | "square")}>
                <option value="native">{activeTileset.grid.kind === "hexagonal" ? "Hex distance" : (language === "zh" ? "逻辑距离" : "Logical distance")}</option>
                <option value="square">{language === "zh" ? "方形" : "Square"}</option>
              </select></label>
              <label className="compact-field"><span>{language === "zh" ? "散布" : "Scatter"} {terrainScatterPercent}%</span><input type="range" min="1" max="100" value={terrainScatterPercent} onChange={(event) => setTerrainScatterPercent(Number(event.target.value))} /></label>
            </div>}
            {terrainToolMode === "rectangle" && <label className="brush-option-row is-single"><input type="checkbox" checked={terrainRectangleFilled} onChange={(event) => setTerrainRectangleFilled(event.target.checked)} />{language === "zh" ? "填充矩形" : "Filled rectangle"}</label>}
            <button type="button" className="panel-command" disabled={(!selection && !tileCellSelection) || !activeCel?.terrainmap} onClick={captureTerrainStampFromSelection}>{language === "zh" ? "从选区创建地形印章" : "Create Terrain stamp from selection"}</button>
            {terrainStamp && <div className="tile-stamp-settings">
              <span>{terrainStamp.width} × {terrainStamp.height}</span>
              <select value={terrainStampEmptyMode} onChange={(event) => setTerrainStampEmptyMode(event.target.value as "overwrite" | "skip")} aria-label={language === "zh" ? "空地形行为" : "Empty Terrain behavior"}>
                <option value="overwrite">{language === "zh" ? "覆盖空格" : "Overwrite empty"}</option>
                <option value="skip">{language === "zh" ? "跳过空格" : "Skip empty"}</option>
              </select>
              <div className="mini-actions">
                <button type="button" title={language === "zh" ? "水平翻转地形印章" : "Flip Terrain stamp horizontally"} onClick={() => transformTerrainStamp("flip-x")}><FlipHorizontal2 size={13} /></button>
                <button type="button" title={language === "zh" ? "垂直翻转地形印章" : "Flip Terrain stamp vertically"} onClick={() => transformTerrainStamp("flip-y")}><FlipVertical2 size={13} /></button>
                <button type="button" title={language === "zh" ? "顺时针旋转地形印章" : "Rotate Terrain stamp clockwise"} onClick={() => transformTerrainStamp("rotate-cw")}><RotateCw size={13} /></button>
                <button type="button" title={language === "zh" ? "逆时针旋转地形印章" : "Rotate Terrain stamp counterclockwise"} onClick={() => transformTerrainStamp("rotate-ccw")}><RotateCcw size={13} /></button>
              </div>
            </div>}
            <div className="terrain-recalculate-actions">
              <button type="button" className="panel-command" disabled={!selection || !activeCel?.terrainmap} onClick={() => recalculateTerrainScope("selection")}>{language === "zh" ? "重算选区" : "Recalculate selection"}</button>
              <button type="button" className="panel-command" disabled={!activeCel?.terrainmap} onClick={() => recalculateTerrainScope("cel")}>{language === "zh" ? "重算当前动画格" : "Recalculate Cel"}</button>
              <button type="button" className="panel-command" disabled={!activeCel?.terrainmap} onClick={() => recalculateTerrainScope("tileset")}>{language === "zh" ? "重算图块集" : "Recalculate Tileset"}</button>
            </div>
            <div className="panel-subheading"><span>{language === "zh" ? "地形" : "Terrains"}</span><div className="mini-actions">
              <button type="button" title={language === "zh" ? "添加地形" : "Add Terrain"} onClick={addTerrain}><Plus size={13} /></button>
              <button type="button" title={language === "zh" ? "重命名地形" : "Rename Terrain"} disabled={!activeTerrain} onClick={renameSelectedTerrain}><Pencil size={13} /></button>
              <button type="button" title={language === "zh" ? "复制地形" : "Duplicate Terrain"} disabled={!activeTerrain} onClick={duplicateSelectedTerrain}><Copy size={13} /></button>
              <button type="button" title={language === "zh" ? "删除所选地形" : "Delete selected Terrain"} disabled={!activeTerrain} onClick={deleteSelectedTerrain}><Trash2 size={13} /></button>
            </div></div>
            <div className="terrain-list" role="listbox" aria-label={language === "zh" ? "地形列表" : "Terrain list"}>
              {activeTileset.terrains.map((terrain) => <button
                type="button"
                role="option"
                aria-selected={terrain.id === effectiveSelectedTerrainID}
                className={terrain.id === effectiveSelectedTerrainID ? "is-selected" : ""}
                key={terrain.id}
                onClick={() => setSelectedTerrainID(terrain.id)}
              ><i style={{background: terrain.color}} /><span>{terrain.name}</span><small>{terrain.id}</small></button>)}
            </div>
            {activeTerrain && <>
              <label className="compact-field"><span>{language === "zh" ? "标识色" : "Color"}</span><input type="color" value={activeTerrain.color.slice(0, 7)} onChange={(event) => updateSelectedTerrainColor(event.target.value)} /></label>
              <label className="compact-field"><span>{language === "zh" ? "邻域" : "Neighbors"}</span><select value={activeTerrain.neighborMode} onChange={(event) => updateActiveTerrain({neighborMode: event.target.value as TerrainNeighborMode})}>
                {activeTileset.grid.kind !== "hexagonal" && <option value="edge4">4-edge</option>}
                {activeTileset.grid.kind === "orthogonal" && <option value="blob8">Blob / 47</option>}
                {activeTileset.grid.kind === "hexagonal" && <option value="edge6">6-edge</option>}
              </select></label>
              <label className="compact-field"><span>{language === "zh" ? "边界" : "Boundary"}</span><select value={activeTerrain.boundary} onChange={(event) => updateActiveTerrain({boundary: event.target.value as TerrainBoundary})}>
                <option value="empty">{language === "zh" ? "空白" : "Empty"}</option>
                <option value="same">{language === "zh" ? "相同" : "Same"}</option>
                <option value="wrap">{language === "zh" ? "循环" : "Wrap"}</option>
              </select></label>
              <div className="terrain-rule-editor">
                <TerrainMaskEditor mode={activeTerrain.neighborMode} gridKind={activeTileset.grid.kind}
                  hexOrientation={activeTileset.grid.kind === "hexagonal" ? activeTileset.grid.orientation : undefined}
                  value={terrainRuleMaskDraft} language={language} onChange={setTerrainRuleMaskDraft} />
                <label><span>Mask</span><input type="number" min="0" max={activeTerrain.neighborMode === "blob8" ? 255 : activeTerrain.neighborMode === "edge6" ? 63 : 15} value={terrainRuleMaskDraft} onChange={(event) => {
                  const maximum = activeTerrain.neighborMode === "blob8" ? 255 : activeTerrain.neighborMode === "edge6" ? 63 : 15;
                  const value = Math.max(0, Math.min(maximum, Math.round(Number(event.target.value) || 0)));
                  setTerrainRuleMaskDraft(activeTerrain.neighborMode === "blob8" ? normalizeBlobMask(value) : value);
                }} /></label>
                <label><span>{language === "zh" ? "权重" : "Weight"}</span><input type="number" min="0.001" step="0.1" value={terrainRuleWeightDraft} onChange={(event) => setTerrainRuleWeightDraft(Math.max(0.001, Number(event.target.value) || 1))} /></label>
                <button type="button" className="panel-command" disabled={effectiveSelectedTileID === 0} onClick={assignTerrainRule}>{language === "zh" ? "添加或更新变体" : "Add or update variant"}</button>
                {activeTerrainDiagnostic && <div className="terrain-rule-diagnostic">
                  <span>{language === "zh"
                    ? `覆盖 ${activeTerrainDiagnostic.coveredMasks.length}/${activeTerrainDiagnostic.coveredMasks.length + activeTerrainDiagnostic.missingMasks.length}，缺少 ${activeTerrainDiagnostic.missingMasks.length}，重复 ${activeTerrainDiagnostic.duplicateMasks.length}，无效 ${activeTerrainDiagnostic.invalidMasks.length + activeTerrainDiagnostic.invalidCandidates.length}`
                    : `${activeTerrainDiagnostic.coveredMasks.length}/${activeTerrainDiagnostic.coveredMasks.length + activeTerrainDiagnostic.missingMasks.length} covered, ${activeTerrainDiagnostic.missingMasks.length} missing, ${activeTerrainDiagnostic.duplicateMasks.length} duplicate, ${activeTerrainDiagnostic.invalidMasks.length + activeTerrainDiagnostic.invalidCandidates.length} invalid`}</span>
                  <button type="button" className="panel-command" disabled={effectiveSelectedTileID === 0 || activeTerrainDiagnostic.missingMasks.length === 0} onClick={fillMissingTerrainRules}>{language === "zh" ? "用所选图块补齐缺失规则" : "Fill missing with selected tile"}</button>
                </div>}
              </div>
              <TerrainPreviewPanel
                tileset={activeTileset}
                terrainId={activeTerrain.id}
                revision={revision}
                seed={activeCel?.terrainmap?.seed ?? 0}
                language={language}
                palette={pixelDocument.colorMode === "indexed" ? pixelDocument.palette.colors : undefined}
                transparentIndex={pixelDocument.palette.transparentIndex}
              />
              <div className="terrain-rule-list">
                {activeTerrain.rules.map((rule) => <section key={rule.mask}>
                  <header><code>{rule.mask}</code><span>{rule.candidates.length} {language === "zh" ? "个变体" : "variants"}</span><button type="button" title={language === "zh" ? "删除规则" : "Delete rule"} onClick={() => deleteTerrainRule(rule.mask)}><Trash2 size={12} /></button></header>
                  {rule.candidates.map((candidate) => <div key={`${candidate.tileId}:${candidate.flags}`}>
                    <span>{candidate.tileId} / 0x{candidate.flags.toString(16)}</span><small>×{candidate.weight}</small><button type="button" title={language === "zh" ? "删除变体" : "Delete variant"} onClick={() => deleteTerrainCandidate(rule.mask, candidate.tileId, candidate.flags)}><X size={11} /></button>
                  </div>)}
                </section>)}
              </div>
            </>}
          </>}
          <div className="panel-subheading"><span>{language === "zh" ? "图块集" : "Tileset"}</span><div className="mini-actions"><button type="button" title={language === "zh" ? "从 PNG 导入图块" : "Import tiles from PNG"} onClick={() => void importTilesetPNG()}><FileUp size={13} /></button><button type="button" title={language === "zh" ? "导出图块集 PNG 与元数据" : "Export Tileset PNG and metadata"} disabled={activeTileset.tiles.length === 0} onClick={() => void exportTilesetBundle()}><Download size={13} /></button><button type="button" title={language === "zh" ? "添加空图块" : "Add empty tile"} onClick={addEmptyTile}><Plus size={13} /></button><button type="button" title={language === "zh" ? "复制到图块剪贴板" : "Copy tiles"} disabled={effectiveSelectedTileID === 0} onClick={copySelectedTiles}><Copy size={13} /></button><button type="button" title={language === "zh" ? "粘贴为新图块" : "Paste as new tiles"} disabled={tileClipboard.length === 0} onClick={pasteTiles}><ClipboardPaste size={13} /></button><button type="button" title={language === "zh" ? "复制所选图块为新图块" : "Duplicate selected tiles"} disabled={effectiveSelectedTileID === 0} onClick={duplicateSelectedTiles}><SquaresUnite size={13} /></button><button type="button" title={language === "zh" ? "向前移动" : "Move earlier"} disabled={effectiveSelectedTileID === 0} onClick={() => reorderSelectedTiles(-1)}><ChevronLeft size={13} /></button><button type="button" title={language === "zh" ? "向后移动" : "Move later"} disabled={effectiveSelectedTileID === 0} onClick={() => reorderSelectedTiles(1)}><ChevronRight size={13} /></button><button type="button" title={language === "zh" ? "删除所选图块" : "Delete selected tiles"} disabled={effectiveSelectedTileID === 0} onClick={deleteSelectedTile}><Trash2 size={13} /></button></div></div>
          <div className="tile-filter-controls">
            <input className="tile-search-input" type="search" value={tileSearch} onChange={(event) => setTileSearch(event.target.value)} placeholder={language === "zh" ? "按 ID 搜索图块" : "Search tile ID"} aria-label={language === "zh" ? "搜索图块" : "Search tiles"} />
            <select value={tileTerrainFilter} onChange={(event) => setTileTerrainFilter(Number(event.target.value))} aria-label={language === "zh" ? "按地形筛选" : "Filter by Terrain"}>
              <option value={0}>{language === "zh" ? "全部地形" : "All Terrains"}</option>
              {activeTileset.terrains.map((terrain) => <option key={terrain.id} value={terrain.id}>{terrain.name}</option>)}
            </select>
          </div>
          <label className="compact-range tile-preview-size"><span>{language === "zh" ? "预览大小" : "Preview size"}</span><input type="range" min={24} max={96} step={4} value={tilePreviewSize} onChange={(event) => setTilePreviewSize(Number(event.target.value))} /><output>{tilePreviewSize}</output></label>
          <div className="tile-swatch-grid" role="listbox" aria-label={activeTileset.name} style={{gridTemplateColumns: `repeat(auto-fill, ${tilePreviewSize + 4}px)`}}>
            <button type="button" role="option" aria-selected={effectiveSelectedTileID === 0} className={`tile-swatch is-empty${effectiveSelectedTileID === 0 ? " is-selected" : ""}`} style={{width: tilePreviewSize, height: tilePreviewSize}} title={language === "zh" ? "空图块" : "Empty tile"} onClick={() => { setSelectedTileID(0); setSelectedTileIDs([]); }}><X size={14} /></button>
            {activeTileset.tiles.filter((tile) => (tileSearch.trim() === "" || String(tile.id).includes(tileSearch.trim()))
              && (tileTerrainFilter === 0 || tileUsage.get(tile.id)?.terrainIDs.includes(tileTerrainFilter))).map((tile) => {
              const selected = effectiveSelectedTileIDs.includes(tile.id) || (effectiveSelectedTileIDs.length === 0 && effectiveSelectedTileID === tile.id);
              const usage = tileUsage.get(tile.id) ?? {cells: 0, rules: 0, terrainIDs: []};
              const terrainNames = usage.terrainIDs.map((id) => activeTileset.terrains.find((terrain) => terrain.id === id)?.name ?? id).join(", ");
              return <button type="button" role="option" data-tile-id={tile.id} aria-selected={selected} className={`tile-swatch${selected ? " is-selected" : ""}`} style={{width: tilePreviewSize, height: tilePreviewSize}} title={`${language === "zh" ? "图块" : "Tile"} ${tile.id} · ${language === "zh" ? "单元格" : "cells"} ${usage.cells} · ${language === "zh" ? "规则" : "rules"} ${usage.rules}${terrainNames ? ` · ${terrainNames}` : ""}`} key={tile.id} onPointerDown={(event) => {
                if (event.button !== 0) return;
                tilesetSelectionDragRef.current = {start: event.currentTarget, moved: false};
              }} onPointerEnter={(event) => {
                const drag = tilesetSelectionDragRef.current;
                if (!drag || (event.buttons & 1) === 0) return;
                drag.moved = true;
                updateTilesetBoxSelection(drag.start, event.currentTarget);
              }} onPointerUp={() => {
                const drag = tilesetSelectionDragRef.current;
                if (drag?.moved) tilesetSelectionSuppressClickRef.current = true;
                tilesetSelectionDragRef.current = null;
              }} onClick={(event) => {
                if (tilesetSelectionSuppressClickRef.current) {
                  tilesetSelectionSuppressClickRef.current = false;
                  return;
                }
                setSelectedTileID(tile.id);
                setSelectedTileIDs((current) => {
                  if (event.shiftKey && tileSelectionAnchorID !== null) {
                    const start = activeTileset.tiles.findIndex((candidate) => candidate.id === tileSelectionAnchorID);
                    const end = activeTileset.tiles.findIndex((candidate) => candidate.id === tile.id);
                    if (start >= 0 && end >= 0) return activeTileset.tiles.slice(Math.min(start, end), Math.max(start, end) + 1).map((candidate) => candidate.id);
                  }
                  return event.ctrlKey || event.metaKey
                    ? current.includes(tile.id) ? current.filter((id) => id !== tile.id) : [...current, tile.id]
                    : [tile.id];
                });
                if (!event.shiftKey) setTileSelectionAnchorID(tile.id);
              }} onContextMenu={(event) => { setSelectedTileID(tile.id); setSelectedTileIDs([tile.id]); setTileSelectionAnchorID(tile.id); openContextMenu(event, {kind: "tile", tileId: tile.id}); }} onKeyDown={(event) => { openKeyboardContextMenu(event, {kind: "tile", tileId: tile.id}); }}><LayerThumbnail pixels={tile.pixels} width={activeTileset.tileWidth} height={activeTileset.tileHeight} revision={revision} visible ariaLabel={`${language === "zh" ? "图块" : "Tile"} ${tile.id}`} size={Math.max(20, tilePreviewSize - 4)} /><span className="tile-swatch-meta">{tile.id} · {usage.cells}</span></button>;
            })}
          </div>
        </section>}

        {selectedTool === "move" && <section className="panel-section tool-settings-section move-tool-section">
          <h2>{ui.toolsByID.move}</h2>
          <label className="brush-option-row is-single"><input type="checkbox" checked={moveAutoSelect} onChange={(event) => setMoveAutoSelect(event.target.checked)} />{language === "zh" ? "自动选择图层" : "Auto select layer"}</label>
        </section>}

        {selectedTool === "text" && <section className="panel-section text-tool-section tool-settings-section">
          <h2>{language === "zh" ? "文字工具" : "Text Tool"}</h2>
          <label className="compact-field"><span>{language === "zh" ? "内容" : "Content"}</span><input type="text" value={textValue} onChange={(event) => setTextValue(event.target.value)} /></label>
          <label className="compact-field"><span>{language === "zh" ? "字体" : "Font"}</span><select value={textFontFamily} onChange={(event) => setTextFontFamily(event.target.value)}>{builtInTextFontFamilies.map((family) => <option key={family} value={family}>{family}</option>)}{loadedTextFonts.map((font) => <option key={font.family} value={font.family}>{font.family}</option>)}</select></label>
          <button type="button" className="panel-command text-font-import" onClick={() => void importTextFont()}><FileUp size={13} /><span>{language === "zh" ? "加载字体文件" : "Load font file"}</span></button>
          <div className="text-tool-grid">
            <label className="compact-field"><span>{language === "zh" ? "字号" : "Size"}</span><input type="number" min="1" max="512" value={textFontSize} onChange={(event) => setTextFontSize(Math.max(1, Math.min(512, Math.round(Number(event.target.value) || 1))))} /></label>
            <label className="compact-field"><span>{language === "zh" ? "行高" : "Line height"}</span><input type="number" min="0.5" max="4" step="0.1" value={textLineHeight} onChange={(event) => setTextLineHeight(Math.max(0.5, Math.min(4, Number(event.target.value) || 1.2)))} /></label>
          </div>
          <label className="compact-field"><span>{language === "zh" ? "对齐" : "Align"}</span><select value={textAlign} onChange={(event) => setTextAlign(event.target.value as TextAlign)}><option value="left">{language === "zh" ? "左" : "Left"}</option><option value="center">{language === "zh" ? "中" : "Center"}</option><option value="right">{language === "zh" ? "右" : "Right"}</option></select></label>
          <label className="compact-field"><span>{language === "zh" ? "像素提示" : "Hinting"}</span><select value={textHinting} onChange={(event) => setTextHinting(event.target.value as TextHinting)}><option value="none">{language === "zh" ? "无" : "None"}</option><option value="slight">{language === "zh" ? "轻微" : "Slight"}</option><option value="full">{language === "zh" ? "完整" : "Full"}</option></select></label>
          <div className="brush-option-row"><label><input type="checkbox" checked={textBold} onChange={(event) => setTextBold(event.target.checked)} />{language === "zh" ? "粗体" : "Bold"}</label><label><input type="checkbox" checked={textItalic} onChange={(event) => setTextItalic(event.target.checked)} />{language === "zh" ? "斜体" : "Italic"}</label></div>
          <div className="brush-option-row"><label><input type="checkbox" checked={textAntialias} onChange={(event) => setTextAntialias(event.target.checked)} />{language === "zh" ? "抗锯齿" : "Antialias"}</label><label><input type="checkbox" checked={textLigatures} onChange={(event) => setTextLigatures(event.target.checked)} />{language === "zh" ? "连字" : "Ligatures"}</label></div>
          <div className="brush-option-row is-single"><label><input type="checkbox" checked={textStroke} onChange={(event) => setTextStroke(event.target.checked)} />{language === "zh" ? "描边" : "Stroke"}</label></div>
          {textStroke && <label className="compact-field"><span>{language === "zh" ? "描边宽度" : "Stroke width"}</span><input type="number" min="1" max="64" value={textStrokeWidth} onChange={(event) => setTextStrokeWidth(Math.max(1, Math.min(64, Math.round(Number(event.target.value) || 1))))} /></label>}
          <div className="text-color-roles"><span><i style={colorChipBackground(foregroundColor, foregroundAlpha)} />{language === "zh" ? "前景色填充" : "Foreground fill"}</span><span><i style={colorChipBackground(backgroundColor, backgroundAlpha)} />{language === "zh" ? "背景色描边" : "Background stroke"}</span></div>
        </section>}

        {selectedTool === "slice" && <section className="panel-section slice-tool-section tool-settings-section">
          <h2>{ui.toolsByID.slice}</h2>
          {selection && <button type="button" className="panel-command" onClick={createSliceFromSelection}>{language === "zh" ? "从选区创建切片" : "Create slice from selection"}</button>}
          {pixelDocument.slices.length > 0 && <>
            <div className="slice-list" role="listbox" aria-label={language === "zh" ? "切片选择" : "Slice selection"}>
              {pixelDocument.slices.map((slice) => <label className="slice-list-item" key={slice.id} onContextMenu={(event) => {
                setActiveSliceId(slice.id);
                if (!selectedSliceIds.includes(slice.id)) setSelectedSliceIds([slice.id]);
                openContextMenu(event, {kind: "slice", sliceId: slice.id});
              }}>
                <input type="checkbox" checked={selectedSliceIds.includes(slice.id)} onChange={() => setSelectedSliceIds((current) => current.includes(slice.id) ? current.filter((id) => id !== slice.id) : [...current, slice.id])} />
                <button type="button" className={slice.id === activeSlice?.id ? "slice-list-name is-active" : "slice-list-name"} onClick={() => setActiveSliceId(slice.id)} onDoubleClick={() => openSliceProperties(slice.id)} onKeyDown={(event) => { openKeyboardContextMenu(event, {kind: "slice", sliceId: slice.id}); }}>{slice.name}</button>
              </label>)}
            </div>
            <div className="slice-tool-actions">
              <button type="button" className="panel-command" disabled={!activeSlice} onClick={() => activeSlice && openSliceProperties(activeSlice.id)}>{language === "zh" ? "切片属性" : "Slice properties"}</button>
              <span className="panel-hint">{language === "zh" ? `${sliceBatchIDs.length} 个切片` : `${sliceBatchIDs.length} slice(s)`}</span>
            </div>
            <div className="panel-subheading"><span>{language === "zh" ? "批量变换" : "Batch transform"}</span></div>
            <div className="cel-transform-fields"><label><span>ΔX</span><input type="number" step="1" value={sliceMoveX} onChange={(event) => setSliceMoveX(Number(event.target.value) || 0)} /></label><label><span>ΔY</span><input type="number" step="1" value={sliceMoveY} onChange={(event) => setSliceMoveY(Number(event.target.value) || 0)} /></label></div>
            <div className="slice-tool-actions"><button type="button" className="panel-command" disabled={sliceBatchIDs.length === 0} onClick={moveSelectedSlices}>{language === "zh" ? "移动所选切片" : "Move selected slices"}</button></div>
            <div className="cel-transform-fields"><label><span>{language === "zh" ? "宽度 %" : "Width %"}</span><input type="number" min="1" step="1" value={sliceScaleX} onChange={(event) => setSliceScaleX(Math.max(1, Number(event.target.value) || 1))} /></label><label><span>{language === "zh" ? "高度 %" : "Height %"}</span><input type="number" min="1" step="1" value={sliceScaleY} onChange={(event) => setSliceScaleY(Math.max(1, Number(event.target.value) || 1))} /></label></div>
            <div className="slice-tool-actions"><button type="button" className="panel-command" disabled={sliceBatchIDs.length === 0} onClick={scaleSelectedSlices}>{language === "zh" ? "缩放所选切片" : "Scale selected slices"}</button><button type="button" className="panel-command is-danger" disabled={sliceBatchIDs.length === 0} onClick={deleteSelectedSlices}>{language === "zh" ? "删除所选切片" : "Delete selected slices"}</button></div>
            <label className="compact-field"><span>{language === "zh" ? "切片" : "Slice"}</span><select value={activeSlice?.id ?? ""} onChange={(event) => setActiveSliceId(event.target.value)}>{pixelDocument.slices.map((slice) => <option key={slice.id} value={slice.id}>{slice.name}</option>)}</select></label>
            {activeSlice && <>
              <label className="compact-field"><span>{language === "zh" ? "名称" : "Name"}</span><input type="text" value={activeSlice.name} onChange={(event) => mutateDocument("Rename Slice", () => updateSlice(pixelDocument, activeSlice.id, {name: event.target.value}))} /></label>
              <label className="compact-field"><span>{language === "zh" ? "颜色" : "Color"}</span><input type="color" value={/^#[0-9a-f]{8}$/i.test(activeSlice.color) ? activeSlice.color.slice(0, 7) : "#ef476f"} onChange={(event) => mutateDocument("Edit Slice Color", () => updateSlice(pixelDocument, activeSlice.id, {color: `${event.target.value}${activeSlice.color.slice(7, 9) || "ff"}`}))} /></label>
              {!activeSliceKey && <div className="slice-tool-actions"><span className="panel-hint">{language === "zh" ? "当前帧没有切片关键帧" : "No slice key on the current frame"}</span><button className="panel-command" type="button" onClick={addCurrentSliceKey}>{language === "zh" ? "新建当前帧关键帧" : "Add key on current frame"}</button></div>}
              {activeSliceKey && <>
                <div className="cel-transform-fields"><label><span>X</span><input type="number" value={activeSliceKey.x} onChange={(event) => editCurrentSliceGeometry({x: Math.max(0, Math.round(Number(event.target.value) || 0))})} /></label><label><span>Y</span><input type="number" value={activeSliceKey.y} onChange={(event) => editCurrentSliceGeometry({y: Math.max(0, Math.round(Number(event.target.value) || 0))})} /></label></div>
                <div className="cel-transform-fields"><label><span>{ui.width}</span><input type="number" min="1" value={activeSliceKey.width} onChange={(event) => editCurrentSliceGeometry({width: Math.max(1, Math.round(Number(event.target.value) || 1))})} /></label><label><span>{ui.height}</span><input type="number" min="1" value={activeSliceKey.height} onChange={(event) => editCurrentSliceGeometry({height: Math.max(1, Math.round(Number(event.target.value) || 1))})} /></label></div>
                <div className="cel-transform-fields"><label><span>{language === "zh" ? "枢轴 X" : "Pivot X"}</span><input type="number" value={activeSliceKey.pivot?.x ?? 0} onChange={(event) => editCurrentSliceKey({pivot: {...(activeSliceKey.pivot ?? {x: 0, y: 0}), x: Math.round(Number(event.target.value) || 0)}}, "Edit Slice Pivot")} /></label><label><span>{language === "zh" ? "枢轴 Y" : "Pivot Y"}</span><input type="number" value={activeSliceKey.pivot?.y ?? 0} onChange={(event) => editCurrentSliceKey({pivot: {...(activeSliceKey.pivot ?? {x: 0, y: 0}), y: Math.round(Number(event.target.value) || 0)}}, "Edit Slice Pivot")} /></label></div>
                <div className="slice-tool-actions"><button className="panel-command" type="button" onClick={() => editCurrentSliceKey({center: activeSliceKey.center ? undefined : {x: Math.floor(activeSliceKey.width / 4), y: Math.floor(activeSliceKey.height / 4), width: Math.max(1, Math.floor(activeSliceKey.width / 2)), height: Math.max(1, Math.floor(activeSliceKey.height / 2))}}, "Toggle Nine-patch")}>{activeSliceKey.center ? (language === "zh" ? "移除九宫格中心" : "Remove nine-patch center") : (language === "zh" ? "添加九宫格中心" : "Add nine-patch center")}</button><button className="panel-command is-danger" type="button" onClick={deleteCurrentSliceKey} disabled={activeSlice.keys.length <= 1} title={activeSlice.keys.length <= 1 ? (language === "zh" ? "切片至少需要一个关键帧" : "A slice must keep one key") : undefined}>{language === "zh" ? "删除当前帧关键帧" : "Delete current-frame key"}</button></div>
                {activeSliceKey.center && <>
                  <div className="panel-subheading"><span>{language === "zh" ? "九宫格中心" : "Nine-patch center"}</span></div>
                  <div className="cel-transform-fields"><label><span>X</span><input type="number" value={activeSliceKey.center.x} onChange={(event) => editCurrentSliceKey({center: {...activeSliceKey.center!, x: Math.max(0, Math.round(Number(event.target.value) || 0))}}, "Edit Nine-patch")} /></label><label><span>Y</span><input type="number" value={activeSliceKey.center.y} onChange={(event) => editCurrentSliceKey({center: {...activeSliceKey.center!, y: Math.max(0, Math.round(Number(event.target.value) || 0))}}, "Edit Nine-patch")} /></label></div>
                  <div className="cel-transform-fields"><label><span>{ui.width}</span><input type="number" min="1" value={activeSliceKey.center.width} onChange={(event) => editCurrentSliceKey({center: {...activeSliceKey.center!, width: Math.max(1, Math.round(Number(event.target.value) || 1))}}, "Edit Nine-patch")} /></label><label><span>{ui.height}</span><input type="number" min="1" value={activeSliceKey.center.height} onChange={(event) => editCurrentSliceKey({center: {...activeSliceKey.center!, height: Math.max(1, Math.round(Number(event.target.value) || 1))}}, "Edit Nine-patch")} /></label></div>
                </>}
              </>}
              <div className="slice-tool-actions"><button className="panel-command is-danger" type="button" onClick={() => mutateDocument("Delete Slice", () => deleteSlice(pixelDocument, activeSlice.id))}>{language === "zh" ? "删除切片" : "Delete slice"}</button></div>
            </>}
          </>}
        </section>}

        {brushSizeTools.has(selectedTool) && <section className="panel-section brush-section tool-settings-section">
          <h2>{ui.toolsByID[selectedTool]}</h2>
          <BrushPresetPanel settings={currentBrushSettings} onApply={applyBrushPreset} zh={language === "zh"} />
          <label className="compact-range">
            <span>{ui.brushSize}</span>
            <input type="range" min={MIN_BRUSH_SIZE} max={MAX_BRUSH_SIZE} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
            <input className="compact-number" type="number" min={MIN_BRUSH_SIZE} max={MAX_BRUSH_SIZE} value={brushSize} aria-label={ui.brushSize} onChange={(event) => setBrushSize(Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(Number(event.target.value) || 1))))} />
          </label>
          <label className="compact-field"><span>{language === "zh" ? "墨水" : "Ink"}</span><select value={inkMode} onChange={(event) => setInkMode(event.target.value as InkMode)}>
            <option value="simple">{language === "zh" ? "简单" : "Simple"}</option>
            <option value="alpha-composite">{language === "zh" ? "透明度合成" : "Alpha composite"}</option>
            <option value="copy-alpha">{language === "zh" ? "复制透明度" : "Copy alpha"}</option>
            <option value="lock-alpha">{language === "zh" ? "锁定透明度" : "Lock alpha"}</option>
          </select></label>
          <label className="compact-range"><span>{language === "zh" ? "角度" : "Angle"}</span><input type="range" min="0" max="359" value={brushAngle} onChange={(event) => setBrushAngle(Number(event.target.value))} /><input className="compact-number" type="number" min="0" max="359" value={brushAngle} onChange={(event) => setBrushAngle(Math.max(0, Math.min(359, Math.round(Number(event.target.value) || 0))))} /></label>
          {brushShapeTools.has(selectedTool) && <div className="brush-shape-grid" role="group" aria-label={ui.brushShape}>
            <button className={brushPreset === "square" ? "is-active" : ""} type="button" aria-pressed={brushPreset === "square"} title={ui.squareBrush} onClick={() => { setBrushShape("square"); setBitmapBrush(null); setPatternBrush(null); setBrushPreset("square"); }}><Square size={14} /><span>{ui.squareBrush}</span></button>
            <button className={brushPreset === "circle" ? "is-active" : ""} type="button" aria-pressed={brushPreset === "circle"} title={ui.circleBrush} onClick={() => { setBrushShape("circle"); setBitmapBrush(null); setPatternBrush(null); setBrushPreset("circle"); }}><Circle size={14} /><span>{ui.circleBrush}</span></button>
            <button className={brushPreset === "cross" ? "is-active" : ""} type="button" aria-pressed={brushPreset === "cross"} title={ui.crossBrush} onClick={() => { setBrushShape("cross"); setBitmapBrush(null); setPatternBrush(null); setBrushPreset("cross"); }}><Plus size={14} /><span>{ui.crossBrush}</span></button>
            <button className={brushPreset === "diamond" ? "is-active" : ""} type="button" aria-pressed={brushPreset === "diamond"} title={ui.diamondBrush} onClick={() => { setBrushShape("diamond"); setBitmapBrush(null); setPatternBrush(null); setBrushPreset("diamond"); }}><Diamond size={14} /><span>{ui.diamondBrush}</span></button>
          </div>}
          {freehandBrushTools.has(selectedTool) && <>
            <button type="button" className={`brush-custom-button${brushPreset === "custom" ? " is-active" : ""}`} disabled={!selection || selection.width > MAX_BRUSH_SIZE || selection.height > MAX_BRUSH_SIZE} onClick={createBrushFromSelection}><BoxSelect size={14} /><span>{ui.brushFromSelection}</span></button>
            <button className="panel-command" type="button" disabled={!selection || !activeCel || selection.width > MAX_BRUSH_SIZE || selection.height > MAX_BRUSH_SIZE} onClick={createPatternFromSelection}>{language === "zh" ? "从选区创建图案" : "Create pattern from selection"}</button>
            <label className="compact-range brush-spacing"><span>{ui.brushSpacing}</span><input type="range" min="1" max="32" value={brushSpacing} onChange={(event) => setBrushSpacing(Number(event.target.value))} /><input className="compact-number" type="number" min="1" max="32" value={brushSpacing} aria-label={ui.brushSpacing} onChange={(event) => setBrushSpacing(Math.max(1, Math.min(32, Math.round(Number(event.target.value) || 1))))} /></label>
            <div className="panel-subheading"><span>{language === "zh" ? "笔刷动态" : "Brush Dynamics"}</span><label><input type="checkbox" checked={brushDynamicsEnabled} onChange={(event) => setBrushDynamicsEnabled(event.target.checked)} /></label></div>
            {brushDynamicsEnabled && <BrushDynamicsPanel options={brushDynamics} onChange={setBrushDynamics} zh={language === "zh"} />}
            <label className="compact-range"><span>{language === "zh" ? "稳定器" : "Stabilizer"}</span><input type="range" min="0" max="32" value={brushStabilizer} onChange={(event) => setBrushStabilizer(Number(event.target.value))} /><input className="compact-number" type="number" min="0" max="32" value={brushStabilizer} onChange={(event) => setBrushStabilizer(Math.max(0, Math.min(32, Math.round(Number(event.target.value) || 0))))} /></label>
          </>}
          <div className={`brush-option-row${freehandBrushTools.has(selectedTool) ? "" : " is-single"}`}>
            {freehandBrushTools.has(selectedTool) && <label><input type="checkbox" checked={pixelPerfect} onChange={(event) => setPixelPerfect(event.target.checked)} />{ui.pixelPerfect}</label>}
            <label><input type="checkbox" checked={pressureEnabled} onChange={(event) => setPressureEnabled(event.target.checked)} />{ui.pressure}</label>
          </div>
          {selectedTool === "polygon" && <label className="compact-range polygon-sides"><span>{ui.polygonSides}</span><input type="range" min="3" max="12" value={polygonSides} onChange={(event) => setPolygonSides(Number(event.target.value))} /><output>{polygonSides}</output></label>}
          {(selectedTool === "rectangle" || selectedTool === "ellipse" || selectedTool === "polygon") && <label className="compact-field"><span>{language === "zh" ? "绘制模式" : "Draw mode"}</span><select value={shapeFillMode} onChange={(event) => setShapeFillMode(event.target.value as ShapeFillMode)}><option value="outline">{language === "zh" ? "轮廓" : "Outline"}</option><option value="filled">{language === "zh" ? "填充" : "Filled"}</option><option value="both">{language === "zh" ? "轮廓 + 填充" : "Outline + fill"}</option></select></label>}
          {selectedTool === "blur" && <label className="compact-range"><span>{language === "zh" ? "半径" : "Radius"}</span><input type="range" min="1" max="32" value={blurRadius} onChange={(event) => setBlurRadius(Number(event.target.value))} /><output>{blurRadius}</output></label>}
          {selectedTool === "jumble" && <label className="compact-range"><span>{language === "zh" ? "范围" : "Amount"}</span><input type="range" min="1" max="32" value={jumbleAmount} onChange={(event) => setJumbleAmount(Number(event.target.value))} /><output>{jumbleAmount}</output></label>}
          {patternBrush && patternBrushTools.has(selectedTool) && <div className="brush-pattern-fields">
            <label className="compact-field"><span>{language === "zh" ? "图案对齐" : "Pattern"}</span><select value={patternAlignment} onChange={(event) => setPatternAlignment(event.target.value as PatternAlignment)}>
              <option value="source">{language === "zh" ? "逐笔印" : "Each stamp"}</option>
              <option value="canvas">{language === "zh" ? "画布" : "Canvas"}</option>
              <option value="destination">{language === "zh" ? "笔画起点" : "Stroke start"}</option>
            </select></label>
            <div className="brush-pattern-origin">
              <label className="dialog-field"><span>{language === "zh" ? "原点 X" : "Origin X"}</span><input type="number" min="-4096" max="4096" value={patternOrigin.x} onChange={(event) => setPatternOrigin({...patternOrigin, x: Math.max(-4096, Math.min(4096, Math.round(Number(event.target.value) || 0)))})} /></label>
              <label className="dialog-field"><span>{language === "zh" ? "原点 Y" : "Origin Y"}</span><input type="number" min="-4096" max="4096" value={patternOrigin.y} onChange={(event) => setPatternOrigin({...patternOrigin, y: Math.max(-4096, Math.min(4096, Math.round(Number(event.target.value) || 0)))})} /></label>
            </div>
            <button className="panel-command" type="button" onClick={() => setPatternBrush(null)}>{language === "zh" ? "改用前景色" : "Use foreground color"}</button>
          </div>}
        </section>}

        {selectedTool === "gradient" && <section className="panel-section tool-settings-section">
          <h2>{ui.toolsByID.gradient}</h2>
          <label className="compact-field"><span>{language === "zh" ? "类型" : "Type"}</span><select value={gradientType} onChange={(event) => setGradientType(event.target.value as GradientType)}><option value="linear">{language === "zh" ? "线性" : "Linear"}</option><option value="radial">{language === "zh" ? "径向" : "Radial"}</option><option value="angular">{language === "zh" ? "角度" : "Angular"}</option><option value="reflected">{language === "zh" ? "反射" : "Reflected"}</option><option value="diamond">{language === "zh" ? "菱形" : "Diamond"}</option></select></label>
          <label className="compact-field"><span>{language === "zh" ? "抖动" : "Dither"}</span><select value={gradientDither} onChange={(event) => setGradientDither(event.target.value as GradientDither)}><option value="none">{language === "zh" ? "无" : "None"}</option><option value="ordered">{language === "zh" ? "有序" : "Ordered"}</option></select></label>
        </section>}

        {selectedTool === "selection" && <section className="panel-section selection-tools">
          <h2>{ui.selection}</h2>
          <label className="compact-field"><span>{ui.selectionShape}</span><select value={selectionMode} onChange={(event) => setSelectionMode(event.target.value as SelectionMode)}>
            <option value="rectangle">{ui.rectangularSelection}</option>
            <option value="ellipse">{ui.ellipticalSelection}</option>
            <option value="lasso">{ui.lassoSelection}</option>
            <option value="polygon">{ui.polygonSelection}</option>
            <option value="magic-wand">{ui.magicWand}</option>
          </select></label>
          <label className="compact-field"><span>{ui.mode}</span><select value={selectionOperation} onChange={(event) => setSelectionOperation(event.target.value as SelectionOperation)}>
            <option value="replace">{ui.selectionReplace}</option>
            <option value="add">{ui.selectionAdd}</option>
            <option value="subtract">{ui.selectionSubtract}</option>
            <option value="intersect">{ui.selectionIntersect}</option>
          </select></label>
          {(selectionMode === "ellipse" || selectionMode === "lasso" || selectionMode === "polygon") && <label className="brush-option-row is-single"><input type="checkbox" checked={selectionAntialias} onChange={(event) => setSelectionAntialias(event.target.checked)} />{language === "zh" ? "抗锯齿边缘" : "Antialiased edge"}</label>}
          {(selectionMode === "magic-wand") && <label className="compact-range selection-tolerance"><span>{ui.tolerance}</span><input type="range" min="0" max="255" value={selectionTolerance} onChange={(event) => setSelectionTolerance(Number(event.target.value))} /><output>{selectionTolerance}</output></label>}
          <div className="selection-content-actions"><button type="button" onClick={selectOpaqueContent}>{ui.selectOpaque}</button><button type="button" onClick={selectForegroundColor}>{ui.selectColor}</button><button type="button" disabled={Boolean(selection) || !activeTab.lastSelection} onClick={() => setSelection(activeTab.lastSelection ? cloneSelection(activeTab.lastSelection) : null)}>{ui.reselect}</button></div>
          <button type="button" className={`brush-custom-button${brushPreset === "custom" ? " is-active" : ""}`} disabled={!selection || selection.width > MAX_BRUSH_SIZE || selection.height > MAX_BRUSH_SIZE} onClick={createBrushFromSelection}><BoxSelect size={14} /><span>{ui.brushFromSelection}</span></button>
          <button className="panel-command" type="button" disabled={!selection || !activeCel || selection.width > MAX_BRUSH_SIZE || selection.height > MAX_BRUSH_SIZE} onClick={createPatternFromSelection}>{language === "zh" ? "从选区创建图案" : "Create pattern from selection"}</button>
          {selection && <>
            <div className="selection-scale-row">
              <input type="number" min="1" max="2048" value={selectionWidthDraft} aria-label={ui.width} onChange={(event) => setSelectionWidthDraft(Number(event.target.value))} />
              <span>×</span>
              <input type="number" min="1" max="2048" value={selectionHeightDraft} aria-label={ui.height} onChange={(event) => setSelectionHeightDraft(Number(event.target.value))} />
              <button type="button" title={ui.scaleSelection} aria-label={ui.scaleSelection} disabled={!canEditPixels} onClick={() => transformCurrentSelection("scale")}><Scaling size={15} /></button>
            </div>
            <div className="transform-actions" aria-label={ui.transform}>
              <button type="button" title={ui.rotateCounterclockwise} aria-label={ui.rotateCounterclockwise} disabled={!canEditPixels} onClick={() => transformCurrentSelection("counterclockwise")}><RotateCcw size={15} /></button>
              <button type="button" title={ui.rotateClockwise} aria-label={ui.rotateClockwise} disabled={!canEditPixels} onClick={() => transformCurrentSelection("clockwise")}><RotateCw size={15} /></button>
              <button type="button" title={ui.flipHorizontal} aria-label={ui.flipHorizontal} disabled={!canEditPixels} onClick={() => transformCurrentSelection("horizontal")}><FlipHorizontal2 size={15} /></button>
              <button type="button" title={ui.flipVertical} aria-label={ui.flipVertical} disabled={!canEditPixels} onClick={() => transformCurrentSelection("vertical")}><FlipVertical2 size={15} /></button>
            </div>
            <label className="compact-range selection-adjust"><span>{ui.amount}</span><input type="range" min="1" max="32" value={selectionAdjustAmount} onChange={(event) => setSelectionAdjustAmount(Number(event.target.value))} /><output>{selectionAdjustAmount}</output></label>
            <div className="selection-adjust-actions"><button type="button" onClick={() => adjustSelection("invert")}>{ui.invertSelection}</button><button type="button" onClick={() => adjustSelection("grow")}>{ui.growSelection}</button><button type="button" onClick={() => adjustSelection("shrink")}>{ui.shrinkSelection}</button><button type="button" onClick={() => adjustSelection("border")}>{ui.borderSelection}</button></div>
            <label className="compact-range selection-adjust"><span>{language === "zh" ? "羽化" : "Feather"}</span><input type="range" min="1" max="32" value={selectionFeatherAmount} onChange={(event) => setSelectionFeatherAmount(Number(event.target.value))} /><output>{selectionFeatherAmount}</output></label>
            <button type="button" className="panel-command" onClick={() => setSelection(featherSelection(selection, selectionFeatherAmount, pixelDocument.width, pixelDocument.height))}>{language === "zh" ? "应用羽化" : "Apply feather"}</button>
            <button type="button" className="panel-command" onClick={createSliceFromSelection}>{language === "zh" ? "从选区创建切片" : "Create slice from selection"}</button>
          </>}
        </section>}

        {selectedTool === "transform" && <section className="panel-section selection-tools">
          <h2>{ui.transform}</h2>
          <label className="compact-field"><span>{ui.transformModeLabel}</span><select value={transformMode} onChange={(event) => setTransformMode(event.target.value as TransformMode)}>
            <option value="scale">{ui.transformScale}</option>
            <option value="perspective">{ui.transformPerspective}</option>
            <option value="distort">{ui.transformDistort}</option>
          </select></label>
          {selection && <>
            <div className="cel-transform-fields numeric-transform-fields">
              <label><span>X</span><input type="number" min="0" max={pixelDocument.width - selection.width} value={selectionXDraft} onChange={(event) => setSelectionXDraft(Number(event.target.value) || 0)} /></label>
              <label><span>Y</span><input type="number" min="0" max={pixelDocument.height - selection.height} value={selectionYDraft} onChange={(event) => setSelectionYDraft(Number(event.target.value) || 0)} /></label>
              <label><span>{ui.width}</span><input type="number" min="1" max="2048" value={selectionWidthDraft} onChange={(event) => setSelectionWidthDraft(Number(event.target.value) || 1)} /></label>
              <label><span>{ui.height}</span><input type="number" min="1" max="2048" value={selectionHeightDraft} onChange={(event) => setSelectionHeightDraft(Number(event.target.value) || 1)} /></label>
              <label><span>{language === "zh" ? "中心 X" : "Pivot X"}</span><input type="number" step="0.5" min="0" max={pixelDocument.width} value={activeTab.transformPivot?.x ?? selection.x + selection.width / 2} onChange={(event) => updateTransformPivot({x: Number(event.target.value) || 0, y: activeTab.transformPivot?.y ?? selection.y + selection.height / 2})} /></label>
              <label><span>{language === "zh" ? "中心 Y" : "Pivot Y"}</span><input type="number" step="0.5" min="0" max={pixelDocument.height} value={activeTab.transformPivot?.y ?? selection.y + selection.height / 2} onChange={(event) => updateTransformPivot({x: activeTab.transformPivot?.x ?? selection.x + selection.width / 2, y: Number(event.target.value) || 0})} /></label>
            </div>
            <div className="numeric-transform-actions"><button type="button" className="panel-command" disabled={!canEditPixels || (selectionXDraft === selection.x && selectionYDraft === selection.y)} onClick={moveCurrentSelectionNumerically}>{language === "zh" ? "应用位置" : "Apply position"}</button><button type="button" className="panel-command" disabled={!canEditPixels || (selectionWidthDraft === selection.width && selectionHeightDraft === selection.height)} onClick={() => transformCurrentSelection("scale")}>{ui.scaleSelection}</button></div>
            <div className="arbitrary-rotation-row"><label><span>{ui.arbitraryRotation}</span><input type="number" min="-359.9" max="359.9" step="0.1" value={selectionRotationDraft} onChange={(event) => setSelectionRotationDraft(Number(event.target.value) || 0)} /></label><button type="button" disabled={!canEditPixels || selectionRotationDraft === 0} onClick={rotateCurrentSelectionArbitrary}>{ui.applyRotation}</button></div>
          </>}
        </section>}

        {activeTab.commandScope === "cels" && selectedCels.length > 0 && <section className="panel-section cel-transform-panel">
          <h2>{ui.celTransform}</h2>
          <div className="cel-transform-fields">
            <label><span>{ui.angle}</span><input type="number" min="-359.9" max="359.9" step="0.1" value={celRotationDraft} onChange={(event) => setCelRotationDraft(Number(event.target.value) || 0)} /></label>
            <label><span>{ui.offsetX}</span><input type="number" min="-4096" max="4096" value={celOffsetXDraft} onChange={(event) => setCelOffsetXDraft(Number(event.target.value) || 0)} /></label>
            <label><span>{ui.offsetY}</span><input type="number" min="-4096" max="4096" value={celOffsetYDraft} onChange={(event) => setCelOffsetYDraft(Number(event.target.value) || 0)} /></label>
          </div>
          <button className="panel-command" type="button" disabled={isPlaying || !transformTargetCelsEditable || (celRotationDraft === 0 && celOffsetXDraft === 0 && celOffsetYDraft === 0)} onClick={applySelectedCelTransform}>{ui.applyCelTransform}</button>
          <button className="panel-command" type="button" disabled={isPlaying || !transformTargetCelsEditable || transformTargetCels.every(({layerId, frameId}) => { const cel = getCel(pixelDocument, layerId, frameId); return Boolean(cel && cel.x === 0 && cel.y === 0 && cel.width === pixelDocument.width && cel.height === pixelDocument.height); })} onClick={rasterizeSelectedCels}>{ui.rasterizeCels}</button>
        </section>}

        <section className="panel-section canvas-aids-panel">
          <h2>{language === "zh" ? "画布辅助" : "Canvas aids"}</h2>
          <div className="brush-option-row">
            <label><input type="checkbox" checked={showPixelGrid} onChange={(event) => setShowPixelGrid(event.target.checked)} />{language === "zh" ? "像素网格" : "Pixel grid"}</label>
            <label><input type="checkbox" checked={pixelDocument.settings.snapToGrid} onChange={(event) => mutateDocument("Change Grid Snapping", () => { pixelDocument.settings.snapToGrid = event.target.checked; return true; })} />{language === "zh" ? "吸附网格" : "Snap"}</label>
          </div>
          <div className="cel-transform-fields canvas-grid-fields">
            <label><span>{language === "zh" ? "网格宽" : "Grid W"}</span><input type="number" min="1" max="2048" value={pixelDocument.settings.gridWidth} onChange={(event) => mutateDocument("Change Grid", () => { pixelDocument.settings.gridWidth = Math.max(1, Math.min(2048, Math.round(Number(event.target.value) || 1))); return true; })} /></label>
            <label><span>{language === "zh" ? "网格高" : "Grid H"}</span><input type="number" min="1" max="2048" value={pixelDocument.settings.gridHeight} onChange={(event) => mutateDocument("Change Grid", () => { pixelDocument.settings.gridHeight = Math.max(1, Math.min(2048, Math.round(Number(event.target.value) || 1))); return true; })} /></label>
          </div>
          <div className="brush-option-row">
            <label><input type="checkbox" checked={pixelDocument.settings.symmetryX} onChange={(event) => mutateDocument("Change Symmetry", () => { pixelDocument.settings.symmetryX = event.target.checked; return true; })} />{language === "zh" ? "水平对称" : "Mirror X"}</label>
            <label><input type="checkbox" checked={pixelDocument.settings.symmetryY} onChange={(event) => mutateDocument("Change Symmetry", () => { pixelDocument.settings.symmetryY = event.target.checked; return true; })} />{language === "zh" ? "垂直对称" : "Mirror Y"}</label>
          </div>
          <div className="cel-transform-fields">
            <label><span>{language === "zh" ? "X 轴" : "X axis"}</span><input type="number" min="0" max={pixelDocument.width} step="0.5" value={pixelDocument.settings.symmetryAxisX} onChange={(event) => mutateDocument("Move Symmetry Axis", () => { pixelDocument.settings.symmetryAxisX = Math.max(0, Math.min(pixelDocument.width, Number(event.target.value) || 0)); return true; })} /></label>
            <label><span>{language === "zh" ? "Y 轴" : "Y axis"}</span><input type="number" min="0" max={pixelDocument.height} step="0.5" value={pixelDocument.settings.symmetryAxisY} onChange={(event) => mutateDocument("Move Symmetry Axis", () => { pixelDocument.settings.symmetryAxisY = Math.max(0, Math.min(pixelDocument.height, Number(event.target.value) || 0)); return true; })} /></label>
          </div>
          <div className="brush-option-row">
            <label><input type="checkbox" checked={pixelDocument.settings.tiledX} onChange={(event) => mutateDocument("Change Tiled Preview", () => { pixelDocument.settings.tiledX = event.target.checked; return true; })} />{language === "zh" ? "水平平铺" : "Tile X"}</label>
            <label><input type="checkbox" checked={pixelDocument.settings.tiledY} onChange={(event) => mutateDocument("Change Tiled Preview", () => { pixelDocument.settings.tiledY = event.target.checked; return true; })} />{language === "zh" ? "垂直平铺" : "Tile Y"}</label>
          </div>
          <div className="guide-actions">
            <button type="button" className="panel-command" onClick={() => mutateDocument("Add Guide", () => { pixelDocument.guides.push({id: `guide-${Date.now()}-${pixelDocument.guides.length}`, axis: "vertical", position: pixelDocument.width / 2}); return true; })}>{language === "zh" ? "+ 垂直辅助线" : "+ Vertical guide"}</button>
            <button type="button" className="panel-command" onClick={() => mutateDocument("Add Guide", () => { pixelDocument.guides.push({id: `guide-${Date.now()}-${pixelDocument.guides.length}`, axis: "horizontal", position: pixelDocument.height / 2}); return true; })}>{language === "zh" ? "+ 水平辅助线" : "+ Horizontal guide"}</button>
          </div>
          {pixelDocument.guides.map((guide) => <div className="guide-row" key={guide.id}><span>{guide.axis === "vertical" ? "X" : "Y"}</span><input type="number" min="0" max={guide.axis === "vertical" ? pixelDocument.width : pixelDocument.height} value={guide.position} onChange={(event) => mutateDocument("Move Guide", () => { guide.position = Math.max(0, Math.min(guide.axis === "vertical" ? pixelDocument.width : pixelDocument.height, Number(event.target.value) || 0)); return true; })} /><button type="button" title={language === "zh" ? "删除辅助线" : "Delete guide"} onClick={() => mutateDocument("Delete Guide", () => { const index = pixelDocument.guides.findIndex((candidate) => candidate.id === guide.id); if (index < 0) return false; pixelDocument.guides.splice(index, 1); return true; })}><X size={13} /></button></div>)}
        </section>

        </div>

      </aside>}

      {inspectorVisible && <div
        className="inspector-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={language === "zh" ? "调整侧栏宽度" : "Resize inspector"}
        onPointerDown={(event) => beginPanelResize("inspector", event)}
      />}

      {timelineVisible && <div
        className="timeline-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label={language === "zh" ? "调整时间轴高度" : "Resize timeline"}
        onPointerDown={(event) => beginPanelResize("timeline", event)}
      />}
      {timelineVisible && <section className="timeline-panel" aria-label={ui.animation} onContextMenu={(event) => {
        if (event.target === event.currentTarget) openContextMenu(event, {kind: "panel", panel: "timeline"});
      }}>
        <header className="timeline-toolbar">
          <div className="timeline-toolbar-row">
            <label className="timeline-select"><span>{ui.blendMode}</span><select disabled={isPlaying} value={activeLayer.blendMode} onChange={(event) => mutateSelectedLayers("Change Blend Mode", (layerId) => setLayerBlendMode(pixelDocument, layerId, event.target.value as BlendMode))}>
              {allBlendModes.map((mode) => <option value={mode} key={mode}>{blendModeText[language][mode]}</option>)}
            </select></label>
            {isImageLayer(activeLayer) && <label className="timeline-select"><span>{language === "zh" ? "角色" : "Role"}</span><select disabled={isPlaying || selectedLayers.length > 1} value={activeLayer.role} onChange={(event) => mutateDocument("Change Layer Role", () => setLayerRole(pixelDocument, activeLayer.id, event.target.value as LayerRole))}>
              {(["standard", "background", "reference"] as LayerRole[]).map((role) => <option value={role} key={role}>{layerRoleText[language][role]}</option>)}
            </select></label>}
            {isImageLayer(activeLayer) && <label className="timeline-onion"><input type="checkbox" checked={activeLayer.alphaLock} onChange={(event) => mutateSelectedLayers("Change Alpha Lock", (layerId) => setLayerAlphaLock(pixelDocument, layerId, event.target.checked))} /> {language === "zh" ? "锁定透明度" : "Alpha lock"}</label>}
            {isImageLayer(activeLayer) && <label className="timeline-onion"><input type="checkbox" checked={activeLayer.continuous} onChange={(event) => mutateSelectedLayers("Change Continuous Layers", (layerId) => setLayerContinuous(pixelDocument, layerId, event.target.checked))} /> {language === "zh" ? "连续动画格" : "Continuous"}</label>}
            <label className="timeline-opacity"><span>{ui.opacity}</span><input type="range" min="0" max="100" disabled={isPlaying} value={Math.round(activeLayer.opacity * 100)} aria-label={ui.layerOpacity} onPointerDown={beginOpacityChange} onPointerUp={finishOpacityChange} onKeyDown={beginOpacityChange} onKeyUp={finishOpacityChange} onBlur={finishOpacityChange} onChange={(event) => { if (!isPlaying) { for (const layer of layerTargetsFor()) setLayerOpacity(pixelDocument, layer.id, Number(event.target.value) / 100); activeTab.compositeCache.clear(); invalidate(); } }} /><output>{Math.round(activeLayer.opacity * 100)}%</output></label>
          </div>
          <div className="panel-actions timeline-action-group timeline-layer-actions" role="group" aria-label={language === "zh" ? "图层操作" : "Layer actions"}>
            <span className="timeline-group-label" onContextMenu={(event) => openContextMenu(event, {kind: "panel", panel: "timeline"})}>{ui.layers}</span>
            <button title={ui.addLayer} disabled={isPlaying} onClick={() => mutateDocument("Add Layer", () => { const layer = addLayer(pixelDocument, nextLayerName(pixelDocument, ui.layerBaseName)); if (!layer) return false; setTabCommandScope(activeTab, "layer"); return true; })}><Plus size={15} /></button>
            <button title={ui.addGroup} disabled={isPlaying} onClick={() => mutateDocument("Add Layer Group", () => { const group = addLayerGroup(pixelDocument, nextGroupName(pixelDocument, ui.groupBaseName)); if (!group) return false; setTabCommandScope(activeTab, "layer"); return true; })}><FolderPlus size={15} /></button>
            <button title={language === "zh" ? "新建图块地图图层" : "New tilemap layer"} disabled={isPlaying} onClick={createTilemapLayer}><Grid2X2 size={14} /></button>
            <button title={selectedLayerRoots.length > 1 ? (language === "zh" ? "复制所选图层" : "Duplicate selected layers") : ui.duplicateLayer} disabled={isPlaying} onClick={duplicateSelectedLayers}><Copy size={14} /></button>
          </div>
          <div className="timeline-toolbar-row timeline-animation-row">
            <div className="panel-actions timeline-action-group" role="group" aria-label={language === "zh" ? "帧操作" : "Frame actions"}>
              <span className="timeline-group-label">{language === "zh" ? "帧" : "Frames"}</span>
              <button title={ui.addFrame} disabled={isPlaying} onClick={() => dispatchCommandShortcut("addFrame")}><Plus size={14} /></button>
              <button title={ui.newEmptyFrame} disabled={isPlaying} onClick={() => dispatchCommandShortcut("newEmptyFrame")}><FilePlus size={14} /></button>
              <button title={ui.duplicateFrame} disabled={isPlaying} onClick={() => mutateDocument("Duplicate Frame", () => { const extendLoop = shouldExtendTimelineLoopAfterInsertion(activeTab); const frames = duplicateFrames(pixelDocument, selectedFrameIds); if (frames.length === 0) return false; extendTimelineLoopAfterInsertion(activeTab, extendLoop); activeTab.selectedFrameIds = frames.map((frame) => frame.id); activeTab.frameSelectionAnchorId = frames[0].id; setTabCommandScope(activeTab, "frame"); return true; })}><Copy size={14} /></button>
              <button title={ui.deleteFrame} disabled={isPlaying || selectedFrameIds.length >= pixelDocument.frames.length} onClick={deleteCurrentFrames}><Trash2 size={14} /></button>
            </div>
            <span className="timeline-toolbar-separator" aria-hidden="true" />
            <div className="panel-actions timeline-action-group" role="group" aria-label={language === "zh" ? "动画格操作" : "Cel actions"}>
              <span className="timeline-group-label">{language === "zh" ? "动画格" : "Cels"}</span>
              <button title={language === "zh" ? "创建空动画格" : "Create cel"} disabled={isPlaying || !isCelLayer(activeLayer)} onClick={() => mutateDocument("Create Cels", () => { const addresses = activeTab.commandScope === "cels" && selectedCels.length ? selectedCels : [{layerId: activeLayer.id, frameId: pixelDocument.activeFrameId}]; let changed = false; for (const address of addresses) { if (getCel(pixelDocument, address.layerId, address.frameId)) continue; changed = Boolean(ensureCel(pixelDocument, address.layerId, address.frameId)) || changed; } return changed; })}><FilePlus size={14} /></button>
              <button title={ui.duplicateCels} disabled={isPlaying || (!activeCel && !selectedCels.some(({layerId, frameId}) => Boolean(getCel(pixelDocument, layerId, frameId))))} onClick={() => dispatchCommandShortcut("duplicateCels")}><Copy size={14} /></button>
              <button title={language === "zh" ? "删除动画格" : "Delete cel"} disabled={isPlaying || !selectedCels.some(({layerId, frameId}) => Boolean(getCel(pixelDocument, layerId, frameId)))} onClick={() => {
                if (preferences.alerts.deleteCel && !window.confirm(language === "zh" ? "删除所选动画格？" : "Delete the selected cels?")) return;
                mutateDocument("Delete Cels", () => { let changed = false; for (const address of selectedCels) changed = deleteCel(pixelDocument, address.layerId, address.frameId) || changed; return changed; });
              }}><X size={14} /></button>
            </div>
            <span className="timeline-toolbar-separator" />
            <button className="icon-button timeline-play-button" title={isPlaying ? ui.pause : ui.play} onClick={togglePlayback}>{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
            <label className="timeline-fps"><span>FPS</span><input type="number" min="1" max="120" disabled={isPlaying} value={Math.round(1000 / (pixelDocument.frames[activeFrameIndex]?.durationMs ?? 100))} onChange={(event) => { const fps = Math.min(120, Math.max(1, Number(event.target.value) || 1)); mutateDocument("Change Frame Rate", () => { const changed = setFramesDuration(pixelDocument, selectedFrameIds, 1000 / fps); if (changed) setTabCommandScope(activeTab, "frame"); return changed; }); }} /></label>
            <label className="timeline-duration"><span>{language === "zh" ? "帧时长" : "Duration"}</span><input type="range" min="10" max="2000" step="10" disabled={isPlaying} value={Math.round(pixelDocument.frames[activeFrameIndex]?.durationMs ?? 100)} onPointerDown={beginFrameDurationChange} onPointerUp={finishFrameDurationChange} onKeyDown={beginFrameDurationChange} onKeyUp={finishFrameDurationChange} onBlur={finishFrameDurationChange} onChange={(event) => { if (setFramesDuration(pixelDocument, selectedFrameIds, Number(event.target.value))) { activeTab.compositeCache.clear(); invalidate(); } }} /><output>{Math.round(pixelDocument.frames[activeFrameIndex]?.durationMs ?? 100)} ms</output></label>
            <label className="timeline-onion"><input type="checkbox" checked={onionSkin} onChange={(event) => setOnionSkin(event.target.checked)} /> {ui.onionSkin}</label>
            <details className="timeline-advanced-settings">
              <summary title={language === "zh" ? "动画高级设置" : "Advanced animation settings"} aria-label={language === "zh" ? "动画高级设置" : "Advanced animation settings"}><SlidersHorizontal size={14} /></summary>
              <div className="timeline-advanced-popover">
                <label className="timeline-fps" title={language === "zh" ? "前置帧数" : "Previous onion frames"}><span>−</span><input type="number" min="0" max="16" value={pixelDocument.settings.onionPreviousFrames} onChange={(event) => mutateDocument("Change Onion Skin", () => { pixelDocument.settings.onionPreviousFrames = Math.max(0, Math.min(16, Math.round(Number(event.target.value) || 0))); return true; })} /></label>
                <label className="timeline-fps" title={language === "zh" ? "后置帧数" : "Next onion frames"}><span>+</span><input type="number" min="0" max="16" value={pixelDocument.settings.onionNextFrames} onChange={(event) => mutateDocument("Change Onion Skin", () => { pixelDocument.settings.onionNextFrames = Math.max(0, Math.min(16, Math.round(Number(event.target.value) || 0))); return true; })} /></label>
                <label className="timeline-fps" title={language === "zh" ? "洋葱皮透明度" : "Onion opacity"}><span>%</span><input type="number" min="0" max="100" value={Math.round(pixelDocument.settings.onionOpacity * 100)} onChange={(event) => mutateDocument("Change Onion Skin", () => { pixelDocument.settings.onionOpacity = Math.max(0, Math.min(1, (Number(event.target.value) || 0) / 100)); return true; })} /></label>
                <label className="timeline-advanced-color"><span>{language === "zh" ? "前帧" : "Previous"}</span><input className="timeline-color" type="color" value={pixelDocument.settings.onionPreviousColor.slice(0, 7)} onChange={(event) => mutateDocument("Change Onion Skin", () => { pixelDocument.settings.onionPreviousColor = `${event.target.value}ff`; return true; })} /></label>
                <label className="timeline-advanced-color"><span>{language === "zh" ? "后帧" : "Next"}</span><input className="timeline-color" type="color" value={pixelDocument.settings.onionNextColor.slice(0, 7)} onChange={(event) => mutateDocument("Change Onion Skin", () => { pixelDocument.settings.onionNextColor = `${event.target.value}ff`; return true; })} /></label>
                <button className="panel-command" type="button" aria-pressed={Boolean((detachedPreviewRef.current && !detachedPreviewRef.current.closed) || previewOpen)} onClick={toggleDetachedPreview}><Eye size={14} />{language === "zh" ? "独立动画预览" : "Detached preview"}</button>
              </div>
            </details>
            <span className="timeline-toolbar-separator" />
            <label className="timeline-select timeline-tags" onContextMenu={(event) => {
              if (activeTag) openContextMenu(event, {kind: "tag", tagId: activeTag.id});
            }}><span>{ui.tags}</span><select value={activeTag?.id ?? ""} onChange={(event) => selectTag(event.target.value)} onKeyDown={(event) => {
              if (activeTag) openKeyboardContextMenu(event, {kind: "tag", tagId: activeTag.id});
            }}><option value="">{ui.noTag}</option>{pixelDocument.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
            <div className="panel-actions">
              <button className={activeTag ? "is-active" : ""} title={ui.focusTag} aria-label={ui.focusTag} aria-pressed={Boolean(activeTag)} disabled={isPlaying || !focusableTagId} onClick={() => dispatchCommandShortcut("focusTag")}><Target size={14} /></button>
              <button title={ui.addTag} disabled={isPlaying} onClick={openNewTagDialog}><Plus size={14} /></button>
            </div>
            <label className="timeline-loop"><span>{ui.loop}</span><select aria-label={ui.loopStart} value={activeTab.loopStartFrameId} onChange={(event) => { activeTab.loopStartFrameId = event.target.value; activeTab.activeTagId = undefined; setUIRevision((value) => value + 1); }}>{pixelDocument.frames.map((frame, index) => <option key={frame.id} value={frame.id}>{index + preferences.timeline.firstFrame}</option>)}</select><span>{ui.to}</span><select aria-label={ui.loopEnd} value={activeTab.loopEndFrameId} onChange={(event) => { activeTab.loopEndFrameId = event.target.value; activeTab.activeTagId = undefined; setUIRevision((value) => value + 1); }}>{pixelDocument.frames.map((frame, index) => <option key={frame.id} value={frame.id}>{index + preferences.timeline.firstFrame}</option>)}</select></label>
          </div>
        </header>
        <div className="timeline-body">
          <div
            className="timeline-layers"
            ref={timelineLayersRef}
            role="listbox"
            aria-label={ui.layers}
            style={{paddingBottom: `${timelineLayersBottomPadding}px`}}
            onScroll={() => handleTimelineScroll("layers")}
          >
            <div className="timeline-layer-header">{ui.layers}</div>
            {timelineEntries.map(({layer, depth}) => {
              const cel = getCel(pixelDocument, layer.id, pixelDocument.activeFrameId);
              const selected = selectedLayerIdSet.has(layer.id);
              const collapsed = activeTab.collapsedGroupIds.has(layer.id);
              return <div className={`timeline-layer-row${selected ? " is-selected" : ""}${layer.id === activeLayer.id ? " is-active" : ""}${layer.kind === "group" ? " is-group" : ""}`} style={{paddingLeft: 4 + depth * 12}} data-layer-id={layer.id} key={layer.id} role="option" aria-selected={selected} tabIndex={layer.id === activeLayer.id ? 0 : -1} onClick={(event) => {
                if (event.ctrlKey || event.metaKey) {
                  selectLayer(layer.id, event.shiftKey);
                  selectLayerOpaqueContent(layer.id);
                  return;
                }
                selectLayer(layer.id, event.shiftKey, false);
              }} onContextMenu={(event) => {
                if (!selectedLayerIdSet.has(layer.id)) selectLayer(layer.id, false, false);
                else {
                  pixelDocument.activeLayerId = layer.id;
                  setTabCommandScope(activeTab, "layer");
                  invalidate();
                }
                openContextMenu(event, {kind: "layer", layerId: layer.id});
              }} onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (openKeyboardContextMenu(event, {kind: "layer", layerId: layer.id})) return;
                if (isActivationKey(event.key)) {
                  event.preventDefault();
                  event.currentTarget.click();
                  return;
                }
                if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                const layerElements = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
                const currentIndex = layerElements.indexOf(event.currentTarget);
                if (currentIndex < 0 || layerElements.length < 2) return;
                const nextIndex = event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? layerElements.length - 1
                    : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + layerElements.length) % layerElements.length;
                event.preventDefault();
                layerElements[nextIndex].focus();
                layerElements[nextIndex].click();
              }}>
                {layer.kind === "group" ? <button className="layer-expander" title={collapsed ? ui.expandGroup : ui.collapseGroup} aria-label={collapsed ? ui.expandGroup : ui.collapseGroup} onClick={(event) => { event.stopPropagation(); toggleGroup(layer.id); }}>{collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button> : <span className="layer-expander" />}
                <button className="layer-toggle" disabled={isPlaying} title={layer.visible ? ui.hideLayer : ui.showLayer} onClick={(event) => { event.stopPropagation(); mutateDocument(layer.visible ? "Hide Layer" : "Show Layer", () => { let changed = false; for (const target of layerTargetsFor(layer.id)) changed = setLayerVisibility(pixelDocument, target.id, !layer.visible) || changed; return changed; }); }}>{layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                {cel ? <LayerThumbnail pixels={cel.pixels} width={cel.width} height={cel.height} revision={activeTab.thumbnailRevisions.get(cel.id) ?? 0} visible={layer.visible} ariaLabel={layer.visible ? ui.visibleLayerThumbnail : ui.hiddenLayerThumbnail} /> : <span className="group-icon"><Folder size={15} /></span>}
                {renamingLayerId === layer.id ? <input type="text" className="layer-name-input" value={layerNameDraft} autoFocus onClick={(event) => event.stopPropagation()} onChange={(event) => setLayerNameDraft(event.target.value)} onBlur={() => finishRename(layer.id)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelRenameRef.current = true; event.currentTarget.blur(); } }} /> : <button className="layer-name" disabled={isPlaying} title={ui.renameLayer} onDoubleClick={(event) => { event.stopPropagation(); setLayerNameDraft(layer.name); setRenamingLayerId(layer.id); }}>{layer.name}</button>}
                <button className="layer-toggle" disabled={isPlaying} title={layer.locked ? ui.unlockLayer : ui.lockLayer} onClick={(event) => { event.stopPropagation(); mutateDocument(layer.locked ? "Unlock Layer" : "Lock Layer", () => { let changed = false; for (const target of layerTargetsFor(layer.id)) changed = setLayerLocked(pixelDocument, target.id, !layer.locked) || changed; return changed; }); }}>{layer.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
              </div>;
            })}
          </div>
          <div
            className="timeline-frames"
            ref={timelineFramesRef}
            role="grid"
            aria-label={ui.frames}
            aria-multiselectable="true"
            aria-colcount={pixelDocument.frames.length + 1}
            aria-rowcount={timelineEntries.length + 1}
            onScroll={() => handleTimelineScroll("frames")}
          >
            <div className="timeline-frame-header" role="row" style={{gridTemplateColumns: `repeat(${pixelDocument.frames.length + 1}, 42px)`}}>{pixelDocument.frames.map((frame, index) => {
              const tag = pixelDocument.tags.find((candidate) => frameIDsInRange(pixelDocument, candidate.fromFrameId, candidate.toFrameId).includes(frame.id));
              const active = frame.id === pixelDocument.activeFrameId;
              const rangeSelected = selectedFrameIds.includes(frame.id);
              return <button
                key={frame.id}
                role="columnheader"
                aria-colindex={index + 1}
                aria-selected={activeTab.commandScope === "frame" && rangeSelected}
                aria-current={active ? "true" : undefined}
                className={`timeline-frame-number${active ? " is-selected" : ""}${rangeSelected ? " is-range-selected" : ""}`}
                title={`${ui.frame} ${index + preferences.timeline.firstFrame}`}
                aria-label={`${ui.frame} ${index + preferences.timeline.firstFrame}`}
                data-frame-id={frame.id}
                tabIndex={!celGridOwnsTabStop && active ? 0 : -1}
                onClick={(event) => {
                  const grid = event.currentTarget.closest<HTMLElement>("[role=grid]");
                  const nextActiveFrameId = selectFrame(frame.id, event.shiftKey, event.ctrlKey || event.metaKey);
                  if (nextActiveFrameId) focusTimelineFrame(grid, nextActiveFrameId);
                }}
                onContextMenu={(event) => {
                  if (!selectedFrameIds.includes(frame.id)) selectFrame(frame.id, false, false);
                  else {
                    pixelDocument.activeFrameId = frame.id;
                    setTabCommandScope(activeTab, "frame");
                    invalidate();
                  }
                  openContextMenu(event, {kind: "frame", frameId: frame.id});
                }}
                onKeyDown={(event) => {
                  if (openKeyboardContextMenu(event, {kind: "frame", frameId: frame.id})) return;
                  navigateTimelineFrame(event, frame.id);
                }}
              >{tag && <span className="timeline-tag-mark" style={{backgroundColor: tag.color}} />}{index + preferences.timeline.firstFrame}</button>;
            })}<button
              className="timeline-frame-append-header"
              type="button"
              role="columnheader"
              aria-colindex={pixelDocument.frames.length + 1}
              aria-label={language === "zh" ? "在时间轴末尾追加空帧" : "Append empty frame at timeline end"}
              title={language === "zh" ? "在时间轴末尾追加空帧" : "Append empty frame at timeline end"}
              disabled={isPlaying}
              onClick={() => appendTimelineFrame()}
            ><Plus size={12} /></button></div>
            {timelineEntries.map(({layer}, rowIndex) => <div className={`timeline-cel-row${layer.kind === "group" ? " is-group" : ""}`} key={layer.id} role="row" aria-rowindex={rowIndex + 2} style={{gridTemplateColumns: `repeat(${pixelDocument.frames.length + 1}, 42px)`}}>{pixelDocument.frames.map((frame, index) => {
              const cel = getCel(pixelDocument, layer.id, frame.id);
              if (layer.kind === "group") return <div key={frame.id} className="timeline-cel is-group-cell" role="gridcell" aria-colindex={index + 1} />;
              const active = layer.id === activeLayer.id && frame.id === pixelDocument.activeFrameId;
              const celSelected = activeTab.commandScope === "cels" && selectedCelKeySet.has(celSelectionKey(layer.id, frame.id));
              const rangeSelected = activeTab.commandScope === "frame" && layer.id === activeLayer.id && selectedFrameIds.includes(frame.id);
              const linked = Boolean(cel && isCelLinked(pixelDocument, cel));
              const key = celSelectionKey(layer.id, frame.id);
              return <button
                key={frame.id}
                className={`timeline-cel${!cel ? " is-empty" : ""}${active ? " is-active" : ""}${celSelected ? " is-cel-selected" : ""}${rangeSelected ? " is-range-selected" : ""}${linked ? " is-linked" : ""}`}
                role="gridcell"
                aria-colindex={index + 1}
                aria-selected={celSelected}
                aria-current={active ? "true" : undefined}
                aria-label={`${layer.name}, ${ui.frame} ${index + 1}${cel ? (language === "zh" ? "，可拖动移动或复制" : ", draggable") : ""}`}
                title={cel ? (language === "zh" ? "拖动移动；按 Ctrl/Cmd 拖动复制" : "Drag to move; hold Ctrl/Cmd to copy") : undefined}
                data-cel-key={key}
                draggable={Boolean(cel) && !isPlaying}
                tabIndex={celGridOwnsTabStop && active ? 0 : -1}
                onDragStart={(event) => beginTimelineCelDrag(event, layer.id, frame.id)}
                onDragOver={handleTimelineCelDragOver}
                onDrop={(event) => finishTimelineCelDrag(event, layer.id, frame.id)}
                onDragEnd={cancelTimelineCelDrag}
                onClick={(event) => {
                  const grid = event.currentTarget.closest<HTMLElement>("[role=grid]");
                  const nextActive = selectCel(layer.id, frame.id, event.shiftKey, event.ctrlKey || event.metaKey);
                  if (nextActive) focusTimelineCel(grid, nextActive);
                }}
                onContextMenu={(event) => {
                  if (!selectedCelKeySet.has(key)) selectCel(layer.id, frame.id, false, false);
                  else {
                    pixelDocument.activeLayerId = layer.id;
                    pixelDocument.activeFrameId = frame.id;
                    setTabCommandScope(activeTab, "cels");
                    invalidate();
                  }
                  openContextMenu(event, {kind: "cel", layerId: layer.id, frameId: frame.id});
                }}
                onKeyDown={(event) => {
                  if (openKeyboardContextMenu(event, {kind: "cel", layerId: layer.id, frameId: frame.id})) return;
                  navigateTimelineCel(event, layer.id, frame.id);
                }}
              >{linked ? <Link2 size={11} /> : <span />}</button>;
            })}{layer.kind === "group"
              ? <div key="append" className="timeline-cel is-group-cell" role="gridcell" aria-colindex={pixelDocument.frames.length + 1} />
              : <button
                key="append"
                className="timeline-cel timeline-cel-append"
                type="button"
                role="gridcell"
                aria-colindex={pixelDocument.frames.length + 1}
                aria-label={language === "zh" ? `${layer.name}，追加帧并创建动画格` : `${layer.name}, append frame and create cel`}
                title={language === "zh" ? "点击追加帧并创建动画格；也可拖放到此处追加" : "Click to append a frame and create a cel; drop here to append"}
                disabled={isPlaying}
                onClick={() => appendTimelineFrame(layer.id)}
                onDragOver={handleTimelineCelDragOver}
                onDrop={(event) => finishTimelineCelDrag(event, layer.id, undefined, pixelDocument.frames.length)}
              ><Plus size={12} /></button>}
            </div>)}
          </div>
        </div>
      </section>}
      </>}

      {hasOpenDocument && previewOpen && <aside className="animation-preview" aria-label={language === "zh" ? "动画预览" : "Animation preview"}>
        <header><span>{language === "zh" ? "动画预览" : "Animation preview"}</span><button type="button" title={ui.closeDocument} onClick={() => setPreviewOpen(false)}><X size={14} /></button></header>
        <div className="animation-preview-canvas"><LayerThumbnail pixels={compositeFrame(pixelDocument)} width={pixelDocument.width} height={pixelDocument.height} revision={revision} visible ariaLabel={language === "zh" ? "当前动画帧" : "Current animation frame"} size={192} pixelAspectRatio={pixelDocument.pixelAspectRatio} /></div>
        <footer><button type="button" onClick={togglePlayback}>{isPlaying ? <Pause size={14} /> : <Play size={14} />}</button><span>{activeFrameIndex + preferences.timeline.firstFrame} / {preferences.timeline.firstFrame + pixelDocument.frames.length - 1}</span></footer>
      </aside>}

      {historyOpen && hasOpenDocument && <div className="dialog-backdrop" role="presentation">
        <section className="canvas-dialog editor-dialog history-dialog" role="dialog" aria-modal="true" aria-label={language === "zh" ? "历史记录" : "History"}>
          <h2>{language === "zh" ? "历史记录" : "History"}</h2>
          <div className="history-state-list" role="listbox" aria-label={language === "zh" ? "文档历史状态" : "Document history states"}>
            {history.states.map((state) => <button
              key={state.stateID}
              type="button"
              role="option"
              aria-selected={state.current}
              disabled={!preferences.undo.allowNonLinear && !state.current}
              className={state.current ? "is-current" : ""}
              onClick={() => jumpToHistoryState(state.stateID)}
            >
              <span>{state.label === "Initial State"
                ? (language === "zh" ? "初始状态" : state.label)
                : state.label === "Oldest Retained State"
                  ? (language === "zh" ? "最早保留状态" : state.label)
                  : localizeStatus(state.label, language)}</span>
              {state.saved && <small>{language === "zh" ? "已保存" : "Saved"}</small>}
            </button>)}
          </div>
          <div className="dialog-actions"><button type="button" onClick={() => setHistoryOpen(false)}>{language === "zh" ? "关闭" : "Close"}</button></div>
        </section>
      </div>}

      {settingsOpen && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-dialog-title" onSubmit={(event) => event.preventDefault()}>
          <header className="preferences-dialog-header">
            <h2 id="preferences-dialog-title">{language === "zh" ? "偏好设置" : "Preferences"}</h2>
            <button type="button" onClick={() => setSettingsOpen(false)} title={language === "zh" ? "关闭" : "Close"} aria-label={language === "zh" ? "关闭偏好设置" : "Close preferences"}><X size={17} /></button>
          </header>
          <div className="preferences-dialog-content">
            <PreferencesPanel
              preferences={preferences}
              onChange={applyPreferences}
              zh={language === "zh"}
              afterGeneral={<>
                <details>
                  <summary>{language === "zh" ? "工作区布局" : "Workspace Layouts"}</summary>
                  <div className="preferences-section-body">
                    <div className="preferences-section-actions"><button type="button" onClick={() => { setInspectorWidth(defaultWorkspaceDimensions.inspectorWidth); setTimelineHeight(defaultWorkspaceDimensions.timelineHeight); setInspectorVisible(defaultWorkspaceVisibility.inspectorVisible); setTimelineVisible(defaultWorkspaceVisibility.timelineVisible); setCanvasOnly(false); setWorkspaceLayoutNotice("reset"); }}>{language === "zh" ? "重置布局" : "Reset layout"}</button></div>
                    <div className="preferences-general">
                      <label className="dialog-field"><span>{language === "zh" ? "侧栏宽度" : "Inspector width"}</span><input type="number" min="190" max="420" value={inspectorWidth} onChange={(event) => setInspectorWidth(Math.max(190, Math.min(420, Math.round(Number(event.target.value) || 190))))} /></label>
                      <label className="dialog-field"><span>{language === "zh" ? "时间轴高度" : "Timeline height"}</span><input type="number" min="150" max="520" value={timelineHeight} onChange={(event) => setTimelineHeight(Math.max(150, Math.min(520, Math.round(Number(event.target.value) || 150))))} /></label>
                      <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "布局名称" : "Layout name"}</span><input type="text" maxLength={64} value={workspaceLayoutName} onChange={(event) => { setWorkspaceLayoutName(event.target.value); setWorkspaceLayoutNotice(null); }} /></label>
                      <button className="panel-command workspace-layout-button" type="button" disabled={!workspaceLayoutName.trim()} onClick={() => {
                        try {
                          const name = workspaceLayoutName.trim();
                          setWorkspaceLayouts(saveWorkspaceLayout(localStorage, {name, inspectorWidth: Math.round(inspectorWidth), timelineHeight: Math.round(timelineHeight)}));
                          setWorkspaceLayoutSelected(name);
                          setWorkspaceLayoutNotice("saved");
                        } catch { setWorkspaceLayoutNotice("error"); }
                      }}>{workspaceLayouts.some((layout) => layout.name === workspaceLayoutName.trim()) ? (language === "zh" ? "更新同名布局" : "Update named layout") : (language === "zh" ? "保存当前布局" : "Save current layout")}</button>
                      <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "已保存布局" : "Saved layouts"}</span><select value={workspaceLayoutSelected} onChange={(event) => { setWorkspaceLayoutSelected(event.target.value); setWorkspaceLayoutName(event.target.value); setWorkspaceLayoutNotice(null); }}><option value="">{language === "zh" ? "选择布局" : "Choose layout"}</option>{workspaceLayouts.map((layout) => <option key={layout.name} value={layout.name}>{layout.name}</option>)}</select></label>
                      <button className="panel-command" type="button" disabled={!workspaceLayoutSelected} onClick={() => {
                        const layout = workspaceLayouts.find((entry) => entry.name === workspaceLayoutSelected);
                        if (!layout) return;
                        setInspectorWidth(layout.inspectorWidth);
                        setTimelineHeight(layout.timelineHeight);
                        setCanvasOnly(false);
                        setWorkspaceLayoutNotice("loaded");
                      }}>{language === "zh" ? "应用布局" : "Apply layout"}</button>
                      <button className="panel-command" type="button" disabled={!workspaceLayoutSelected} onClick={() => {
                        try {
                          setWorkspaceLayouts(deleteWorkspaceLayout(localStorage, workspaceLayoutSelected));
                          setWorkspaceLayoutSelected("");
                          setWorkspaceLayoutNotice("deleted");
                        } catch { setWorkspaceLayoutNotice("error"); }
                      }}>{language === "zh" ? "删除保存的布局" : "Delete saved layout"}</button>
                    </div>
                    {workspaceLayoutNotice && <p className="dialog-note" role="status">{({
                      saved: language === "zh" ? "布局已保存到本机。" : "Layout saved on this device.",
                      loaded: language === "zh" ? "布局已应用。" : "Layout applied.",
                      deleted: language === "zh" ? "已删除保存的布局，当前布局不变。" : "Saved layout deleted; current layout retained.",
                      reset: language === "zh" ? "已恢复默认面板尺寸。" : "Default panel dimensions restored.",
                      error: language === "zh" ? "无法保存布局，请检查本地存储是否可用。" : "Could not save layouts. Check local storage availability.",
                    })[workspaceLayoutNotice]}</p>}
                  </div>
                </details>
                <details>
                  <summary>{language === "zh" ? "快捷键" : "Shortcuts"}</summary>
                  <div className="preferences-section-body preferences-shortcuts">
                    <div className="preferences-heading"><span>{language === "zh" ? "命令快捷键" : "Command shortcuts"}</span><button type="button" onClick={() => setCommandShortcutAssignments({...defaultCommandShortcuts})}>{language === "zh" ? "恢复默认" : "Reset"}</button></div>
                    <div className="command-shortcut-grid">
                      {(Object.keys(defaultCommandShortcuts) as CommandShortcutID[]).map((command) => <label key={command}><span>{commandShortcutLabels[language][command]}</span><input type="text" readOnly value={formatShortcutForPlatform(commandShortcutAssignments[command])} placeholder={language === "zh" ? "未设置" : "Unassigned"} aria-label={`${commandShortcutLabels[language][command]} ${language === "zh" ? "快捷键" : "shortcut"}`} onKeyDown={(event) => captureCommandShortcut(command, event)} onFocus={(event) => event.currentTarget.select()} /></label>)}
                    </div>
                    <div className="preferences-heading"><span>{language === "zh" ? "工具快捷键" : "Tool shortcuts"}</span><button type="button" onClick={resetToolShortcuts}>{language === "zh" ? "恢复默认" : "Reset"}</button></div>
                    <div className="shortcut-grid">
                      {tools.map(({id, icon: Icon}) => <label key={id}><span><Icon size={14} />{ui.toolsByID[id]}</span><input type="text" value={shortcutAssignments[id].toUpperCase()} maxLength={1} aria-label={`${ui.toolsByID[id]} ${language === "zh" ? "快捷键" : "shortcut"}`} onChange={(event) => updateToolShortcut(id, event.target.value)} onFocus={(event) => event.currentTarget.select()} /></label>)}
                    </div>
                  </div>
                </details>
              </>}
            />
          </div>
        </form>
      </div>}

      {slicePropertiesDialog && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog" role="dialog" aria-modal="true" aria-labelledby="slice-properties-title" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setSlicePropertiesDialog(null); } }} onSubmit={(event) => { event.preventDefault(); applySlicePropertiesDialog(); }}>
          <h2 id="slice-properties-title">{language === "zh" ? "切片属性" : "Slice Properties"}</h2>
          <div className="dialog-field-grid">
            <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "名称" : "Name"}</span><input type="text" autoFocus value={slicePropertiesDialog.name} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, name: event.target.value})} /></label>
            <label className="dialog-color-field"><span>{language === "zh" ? "颜色" : "Color"}</span><input type="color" value={slicePropertiesDialog.color} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, color: event.target.value})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "关键帧" : "Key frame"}</span><select value={slicePropertiesDialog.frameId} onChange={(event) => openSliceProperties(slicePropertiesDialog.sliceId, event.target.value)}>{pixelDocument.frames.map((frame, index) => slicePropertiesDialog.sliceId && pixelDocument.slices.find((slice) => slice.id === slicePropertiesDialog.sliceId)?.keys.some((key) => key.frameId === frame.id) ? <option value={frame.id} key={frame.id}>{index + preferences.timeline.firstFrame}</option> : null)}</select></label>
            <label className="dialog-field"><span>X</span><input type="number" value={slicePropertiesDialog.x} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, x: event.target.value})} /></label>
            <label className="dialog-field"><span>Y</span><input type="number" value={slicePropertiesDialog.y} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, y: event.target.value})} /></label>
            <label className="dialog-field"><span>{ui.width}</span><input type="number" min="1" value={slicePropertiesDialog.width} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, width: event.target.value})} /></label>
            <label className="dialog-field"><span>{ui.height}</span><input type="number" min="1" value={slicePropertiesDialog.height} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, height: event.target.value})} /></label>
          </div>
          <div className="panel-subheading"><span>{language === "zh" ? "九宫格中心（留空移除）" : "Nine-patch center (blank to remove)"}</span></div>
          <div className="dialog-field-grid">
            <label className="dialog-field"><span>X</span><input type="number" value={slicePropertiesDialog.centerX} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, centerX: event.target.value})} /></label>
            <label className="dialog-field"><span>Y</span><input type="number" value={slicePropertiesDialog.centerY} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, centerY: event.target.value})} /></label>
            <label className="dialog-field"><span>{ui.width}</span><input type="number" min="1" value={slicePropertiesDialog.centerWidth} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, centerWidth: event.target.value})} /></label>
            <label className="dialog-field"><span>{ui.height}</span><input type="number" min="1" value={slicePropertiesDialog.centerHeight} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, centerHeight: event.target.value})} /></label>
          </div>
          <div className="panel-subheading"><span>{language === "zh" ? "枢轴（留空移除）" : "Pivot (blank to remove)"}</span></div>
          <div className="dialog-field-grid">
            <label className="dialog-field"><span>X</span><input type="number" value={slicePropertiesDialog.pivotX} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, pivotX: event.target.value})} /></label>
            <label className="dialog-field"><span>Y</span><input type="number" value={slicePropertiesDialog.pivotY} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, pivotY: event.target.value})} /></label>
          </div>
          <div className="dialog-actions"><button type="button" onClick={() => setSlicePropertiesDialog(null)}>{ui.cancel}</button><button type="submit">{ui.apply}</button></div>
        </form>
      </div>}

      {layerPropertiesDialog && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog" role="dialog" aria-modal="true" aria-labelledby="layer-properties-title" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setLayerPropertiesDialog(null); } }} onSubmit={(event) => { event.preventDefault(); applyLayerPropertiesDialog(); }}>
          <h2 id="layer-properties-title">{language === "zh" ? "图层属性" : "Layer properties"}</h2>
          <p className="dialog-hint">{language === "zh" ? `编辑 ${layerPropertiesDialog.layerIds.length} 个图层。空值或“保持”表示保留原值。` : `Editing ${layerPropertiesDialog.layerIds.length} layers. Empty fields or “Keep” preserve each value.`}</p>
          <div className="dialog-field-grid">
            <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "名称（仅单个图层）" : "Name (single layer only)"}</span><input type="text" autoFocus value={layerPropertiesDialog.name} disabled={layerPropertiesDialog.layerIds.length !== 1} placeholder={language === "zh" ? "保持原名称" : "Keep current name"} onChange={(event) => setLayerPropertiesDialog({...layerPropertiesDialog, name: event.target.value})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "不透明度 (%)" : "Opacity (%)"}</span><input type="number" min="0" max="100" step="any" value={layerPropertiesDialog.opacity} placeholder="Keep" onChange={(event) => setLayerPropertiesDialog({...layerPropertiesDialog, opacity: event.target.value})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "混合模式" : "Blend mode"}</span><select value={layerPropertiesDialog.blendMode} onChange={(event) => setLayerPropertiesDialog({...layerPropertiesDialog, blendMode: event.target.value as LayerPropertiesDialogState["blendMode"]})}><option value="keep">{language === "zh" ? "保持" : "Keep"}</option>{allBlendModes.map((mode) => <option value={mode} key={mode}>{blendModeText[language][mode]}</option>)}</select></label>
            <label className="dialog-field"><span>{language === "zh" ? "角色" : "Role"}</span><select value={layerPropertiesDialog.role} onChange={(event) => setLayerPropertiesDialog({...layerPropertiesDialog, role: event.target.value as LayerRoleProperty})}><option value="keep">{language === "zh" ? "保持" : "Keep"}</option>{(["standard", "background", "reference"] as LayerRole[]).map((role) => <option value={role} key={role}>{layerRoleText[language][role]}</option>)}</select></label>
            {(["visible", "locked", "alphaLock", "continuous"] as const).map((property) => {
              const labelsByProperty = {
                visible: language === "zh" ? "可见" : "Visible",
                locked: language === "zh" ? "锁定" : "Locked",
                alphaLock: language === "zh" ? "锁定透明度" : "Alpha lock",
                continuous: language === "zh" ? "连续动画格" : "Continuous",
              };
              return <label className="dialog-field" key={property}><span>{labelsByProperty[property]}</span><select value={layerPropertiesDialog[property]} onChange={(event) => setLayerPropertiesDialog({...layerPropertiesDialog, [property]: event.target.value as TriStateProperty})}><option value="keep">{language === "zh" ? "保持" : "Keep"}</option><option value="on">{language === "zh" ? "开启" : "On"}</option><option value="off">{language === "zh" ? "关闭" : "Off"}</option></select></label>;
            })}
          </div>
          <div className="dialog-actions"><button type="button" onClick={() => setLayerPropertiesDialog(null)}>{ui.cancel}</button><button type="submit">{ui.apply}</button></div>
        </form>
      </div>}

      {tagDialog && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog" role="dialog" aria-modal="true" aria-label={tagDialog.tagId ? ui.editTag : ui.addTag} onSubmit={(event) => { event.preventDefault(); applyTagDialog(); }}>
          <h2>{tagDialog.tagId ? ui.editTag : ui.addTag}</h2>
          <div className="dialog-field-grid">
            <label className="dialog-field dialog-field-wide"><span>{ui.tagName}</span><input type="text" value={tagDialog.name} autoFocus onChange={(event) => setTagDialog({...tagDialog, name: event.target.value})} /></label>
            <label className="dialog-field"><span>{ui.loopStart}</span><select value={tagDialog.fromFrameId} onChange={(event) => setTagDialog({...tagDialog, fromFrameId: event.target.value})}>{pixelDocument.frames.map((frame, index) => <option value={frame.id} key={frame.id}>{index + preferences.timeline.firstFrame}</option>)}</select></label>
            <label className="dialog-field"><span>{ui.loopEnd}</span><select value={tagDialog.toFrameId} onChange={(event) => setTagDialog({...tagDialog, toFrameId: event.target.value})}>{pixelDocument.frames.map((frame, index) => <option value={frame.id} key={frame.id}>{index + preferences.timeline.firstFrame}</option>)}</select></label>
            <label className="dialog-field"><span>{ui.direction}</span><select value={tagDialog.direction} onChange={(event) => setTagDialog({...tagDialog, direction: event.target.value as TagDirection})}><option value="forward">{ui.forward}</option><option value="reverse">{ui.reverse}</option><option value="pingpong">{ui.pingpong}</option></select></label>
            <label className="dialog-field"><span>{ui.repeatCount}</span><input type="number" min="0" max="65535" value={tagDialog.repeat} onChange={(event) => setTagDialog({...tagDialog, repeat: Math.max(0, Math.min(65535, Math.round(Number(event.target.value) || 0)))})} /></label>
            <label className="dialog-color-field"><span>{ui.color}</span><input type="color" value={tagDialog.color} onChange={(event) => setTagDialog({...tagDialog, color: event.target.value})} /></label>
          </div>
          <div className="dialog-actions"><button type="button" onClick={() => setTagDialog(null)}>{ui.cancel}</button><button type="submit" disabled={!tagDialog.name.trim()}>{ui.apply}</button></div>
        </form>
      </div>}

      {celPropertiesDialog && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog" role="dialog" aria-modal="true" aria-labelledby="cel-properties-title" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setCelPropertiesDialog(null); } }} onSubmit={(event) => {
          event.preventDefault();
          const update = {opacity: celPropertiesDialog.opacity === "" ? undefined : Number(celPropertiesDialog.opacity) / 100, zIndex: celPropertiesDialog.zIndex === "" ? undefined : Number(celPropertiesDialog.zIndex)};
          mutateDocument("Change Cel Properties", () => {
            let changed = false;
            for (const {layerId, frameId} of celPropertiesDialog.addresses) changed = setCelProperties(pixelDocument, layerId, frameId, update) || changed;
            return changed;
          });
          setCelPropertiesDialog(null);
        }}>
          <h2 id="cel-properties-title">{language === "zh" ? "动画格属性" : "Cel properties"}</h2>
          <p className="dialog-hint">{language === "zh" ? `编辑 ${celPropertiesDialog.addresses.length} 个动画格。留空表示保持各自的值。` : `Editing ${celPropertiesDialog.addresses.length} cels. Leave a field empty to keep individual values.`}</p>
          <div className="dialog-field-grid">
            <label className="dialog-field"><span>{language === "zh" ? "不透明度 (%)" : "Opacity (%)"}</span><input type="number" autoFocus min="0" max="100" step="any" value={celPropertiesDialog.opacity} onChange={(event) => setCelPropertiesDialog({...celPropertiesDialog, opacity: event.target.value})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "叠放偏移" : "Z-index"}</span><input type="number" min="-32768" max="32767" step="1" value={celPropertiesDialog.zIndex} onChange={(event) => setCelPropertiesDialog({...celPropertiesDialog, zIndex: event.target.value})} /></label>
          </div>
          <p className="dialog-hint">{language === "zh" ? "正值向上叠放，负值向下叠放；限制在当前图层组内。链接动画格的属性独立。" : "Positive values raise the cel; negative values lower it within its layer group. Linked cels keep independent properties."}</p>
          <div className="dialog-actions"><button type="button" onClick={() => setCelPropertiesDialog(null)}>{ui.cancel}</button><button type="submit">{ui.apply}</button></div>
        </form>
      </div>}

      {adjustmentDialog && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog adjustment-dialog" role="dialog" aria-modal="true" aria-label={language === "zh" ? "颜色调整" : "Color adjustment"} onSubmit={(event) => { event.preventDefault(); applyAdjustment(); }}>
          <h2>{adjustmentDialog.kind === "brightness-contrast" ? (language === "zh" ? "亮度 / 对比度" : "Brightness / Contrast")
            : adjustmentDialog.kind === "hsl" ? (language === "zh" ? "色相 / 饱和度 / 明度" : "Hue / Saturation / Lightness")
              : adjustmentDialog.kind === "invert" ? (language === "zh" ? "反相" : "Invert")
                : adjustmentDialog.kind === "convolution" ? (language === "zh" ? "卷积滤镜" : "Convolution filter")
                  : adjustmentDialog.kind === "median" ? (language === "zh" ? "中值滤波" : "Median filter")
                    : adjustmentDialog.kind === "despeckle" ? (language === "zh" ? "去斑" : "Despeckle")
                      : adjustmentDialog.kind === "curves" ? (language === "zh" ? "颜色曲线" : "Color curves")
                        : adjustmentDialog.kind === "hsv-hsl" ? (language === "zh" ? "HSV / HSL 调整" : "HSV / HSL adjustment")
                          : adjustmentDialog.kind === "outline" ? (language === "zh" ? "轮廓效果" : "Outline effect")
                            : (language === "zh" ? "通道掩码" : "Channel mask")}</h2>
          <div className="adjustment-common">
            <label className="dialog-field"><span>{language === "zh" ? "作用范围" : "Apply to"}</span><select value={adjustmentDialog.scope} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, scope: event.target.value as AdjustmentTargetScope})}>
              <option value="active">{language === "zh" ? "当前动画格" : "Active cel"}</option>
              <option value="selected" disabled={selectedCels.length === 0}>{language === "zh" ? `选中的动画格 (${selectedCels.length})` : `Selected cels (${selectedCels.length})`}</option>
              <option value="all">{language === "zh" ? "全部可编辑图像动画格" : "All editable image cels"}</option>
            </select></label>
            <div className="adjustment-channel-block">
              <span className="adjustment-label">{adjustmentDialog.kind === "channel-mask" ? (language === "zh" ? "保留通道" : "Keep channels") : (language === "zh" ? "处理通道" : "Channels")}</span>
              <div className="adjustment-channel-grid">
                {([['red', 'R'], ['green', 'G'], ['blue', 'B'], ['alpha', 'A']] as const).map(([key, label]) => <label className="dialog-checkbox" key={key}><input type="checkbox" checked={adjustmentDialog.channelValues[key]} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, channelValues: {...adjustmentDialog.channelValues, [key]: event.target.checked}})} />{label}</label>)}
              </div>
            </div>
            {adjustmentDialog.scope !== "active" && selection && <p className="adjustment-note">{language === "zh" ? "选区仅应用于当前动画格；批量范围将处理每个动画格的完整像素。" : "The selection applies to the active cel only; batch scopes process each cel completely."}</p>}
          </div>
          {adjustmentDialog.kind === "outline" && <div className="outline-options">
            <div className="dialog-field-grid">
              <label className="dialog-field"><span>{language === "zh" ? "位置" : "Position"}</span><select value={adjustmentDialog.outlinePosition} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, outlinePosition: event.target.value as "inside" | "outside"})}><option value="outside">{language === "zh" ? "外侧" : "Outside"}</option><option value="inside">{language === "zh" ? "内侧" : "Inside"}</option></select></label>
              <label className="dialog-field"><span>{language === "zh" ? "厚度" : "Thickness"}</span><input type="number" min="1" max="32" value={adjustmentDialog.outlineThickness} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, outlineThickness: Math.max(1, Math.min(32, Math.round(Number(event.target.value) || 1)))})} /></label>
              <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "形状" : "Shape"}</span><select value={adjustmentDialog.outlineShape} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, outlineShape: event.target.value as OutlineShape})}><option value="square">{language === "zh" ? "方形" : "Square"}</option><option value="diamond">{language === "zh" ? "菱形" : "Diamond"}</option><option value="circle">{language === "zh" ? "圆形" : "Circle"}</option></select></label>
              <label className="dialog-checkbox"><input type="checkbox" checked={adjustmentDialog.outlineTileX} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, outlineTileX: event.target.checked})} />{language === "zh" ? "水平平铺" : "Tile horizontally"}</label>
              <label className="dialog-checkbox"><input type="checkbox" checked={adjustmentDialog.outlineTileY} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, outlineTileY: event.target.checked})} />{language === "zh" ? "垂直平铺" : "Tile vertically"}</label>
            </div>
            <div className="outline-directions" role="group" aria-label={language === "zh" ? "描边方向" : "Outline directions"}>
              {([['nw', '↖'], ['n', '↑'], ['ne', '↗'], ['w', '←'], ['', '•'], ['e', '→'], ['sw', '↙'], ['s', '↓'], ['se', '↘']] as const).map(([direction, arrow]) => direction ? <button type="button" className="panel-command" key={direction} aria-label={`${language === "zh" ? "描边方向" : "Outline direction"} ${direction.toUpperCase()}`} aria-pressed={adjustmentDialog.outlineDirections.includes(direction)} onClick={() => setAdjustmentDialog({...adjustmentDialog, outlineDirections: adjustmentDialog.outlineDirections.includes(direction) ? adjustmentDialog.outlineDirections.filter((entry) => entry !== direction) : [...adjustmentDialog.outlineDirections, direction]})}>{arrow}</button> : <span key="center" aria-hidden="true">{arrow}</span>)}
            </div>
            <p className="adjustment-note">{language === "zh" ? "使用当前前景色。预览仅显示当前动画格，批量范围在应用时处理。" : "Uses the foreground color. Preview shows only the active cel; batch scope is processed on Apply."}</p>
            <button type="button" className="panel-command" disabled={!activeCel || !activeLayer || !isEditableImageLayer(activeLayer) || isLayerEffectivelyLocked(pixelDocument, activeLayer)} onClick={() => {
              if (!activeCel) return;
              try {
                const previewCel = renderOutlineAdjustment(activeCel);
                setOutlinePreview({before: rasterizeOutlineCel(pixelDocument, activeCel), after: rasterizeOutlineCel(pixelDocument, previewCel), width: pixelDocument.width, height: pixelDocument.height});
              } catch (error) {
                setStatus(language === "zh" ? "描边后的动画格尺寸超过 2048 像素，无法生成预览" : error instanceof Error ? error.message : "Could not preview outline");
              }
            }}>{language === "zh" ? "生成预览" : "Generate preview"}</button>
            {outlinePreview && <div className="outline-preview-pair">
              <figure><LayerThumbnail pixels={outlinePreview.before} width={outlinePreview.width} height={outlinePreview.height} revision={0} visible ariaLabel={language === "zh" ? "描边前" : "Before outline"} size={144} /><figcaption>{language === "zh" ? "之前" : "Before"}</figcaption></figure>
              <figure><LayerThumbnail pixels={outlinePreview.after} width={outlinePreview.width} height={outlinePreview.height} revision={0} visible ariaLabel={language === "zh" ? "描边后预览" : "Outline preview"} size={144} /><figcaption>{language === "zh" ? "预览" : "Preview"}</figcaption></figure>
            </div>}
          </div>}
          {adjustmentDialog.kind === "brightness-contrast" && <div className="dialog-field-grid">
            <label className="dialog-field"><span>{language === "zh" ? "亮度" : "Brightness"}</span><input type="number" min="-100" max="100" value={adjustmentDialog.brightness} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, brightness: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "对比度" : "Contrast"}</span><input type="number" min="-100" max="100" value={adjustmentDialog.contrast} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, contrast: Number(event.target.value) || 0})} /></label>
          </div>}
          {adjustmentDialog.kind === "hsl" && <div className="dialog-field-grid">
            <label className="dialog-field"><span>{language === "zh" ? "色相" : "Hue"}</span><input type="number" min="-360" max="360" value={adjustmentDialog.hue} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, hue: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "饱和度" : "Saturation"}</span><input type="number" min="-100" max="100" value={adjustmentDialog.saturation} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, saturation: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "明度" : "Lightness"}</span><input type="number" min="-100" max="100" value={adjustmentDialog.lightness} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, lightness: Number(event.target.value) || 0})} /></label>
          </div>}
          {adjustmentDialog.kind === "convolution" && <div className="dialog-field-grid">
            <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "预设" : "Preset"}</span><select value={adjustmentDialog.convolutionPreset} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, convolutionPreset: event.target.value as AdjustmentConvolutionPreset})}>
              <option value="blur">{language === "zh" ? "柔化 / 模糊" : "Blur"}</option><option value="sharpen">{language === "zh" ? "锐化" : "Sharpen"}</option><option value="edge">{language === "zh" ? "边缘" : "Edge"}</option><option value="emboss">{language === "zh" ? "浮雕" : "Emboss"}</option><option value="custom">{language === "zh" ? "自定义（恒等）" : "Custom (identity)"}</option>
            </select></label>
          </div>}
          {(adjustmentDialog.kind === "median" || adjustmentDialog.kind === "despeckle") && <div className="dialog-field-grid">
            <label className="dialog-field"><span>{language === "zh" ? "窗口" : "Window"}</span><select value={adjustmentDialog.medianSize} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, medianSize: Number(event.target.value) === 5 ? 5 : 3})}><option value={3}>3 × 3</option><option value={5}>5 × 5</option></select></label>
            <label className="dialog-field"><span>{language === "zh" ? "阈值" : "Threshold"}</span><input type="number" min="0" max="255" value={adjustmentDialog.medianThreshold} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, medianThreshold: Math.max(0, Math.min(255, Number(event.target.value) || 0))})} /></label>
          </div>}
          {adjustmentDialog.kind === "curves" && <div className="curve-adjustment-grid">
            <label className="dialog-field"><span>{language === "zh" ? "曲线通道" : "Curve channel"}</span><select value={adjustmentDialog.curveChannel} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, curveChannel: event.target.value as AdjustmentCurveChannel})}><option value="red">R</option><option value="green">G</option><option value="blue">B</option><option value="alpha">A</option></select></label>
            <CurveEditor key={adjustmentDialog.curveChannel} language={language} points={adjustmentDialog.curvePoints[adjustmentDialog.curveChannel]} onChange={(points) => setAdjustmentDialog((current) => current && ({...current, curvePoints: {...current.curvePoints, [current.curveChannel]: points}, channelValues: {...current.channelValues, [current.curveChannel]: true}}))} />
          </div>}
          {adjustmentDialog.kind === "hsv-hsl" && <div className="dialog-field-grid">
            <label className="dialog-field"><span>{language === "zh" ? "色彩空间" : "Color space"}</span><select value={adjustmentDialog.hsvSpace} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, hsvSpace: event.target.value as "hsv" | "hsl"})}><option value="hsv">HSV</option><option value="hsl">HSL</option></select></label>
            <label className="dialog-field"><span>{language === "zh" ? "模式" : "Mode"}</span><select value={adjustmentDialog.hsvMode} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, hsvMode: event.target.value as "relative" | "absolute"})}><option value="relative">{language === "zh" ? "相对" : "Relative"}</option><option value="absolute">{language === "zh" ? "绝对" : "Absolute"}</option></select></label>
            <label className="dialog-field"><span>{language === "zh" ? "色相" : "Hue"}</span><input type="number" min={adjustmentDialog.hsvMode === "absolute" ? 0 : -360} max="360" value={adjustmentDialog.hue} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, hue: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "饱和度" : "Saturation"}</span><input type="number" min={adjustmentDialog.hsvMode === "absolute" ? 0 : -100} max="100" value={adjustmentDialog.saturation} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, saturation: Number(event.target.value) || 0})} /></label>
            {adjustmentDialog.hsvSpace === "hsv" ? <label className="dialog-field"><span>Value</span><input type="number" min={adjustmentDialog.hsvMode === "absolute" ? 0 : -100} max="100" value={adjustmentDialog.value} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, value: Number(event.target.value) || 0})} /></label> : <label className="dialog-field"><span>{language === "zh" ? "明度" : "Lightness"}</span><input type="number" min={adjustmentDialog.hsvMode === "absolute" ? 0 : -100} max="100" value={adjustmentDialog.lightness} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, lightness: Number(event.target.value) || 0})} /></label>}
          </div>}
          <div className="dialog-actions"><button type="button" onClick={() => setAdjustmentDialog(null)}>{ui.cancel}</button><button type="submit" disabled={adjustmentDialog.scope === "selected" && selectedCels.length === 0}>{ui.apply}</button></div>
        </form>
      </div>}

      {spriteImportDialog && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog" role="dialog" aria-modal="true" aria-label={language === "zh" ? "导入精灵表" : "Import sprite sheet"} onSubmit={(event) => { event.preventDefault(); applySpriteSheetImport(); }}>
          <h2>{language === "zh" ? "导入精灵表" : "Import sprite sheet"}</h2>
          <div className="dialog-field-grid">
            <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "排列方式" : "Layout"}</span><select value={spriteImportDialog.layout} onChange={(event) => setSpriteImportDialog({...spriteImportDialog, layout: event.target.value as SpriteSheetImportLayout})}><option value="horizontal">{language === "zh" ? "横向" : "Horizontal"}</option><option value="vertical">{language === "zh" ? "纵向" : "Vertical"}</option><option value="matrix">{language === "zh" ? "矩阵" : "Matrix"}</option></select></label>
            <label className="dialog-field"><span>{language === "zh" ? "帧宽" : "Frame width"}</span><input type="number" min="1" max={spriteImportDialog.image.width} value={spriteImportDialog.frameWidth} onChange={(event) => setSpriteImportDialog({...spriteImportDialog, frameWidth: Number(event.target.value) || 1})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "帧高" : "Frame height"}</span><input type="number" min="1" max={spriteImportDialog.image.height} value={spriteImportDialog.frameHeight} onChange={(event) => setSpriteImportDialog({...spriteImportDialog, frameHeight: Number(event.target.value) || 1})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "水平偏移" : "Offset X"}</span><input type="number" min="0" max={spriteImportDialog.image.width - 1} value={spriteImportDialog.offsetX} onChange={(event) => setSpriteImportDialog({...spriteImportDialog, offsetX: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "垂直偏移" : "Offset Y"}</span><input type="number" min="0" max={spriteImportDialog.image.height - 1} value={spriteImportDialog.offsetY} onChange={(event) => setSpriteImportDialog({...spriteImportDialog, offsetY: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "水平间距" : "Padding X"}</span><input type="number" min="0" max="2048" value={spriteImportDialog.paddingX} onChange={(event) => setSpriteImportDialog({...spriteImportDialog, paddingX: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "垂直间距" : "Padding Y"}</span><input type="number" min="0" max="2048" value={spriteImportDialog.paddingY} onChange={(event) => setSpriteImportDialog({...spriteImportDialog, paddingY: Number(event.target.value) || 0})} /></label>
          </div>
          <div className="dialog-actions"><button type="button" onClick={() => setSpriteImportDialog(null)}>{ui.cancel}</button><button type="submit">{language === "zh" ? "导入" : "Import"}</button></div>
        </form>
      </div>}

      {exportDialog && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog export-dialog" role="dialog" aria-modal="true" aria-label={ui.exportOptions} onSubmit={(event) => { event.preventDefault(); void exportAnimation(exportDialog); }}>
          <h2>{exportDialog === "png" ? ui.exportPNG : exportDialog === "gif" ? ui.exportGIF : ui.exportSpriteSheet}</h2>
          <div className="dialog-field-grid">
            {exportDialog !== "png" && <>
              <label className="dialog-field"><span>{ui.frameRange}</span><select value={exportFrameRange} onChange={(event) => setExportFrameRange(event.target.value as "all" | "selected" | "loop")}><option value="all">{ui.allFrames}</option><option value="selected">{ui.selectedFrames}</option><option value="loop">{ui.loopRange}</option></select></label>
              <label className="dialog-field"><span>{ui.direction}</span><select value={exportDirection} onChange={(event) => setExportDirection(event.target.value as TagDirection)}><option value="forward">{ui.forward}</option><option value="reverse">{ui.reverse}</option><option value="pingpong">{ui.pingpong}</option></select></label>
              <label className="dialog-field"><span>{ui.scale}</span><select value={exportScale} onChange={(event) => setExportScale(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8].map((scale) => <option value={scale} key={scale}>{scale}×</option>)}</select></label>
            </>}
            <label className="dialog-checkbox dialog-field-wide"><input type="checkbox" checked={exportApplyPixelRatio} onChange={(event) => setExportApplyPixelRatio(event.target.checked)} /><span>{ui.applyPixelRatio} ({pixelDocument.pixelAspectRatio.width}:{pixelDocument.pixelAspectRatio.height})</span></label>
            {exportDialog === "gif" ? <>
              <label className="dialog-field"><span>{ui.playback}</span><select value={gifLoopMode} onChange={(event) => setGifLoopMode(event.target.value as "once" | "forever" | "count")}><option value="once">{ui.once}</option><option value="forever">{ui.forever}</option><option value="count">{ui.repeatCount}</option></select></label>
              {gifLoopMode === "count" && <label className="dialog-field"><span>{ui.repeatCount}</span><input type="number" min="1" max="65535" value={gifLoopCount} onChange={(event) => setGifLoopCount(Number(event.target.value))} /></label>}
            </> : exportDialog === "sheet" ? <>
              <label className="dialog-field"><span>{ui.layout}</span><select value={sheetLayout} onChange={(event) => setSheetLayout(event.target.value as SpriteSheetLayout)}><option value="horizontal">{ui.sheetHorizontal}</option><option value="vertical">{ui.sheetVertical}</option><option value="grid">{ui.sheetGrid}</option></select></label>
              {sheetLayout === "grid" && <label className="dialog-field"><span>{ui.columns}</span><input type="number" min="1" max="65535" value={sheetColumns} onChange={(event) => setSheetColumns(Math.max(1, Math.round(Number(event.target.value) || 1)))} /></label>}
              <label className="dialog-field"><span>{ui.borderPadding}</span><input type="number" min="0" max="2048" value={sheetBorderPadding} onChange={(event) => setSheetBorderPadding(Math.max(0, Math.round(Number(event.target.value) || 0)))} /></label>
              <label className="dialog-field"><span>{ui.framePadding}</span><input type="number" min="0" max="2048" value={sheetFramePadding} onChange={(event) => setSheetFramePadding(Math.max(0, Math.round(Number(event.target.value) || 0)))} /></label>
              <label className="dialog-field"><span>{language === "zh" ? "拆分" : "Split by"}</span><select value={sheetSplitBy} disabled={sheetPacked} onChange={(event) => setSheetSplitBy(event.target.value as "none" | "tag" | "layer")}><option value="none">{language === "zh" ? "不拆分" : "None"}</option><option value="tag">{language === "zh" ? "帧标签" : "Frame tag"}</option><option value="layer">{language === "zh" ? "图层" : "Layer"}</option></select></label>
              <label className="dialog-checkbox dialog-field-wide"><input type="checkbox" checked={sheetPacked} onChange={(event) => { setSheetPacked(event.target.checked); if (event.target.checked) setSheetSplitBy("none"); }} /><span>{language === "zh" ? "裁切透明边缘并紧凑打包" : "Trim transparency and pack atlas"}</span></label>
              <label className="dialog-checkbox dialog-field-wide"><input type="checkbox" checked={sheetAtlasJSON} onChange={(event) => setSheetAtlasJSON(event.target.checked)} /><span>{ui.atlasJSON}</span></label>
            </> : null}
          </div>
          <div className="dialog-actions"><button type="button" onClick={() => setExportDialog(null)}>{ui.cancel}</button><button type="submit">{ui.export}</button></div>
        </form>
      </div>}

      {crossDocumentCopyDialog && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog" role="dialog" aria-modal="true" aria-label={crossDocumentCopyDialog.mode === "layers" ? (language === "zh" ? "复制图层到其他文件" : "Copy layers to another document") : (language === "zh" ? "复制帧到其他文件" : "Copy frames to another document")} onSubmit={(event) => { event.preventDefault(); applyCrossDocumentCopy(); }}>
          <h2>{crossDocumentCopyDialog.mode === "layers" ? (language === "zh" ? "复制所选图层到其他文件" : "Copy selected layers to another document") : (language === "zh" ? "复制所选帧到其他文件" : "Copy selected frames to another document")}</h2>
          <p className="dialog-note">{crossDocumentCopyDialog.mode === "layers"
            ? (language === "zh"
              ? `将复制 ${crossDocumentCopyDialog.layerIds.length} 个图层及其动画格、链接、索引和图块资源。目标文件必须使用相同画布尺寸、颜色模式和帧数量。`
              : `Copies ${crossDocumentCopyDialog.layerIds.length} layer(s) with their cels, links, indexes and tilemap resources. The target must use the same canvas size, color mode and frame count.`)
            : (language === "zh"
              ? `将复制 ${crossDocumentCopyDialog.frameIds.length} 个帧及其图层、动画格、标签和切片。目标文件必须使用相同画布尺寸与颜色模式。`
              : `Copies ${crossDocumentCopyDialog.frameIds.length} frame(s) with their layers, cels, tags and slices. The target must use the same canvas size and color mode.`)}</p>
          <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "目标文件" : "Target document"}</span><select value={crossDocumentCopyDialog.targetTabId} onChange={(event) => setCrossDocumentCopyDialog({...crossDocumentCopyDialog, targetTabId: event.target.value})}>
            {tabs.filter((tab) => tab.id !== crossDocumentCopyDialog.sourceTabId).map((tab) => {
              const sourceTab = tabs.find((candidate) => candidate.id === crossDocumentCopyDialog.sourceTabId);
              const compatible = Boolean(sourceTab && (crossDocumentCopyDialog.mode === "layers"
                ? canCopyLayersToDocument(sourceTab.document, tab.document)
                : canCopyFramesToDocument(sourceTab.document, tab.document)));
              const incompatibility = crossDocumentCopyDialog.mode === "layers"
                ? (language === "zh" ? "（尺寸/模式/帧数不兼容）" : " (incompatible size/mode/frame count)")
                : (language === "zh" ? "（尺寸/模式不兼容）" : " (incompatible)");
              return <option key={tab.id} value={tab.id} disabled={!compatible}>{displayProjectName(tab.document.name)} · {tab.document.width}×{tab.document.height} · {tab.document.colorMode}{compatible ? "" : incompatibility}</option>;
            })}
          </select></label>
          <div className="dialog-actions"><button type="button" onClick={() => setCrossDocumentCopyDialog(null)}>{ui.cancel}</button><button type="submit" disabled={!tabs.some((tab) => {
            if (tab.id !== crossDocumentCopyDialog.targetTabId || tab.id === crossDocumentCopyDialog.sourceTabId) return false;
            const sourceTab = tabs.find((candidate) => candidate.id === crossDocumentCopyDialog.sourceTabId);
            return Boolean(sourceTab && (crossDocumentCopyDialog.mode === "layers"
              ? canCopyLayersToDocument(sourceTab.document, tab.document)
              : canCopyFramesToDocument(sourceTab.document, tab.document)));
          })}>{ui.apply}</button></div>
        </form>
      </div>}

      {canvasDialog && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog" role="dialog" aria-modal="true" aria-label={canvasDialog === "new" ? ui.newDocument : canvasDialog === "sprite-size" ? (language === "zh" ? "缩放图像内容" : "Sprite size") : ui.resizeCanvas} noValidate onSubmit={(event) => { event.preventDefault(); applyCanvasDialog(); }}>
          <h2>{canvasDialog === "new" ? ui.newDocument : canvasDialog === "sprite-size" ? (language === "zh" ? "缩放图像内容" : "Sprite size") : ui.resizeCanvas}</h2>
          <div className="canvas-size-fields">
            <label>{ui.width}<input type="number" min="1" max="2048" value={canvasWidthDraft} autoFocus onChange={(event) => { setCanvasWidthDraft(Number(event.target.value)); setCanvasSizeError(false); }} /></label>
            <span>×</span>
            <label>{ui.height}<input type="number" min="1" max="2048" value={canvasHeightDraft} onChange={(event) => { setCanvasHeightDraft(Number(event.target.value)); setCanvasSizeError(false); }} /></label>
          </div>
          {canvasDialog === "new" && <><label className="new-document-color-mode">{ui.colorMode}<select value={newDocumentColorMode} onChange={(event) => setNewDocumentColorMode(event.target.value as ColorMode)}><option value="rgba">{ui.rgbaMode}</option><option value="grayscale">{ui.grayscaleMode}</option><option value="indexed">{ui.indexedMode}</option></select></label><label className="new-document-color-mode">{language === "zh" ? "背景" : "Background"}<select value={newDocumentBackground} onChange={(event) => setNewDocumentBackground(event.target.value as "transparent" | "foreground" | "background")}><option value="transparent">{language === "zh" ? "透明" : "Transparent"}</option><option value="foreground">{language === "zh" ? "前景色" : "Foreground color"}</option><option value="background">{language === "zh" ? "背景色" : "Background color"}</option></select></label></>}
          {canvasDialog === "resize" && <div className="anchor-fields">
            <label>{ui.horizontal}<select value={horizontalAnchor} onChange={(event) => setHorizontalAnchor(event.target.value as "left" | "center" | "right")}><option value="left">{ui.left}</option><option value="center">{ui.center}</option><option value="right">{ui.right}</option></select></label>
            <label>{ui.vertical}<select value={verticalAnchor} onChange={(event) => setVerticalAnchor(event.target.value as "top" | "center" | "bottom")}><option value="top">{ui.top}</option><option value="center">{ui.center}</option><option value="bottom">{ui.bottom}</option></select></label>
          </div>}
          {canvasSizeError && <p className="canvas-size-error">{ui.sizeError}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={() => setCanvasDialog(null)}>{ui.cancel}</button>
            <button type="submit">{canvasDialog === "new" ? ui.create : ui.apply}</button>
          </div>
        </form>
      </div>}

      {colorProfileDialog && <div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog color-profile-dialog" role="dialog" aria-modal="true" aria-label={language === "zh" ? "颜色配置" : "Color configuration"} onSubmit={(event) => { event.preventDefault(); applyColorProfileDialog(); }}>
          <h2>{language === "zh" ? "颜色配置" : "Color configuration"}</h2>
          <p className="dialog-note">{language === "zh" ? `当前：${pixelDocument.colorProfile.name}` : `Current: ${pixelDocument.colorProfile.name}`}</p>
          <div className="dialog-field-grid">
            <label className="dialog-field"><span>{language === "zh" ? "操作" : "Operation"}</span><select value={colorProfileAction} onChange={(event) => setColorProfileAction(event.target.value as "assign" | "convert")}><option value="assign">{language === "zh" ? "分配（不改像素）" : "Assign (keep values)"}</option><option value="convert" disabled={pixelDocument.colorProfile.type === "embedded" || pixelDocument.colorProfile.type === "none"}>{language === "zh" ? "转换（保留外观）" : "Convert (preserve appearance)"}</option></select></label>
            <label className="dialog-field"><span>{language === "zh" ? "目标配置" : "Target profile"}</span><select value={colorProfileTarget} onChange={(event) => setColorProfileTarget(event.target.value as ConvertibleColorProfile)}><option value="srgb">sRGB</option><option value="display-p3">Display P3</option></select></label>
            <label className="dialog-field"><span>{language === "zh" ? "像素宽高比" : "Pixel aspect width"}</span><input type="number" min="1" max="64" value={pixelAspectWidthDraft} onChange={(event) => setPixelAspectWidthDraft(Number(event.target.value) || 1)} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "像素高宽比" : "Pixel aspect height"}</span><input type="number" min="1" max="64" value={pixelAspectHeightDraft} onChange={(event) => setPixelAspectHeightDraft(Number(event.target.value) || 1)} /></label>
          </div>
          <button className="panel-command" type="button" onClick={() => void importEmbeddedProfile()}>{language === "zh" ? "嵌入并分配 ICC 文件" : "Embed and assign ICC file"}</button>
          <div className="dialog-actions"><button type="button" onClick={() => setColorProfileDialog(false)}>{ui.cancel}</button><button type="submit">{ui.apply}</button></div>
        </form>
      </div>}

      {hasOpenDocument && <footer className="statusbar">
        <span>{localizeStatus(status, language)}</span>
        <span ref={cursorOutputRef}>{cursor ? `${cursor.x}, ${cursor.y}` : "-, -"}</span>
        <button className="canvas-size-button" type="button" title={ui.resizeCanvas} onClick={openResizeDialog}>{pixelDocument.width} × {pixelDocument.height}</button>
        <div className="zoom-control">
          <button onClick={() => changeZoom(-1)} title={ui.zoomOut}><Minus size={14} /></button>
          <span>{zoom * 100}%</span>
          <button onClick={() => changeZoom(1)} title={ui.zoomIn}><Plus size={14} /></button>
        </div>
      </footer>}
    </div>
  );
}

export default App;
