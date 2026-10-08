import {describe, expect, it} from "vitest";
import appSource from "./App.tsx?raw";
import {isEditableTarget} from "./keyboardTargets";

function target(nodeName: string, isContentEditable = false) {
  return {nodeName, isContentEditable} as unknown as EventTarget;
}

describe("global shortcut editable-target guard", () => {
  it.each(["INPUT", "TEXTAREA", "SELECT"])("recognizes %s as editable", (nodeName) => {
    expect(isEditableTarget(target(nodeName))).toBe(true);
  });

  it("recognizes contenteditable targets as editable", () => {
    expect(isEditableTarget(target("DIV", true))).toBe(true);
  });

  it("does not block canvas shortcuts for non-editable targets", () => {
    expect(isEditableTarget(target("CANVAS"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("opaque selection command wiring", () => {
  it("uses document-aware opaque content selection for the panel action", () => {
    const start = appSource.indexOf("const selectOpaqueContent = () =>");
    const end = appSource.indexOf("const selectLayerOpaqueContent", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const source = appSource.slice(start, end);

    expect(source).toContain("layerOpaqueContentSelection(pixelDocument, pixelDocument.activeLayerId, pixelDocument.activeFrameId)");
    expect(source).toContain("combineSelections(selection, next, selectionOperation)");
    expect(source).not.toContain("selectOpaquePixels(activeCel.pixels");
  });

  it("routes the keyboard command through the same action", () => {
    const dispatchStart = appSource.indexOf("const dispatchCommandShortcut");
    const dispatchEnd = appSource.indexOf("useEffect(() =>", dispatchStart);
    const dispatchSource = appSource.slice(dispatchStart, dispatchEnd);
    expect(dispatchSource).toContain('case "selectOpaque": selectOpaqueContent(); return;');
  });
});

describe("color mode menu wiring", () => {
  it("keeps color mode conversion in the Edit menu instead of the color panel", () => {
    const editMenuStart = appSource.indexOf('aria-label={language === "zh" ? "编辑" : "Edit"}');
    const spriteMenuStart = appSource.indexOf('ref={spriteMenuRef}', editMenuStart);
    const editMenuSource = appSource.slice(editMenuStart, spriteMenuStart);
    const colorPanelStart = appSource.indexOf('id="color"');
    const colorPanelEnd = appSource.indexOf('</CollapsiblePanelSection>', colorPanelStart);
    const colorPanelSource = appSource.slice(colorPanelStart, colorPanelEnd);

    for (const command of ["setRGBA", "setGrayscale", "setIndexed", "setBitmap"]) {
      expect(editMenuSource).toContain(`dispatchCommandShortcut("${command}")`);
    }
    expect(editMenuSource).toContain('role="menuitemradio"');
    expect(colorPanelSource).not.toContain('aria-label={ui.colorMode}');
    expect(colorPanelSource).not.toContain('changeColorMode(event.target.value as ColorMode)');
  });
});
