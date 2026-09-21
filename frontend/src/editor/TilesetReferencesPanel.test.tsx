import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {TilesetReferencesPanel} from "./TilesetReferencesPanel";

describe("Tileset reference details", () => {
  const references = {
    layers: [{id: "layer", name: "Shared tiles"}],
    cels: [
      {id: "a", layerId: "layer", layerName: "Shared tiles", frameId: "f1", frameIndex: 0, linkId: "link"},
      {id: "b", layerId: "layer", layerName: "Shared tiles", frameId: "f2", frameIndex: 1, linkId: "link"},
    ],
    terrains: [{id: 7, name: "Grass", ruleCount: 16, candidateCount: 18}],
  };
  const noop = () => {};

  it("lists each linked instance, terrain identity and configured frame numbering in both languages", () => {
    for (const language of ["en", "zh"] as const) {
      const html = renderToStaticMarkup(<TilesetReferencesPanel references={references}
        language={language} firstFrame={12} onSelectLayer={noop} onSelectCel={noop} onSelectTerrain={noop} />);
      expect(html).toContain(language === "zh" ? "引用明细" : "Reference details");
      expect(html).toContain(`${language === "zh" ? "帧" : "Frame"} 12`);
      expect(html).toContain(`${language === "zh" ? "帧" : "Frame"} 13`);
      expect(html).toContain("Grass (#7)");
      expect(html).toContain(language === "zh" ? "16 规则" : "16 rules");
      expect(html.match(/<button /g)).toHaveLength(4);
      expect(html.match(/<small>Linked|<small>链接/g)).toHaveLength(2);
    }
  });

  it("renders empty sections without inventing references", () => {
    const html = renderToStaticMarkup(<TilesetReferencesPanel
      references={{layers: [], cels: [], terrains: []}} language="en" firstFrame={0}
      onSelectLayer={noop} onSelectCel={noop} onSelectTerrain={noop} />);
    expect(html).toContain("Layers (0)");
    expect(html).toContain("Cels (0)");
    expect(html).toContain("Terrain (0)");
    expect(html).not.toContain("<button");
  });

  it("does not label a single-instance link ID as a linked Cel", () => {
    const html = renderToStaticMarkup(<TilesetReferencesPanel
      references={{...references, cels: [references.cels[0]]}} language="en" firstFrame={0}
      onSelectLayer={noop} onSelectCel={noop} onSelectTerrain={noop} />);
    expect(html).toContain("Frame 0");
    expect(html).not.toContain("Linked");
  });
});
