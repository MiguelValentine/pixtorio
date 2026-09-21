import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {TerrainPreviewPanel} from "./TerrainPreviewPanel";
import {createTileset} from "./tilemap";

function fixture() {
  const tileset = createTileset({tileWidth: 2, tileHeight: 2, tiles: [
    {id: 1, pixels: new Uint8ClampedArray(16).fill(255)},
  ]});
  tileset.terrains = [{
    id: 1, name: "Grass", color: "#ffffffff", neighborMode: "edge4", boundary: "empty",
    rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
  }];
  return tileset;
}

describe("Terrain scene preview panel", () => {
  it("renders six bounded canvases and bilingual scene captions", () => {
    for (const language of ["en", "zh"] as const) {
      const html = renderToStaticMarkup(<TerrainPreviewPanel
        tileset={fixture()} terrainId={1} revision={0} seed={0} language={language}
      />);
      expect(html.match(/<canvas /g)).toHaveLength(6);
      expect(html.match(/width="72"/g)).toHaveLength(6);
      expect(html).toContain(language === "zh" ? "内转角" : "Inner corner");
      expect(html).toContain(language === "zh" ? "封闭区域" : "Closed area");
      expect(html).not.toContain('role="status"');
    }
  });

  it("contains preview failures without breaking the editor", () => {
    const html = renderToStaticMarkup(<TerrainPreviewPanel
      tileset={fixture()} terrainId={99} revision={0} seed={0} language="en"
    />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Preview unavailable");
    expect(html).not.toContain("<canvas");
  });
});
