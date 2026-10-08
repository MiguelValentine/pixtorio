import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import appSource from "./App.tsx?raw";
import {CollapsiblePanelSection} from "./CollapsiblePanelSection";

function render(collapsed: boolean) {
  return renderToStaticMarkup(createElement(CollapsiblePanelSection, {
    id: "canvas-aids",
    title: "Canvas aids",
    collapsed,
    onToggle: () => undefined,
    headerActions: createElement("span", null, "Action"),
    children: createElement("label", null, "Pixel grid"),
  }));
}

describe("CollapsiblePanelSection", () => {
  it("exposes the expanded state and visible content", () => {
    const markup = render(false);
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-controls="panel-section-canvas-aids"');
    expect(markup).toContain('id="panel-section-canvas-aids"');
    expect(markup).not.toContain('id="panel-section-canvas-aids" class="collapsible-panel-body" hidden=""');
  });

  it("keeps actions available while hiding collapsed content", () => {
    const markup = render(true);
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('class="collapsible-panel-actions"');
    expect(markup).toContain('id="panel-section-canvas-aids" class="collapsible-panel-body" hidden=""');
  });

  it("wraps every inspector tool block with an independent collapse id", () => {
    for (const id of ["color", "tilemap", "tool-move", "tool-text", "tool-slice", "tool-gradient", "tool-selection", "tool-transform", "cel-transform", "canvas-aids"]) {
      expect(appSource).toContain(`id="${id}"`);
      expect(appSource).toContain(`collapsedInspectorSections.has("${id}")`);
    }
    expect(appSource).toContain('id={`tool-${selectedTool}`}');
    expect(appSource).toContain('collapsedInspectorSections.has(`tool-${selectedTool}`)');
  });
});
