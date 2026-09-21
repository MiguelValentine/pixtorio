import {useMemo, useState} from "react";
import type {Tileset} from "./document";
import {LayerThumbnail} from "./LayerThumbnail";
import {generateTerrainPreviews} from "./terrainPreview";

interface TerrainPreviewPanelProps {
  tileset: Tileset;
  terrainId: number;
  revision: number;
  seed: number;
  language: "en" | "zh";
  palette?: readonly string[];
  transparentIndex?: number;
}

const labels = {
  island: {en: "Island", zh: "孤岛"},
  edge: {en: "Edge", zh: "边缘"},
  "outer-corner": {en: "Outer corner", zh: "外转角"},
  "inner-corner": {en: "Inner corner", zh: "内转角"},
  channel: {en: "Channel", zh: "通道"},
  closed: {en: "Closed area", zh: "封闭区域"},
};

export function TerrainPreviewPanel({
  tileset, terrainId, revision, seed, language, palette, transparentIndex,
}: TerrainPreviewPanelProps) {
  const [open, setOpen] = useState(true);
  const result = useMemo(() => {
    if (!open) return {scenes: [], failed: false};
    try {
      return {scenes: generateTerrainPreviews(tileset, terrainId, {seed, palette, transparentIndex}), failed: false};
    } catch {
      return {scenes: [], failed: true};
    }
  }, [tileset, terrainId, revision, seed, palette, transparentIndex, open]);

  return <details className="terrain-scene-previews" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{language === "zh" ? "场景预览" : "Scene previews"}</summary>
    {result.failed
      ? <p role="status">{language === "zh" ? "预览不可用：图块尺寸超限或规则无效。" : "Preview unavailable: tile size limit or invalid rules."}</p>
      : <div className="terrain-scene-grid">
        {result.scenes.map((scene) => <figure key={scene.kind}>
          <LayerThumbnail
            pixels={scene.pixels}
            width={scene.width}
            height={scene.height}
            revision={revision}
            visible
            ariaLabel={labels[scene.kind][language]}
            size={72}
          />
          <figcaption>{labels[scene.kind][language]}</figcaption>
        </figure>)}
      </div>}
  </details>;
}
