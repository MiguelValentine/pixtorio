import {describe, expect, it, vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";

import {TerrainMaskEditor, terrainMaskPreviewLabel} from "./TerrainMaskEditor";

describe("TerrainMaskEditor previews", () => {
  it("isolates native button activation from playback and canvas shortcuts", () => {
    const editor = TerrainMaskEditor({mode: "edge6", value: 0, language: "en", onChange: () => {}});
    const button = editor.props.children[0].props.children[0][0];
    for (const handler of [button.props.onKeyDown, button.props.onKeyUp]) {
      for (const key of ["Enter", " "]) {
        const stopPropagation = vi.fn();
        const preventDefault = vi.fn();
        handler({key, stopPropagation, preventDefault});
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(preventDefault).not.toHaveBeenCalled();
      }
      const stopPropagation = vi.fn();
      handler({key: "Tab", stopPropagation});
      expect(stopPropagation).not.toHaveBeenCalled();
    }
  });

  it("uses logical isometric directions and orientation-specific hex directions without changing bit values", () => {
    for (const props of [
      {mode: "edge4", gridKind: "isometric", hexOrientation: "pointy", labels: ["N", "E", "S", "W"]},
      {mode: "edge6", gridKind: "hexagonal", hexOrientation: "pointy", labels: ["E", "NE", "NW", "W", "SW", "SE"]},
      {mode: "edge6", gridKind: "hexagonal", hexOrientation: "flat", labels: ["SE", "NE", "N", "NW", "SW", "S"]},
    ] as const) {
      let next = -1;
      const editor = TerrainMaskEditor({...props, value: 0, language: "en", onChange: (value) => { next = value; }});
      const buttons = editor.props.children[0].props.children[0];
      expect(buttons).toHaveLength(props.labels.length);
      props.labels.forEach((label, bit) => {
        expect(buttons[bit].props["aria-label"]).toBe(label);
        expect(buttons[bit].props.style.clipPath).toContain("polygon(");
        buttons[bit].props.onClick();
        expect(next).toBe(1 << bit);
      });
    }
  });

  it("renders six derived hex corner states and native keyboard-operable direction buttons", () => {
    for (const hexOrientation of ["pointy", "flat"] as const) {
      for (const language of ["en", "zh"] as const) {
        const html = renderToStaticMarkup(<TerrainMaskEditor mode="edge6" gridKind="hexagonal"
          hexOrientation={hexOrientation} value={63} language={language} onChange={() => {}} />);
        expect(html.match(/type="button"/g)).toHaveLength(6);
        expect(html.match(/aria-pressed="true"/g)).toHaveLength(6);
        expect(html.match(/class="terrain-mask-corner is-active"/g)).toHaveLength(6);
        expect(html).toContain(language === "zh" ? "连接" : "connected");
      }
    }
  });

  it("enables the edges supporting a clicked Blob corner and clears unsupported corners", () => {
    let next = -1;
    const editor = TerrainMaskEditor({mode: "blob8", value: 0, language: "en", onChange: (value) => { next = value; }});
    editor.props.children[0].props.children[0].find((button: {props: {"aria-label": string}}) => button.props["aria-label"] === "NE").props.onClick();
    expect(next).toBe(7);
    const withCorner = TerrainMaskEditor({mode: "blob8", value: 7, language: "en", onChange: (value) => { next = value; }});
    withCorner.props.children[0].props.children[0].find((button: {props: {"aria-label": string}}) => button.props["aria-label"] === "N").props.onClick();
    expect(next).toBe(4);
  });

  it("classifies island, edge, corner, channel, junction, and closed masks live", () => {
    expect(terrainMaskPreviewLabel("edge4", 0, "en")).toBe("Island");
    expect(terrainMaskPreviewLabel("edge4", 1, "en")).toBe("Edge");
    expect(terrainMaskPreviewLabel("edge4", 3, "en")).toBe("Corner");
    expect(terrainMaskPreviewLabel("edge4", 5, "en")).toBe("Channel");
    expect(terrainMaskPreviewLabel("edge4", 7, "en")).toBe("Junction");
    expect(terrainMaskPreviewLabel("edge4", 15, "en")).toBe("Closed");
    expect(terrainMaskPreviewLabel("edge6", 0b001001, "zh")).toBe("通道");
    expect(terrainMaskPreviewLabel("edge6", 0b111111, "zh")).toBe("封闭");
    expect(terrainMaskPreviewLabel("blob8", 0b00010001, "en")).toBe("Channel");
    expect(terrainMaskPreviewLabel("blob8", 7, "en")).toBe("Corner");
    expect(terrainMaskPreviewLabel("blob8", 255, "en")).toBe("Closed");
    expect(terrainMaskPreviewLabel("blob8", 2, "en")).toBe("Island");
  });
});
