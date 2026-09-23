import {describe, expect, it} from "vitest";
import appSource from "../App.tsx?raw";
import {commandShortcutLabels} from "../app/localization";
import {commandShortcutIDs, defaultCommandShortcuts} from "./shortcuts";

const dispatchSource = appSource.slice(appSource.indexOf("const dispatchCommandShortcut"), appSource.indexOf("useEffect(() =>", appSource.indexOf("const dispatchCommandShortcut")));

describe("command shortcut coverage", () => {
  it("keeps every command in the bilingual labels and dispatch switch", () => {
    for (const command of commandShortcutIDs) {
      expect(commandShortcutLabels.en[command], `${command} must have an English label`).toBeTruthy();
      expect(commandShortcutLabels.zh[command], `${command} must have a Chinese label`).toBeTruthy();
      expect(dispatchSource, `${command} must have a dispatch case`).toContain(`case "${command}"`);
      expect(defaultCommandShortcuts, `${command} must have a default assignment`).toHaveProperty(command);
    }
  });

  it("uses the same registry for preference editing", () => {
    expect(appSource).toContain("Object.keys(defaultCommandShortcuts)");
    expect(appSource).toContain("commandShortcutLabels[language][command]");
    expect(appSource).toContain("captureCommandShortcut(command, event)");
  });

  it("routes all top-level menu commands through the shared dispatcher", () => {
    const topLevelMenuCommands = [
      "new", "newFromSelection", "open", "importPNG", "importSpriteSheet", "importPNGSequence", "save", "saveAs",
      "exportPNG", "exportGIF", "exportSpriteSheet", "exportPNGSequence", "undo", "redo", "copy", "copyMerged", "cut", "paste",
      "pasteSpecialNewSprite", "pasteSpecialNewLayer", "pasteSpecialReferenceLayer", "fillSelection", "strokeSelection",
      "copySelectionToLayer", "cutSelectionToLayer", "selectAllLayerCels", "selectLinkedCels", "copySelectedFramesToDocument", "copySelectedLayersToDocument", "layerProperties",
      "shiftPixelsLeft", "shiftPixelsRight", "shiftPixelsUp", "shiftPixelsDown", "duplicateSprite", "addFrame", "newEmptyFrame",
      "previousFrame", "nextFrame", "spriteSize", "canvasSize", "trimCanvas", "adjustmentBrightnessContrast", "adjustmentHSL",
      "adjustmentInvert", "adjustmentConvolution", "adjustmentMedian", "adjustmentDespeckle", "adjustmentCurves", "adjustmentHSVHSL",
      "adjustmentChannels", "effectOutline", "effectShading", "rotateSpriteCW", "rotateSpriteCCW", "rotateSprite180",
      "flipSpriteHorizontal", "flipSpriteVertical", "colorConfiguration", "toggleInspector", "toggleTimeline", "togglePixelGrid",
      "toggleOnionSkin", "detachedPreview", "toggleCanvasOnly", "showAllPanels", "toggleFullscreen", "resetWorkspace",
    ] as const;
    for (const command of topLevelMenuCommands) expect(appSource, `${command} must be reachable through dispatchCommandShortcut`).toContain(`dispatchCommandShortcut("${command}")`);
  });
});
