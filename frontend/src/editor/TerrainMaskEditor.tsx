import {normalizeBlobMask, type TerrainNeighborMode} from "./terrain";
import {getTerrainMaskGeometry} from "./terrainMaskGeometry";
import type {HexOrientation, TilePoint} from "./tileGrid";
import type {KeyboardEvent} from "react";

interface TerrainMaskEditorProps {
  mode: TerrainNeighborMode;
  gridKind?: "orthogonal" | "isometric" | "hexagonal";
  hexOrientation?: HexOrientation;
  value: number;
  language: "en" | "zh";
  onChange(value: number): void;
}

function polygonStyle(polygon: readonly TilePoint[], width: number, height: number) {
  const x = Math.min(...polygon.map((point) => point.x));
  const y = Math.min(...polygon.map((point) => point.y));
  const w = Math.max(...polygon.map((point) => point.x)) - x;
  const h = Math.max(...polygon.map((point) => point.y)) - y;
  return {
    left: `${x / width * 100}%`, top: `${y / height * 100}%`,
    width: `${w / width * 100}%`, height: `${h / height * 100}%`,
    clipPath: `polygon(${polygon.map((point) =>
      `${((point.x - x) / w * 100 - 50) * 0.9 + 50}% ${((point.y - y) / h * 100 - 50) * 0.9 + 50}%`).join(", ")})`,
  };
}

function isolateButtonActivation(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
}

export function terrainMaskPreviewLabel(mode: TerrainNeighborMode, value: number, language: "en" | "zh") {
  const directions = mode === "edge6" ? 6 : mode === "blob8" ? 8 : 4;
  const maximum = (1 << directions) - 1;
  const mask = mode === "blob8" ? normalizeBlobMask(value & maximum) : value & maximum;
  const count = Array.from({length: directions}, (_, bit) => mode === "blob8" && bit % 2 === 1 ? 0 : (mask >> bit) & 1)
    .reduce((sum, bit) => sum + bit, 0);
  const label = count === 0
    ? ["Island", "孤岛"]
    : mask === maximum
      ? ["Closed", "封闭"]
      : isOppositeChannel(mode, mask)
        ? ["Channel", "通道"]
        : count === 1
          ? ["Edge", "边缘"]
          : count === 2
            ? ["Corner", "转角"]
            : ["Junction", "连接"];
  return label[language === "zh" ? 1 : 0];
}

function isOppositeChannel(mode: TerrainNeighborMode, mask: number) {
  if (mode === "edge4") return mask === 0b0101 || mask === 0b1010;
  if (mode === "edge6") return mask === 0b001001 || mask === 0b010010 || mask === 0b100100;
  if (mode === "blob8") return mask === 0b00010001 || mask === 0b01000100;
  return false;
}

export function TerrainMaskEditor({mode, gridKind = "orthogonal", hexOrientation = "pointy", value, language, onChange}: TerrainMaskEditorProps) {
  const geometry = getTerrainMaskGeometry(mode, gridKind, hexOrientation);
  const toggle = (bit: number) => {
    let next = (value ^ (1 << bit)) >>> 0;
    if (mode === "blob8") {
      if (bit % 2 === 1 && (next & (1 << bit)) !== 0) {
        next |= (1 << (bit - 1)) | (1 << ((bit + 1) % 8));
      }
      next = normalizeBlobMask(next);
    }
    onChange(next);
  };
  return <div className={`terrain-mask-editor is-${mode} is-${gridKind}`} role="group" aria-label={language === "zh" ? "地形邻域掩码" : "Terrain neighbor mask"}>
    <div className="terrain-mask-diagram" style={{aspectRatio: `${geometry.width} / ${geometry.height}`}}>
    {geometry.entries.map((entry) => <button
      type="button"
      key={entry.label}
      className={(value & (1 << entry.bit)) !== 0 ? "is-active" : ""}
      aria-pressed={(value & (1 << entry.bit)) !== 0}
      aria-label={entry.label}
      title={entry.label}
      style={polygonStyle(entry.polygon, geometry.width, geometry.height)}
      onClick={() => toggle(entry.bit)}
      onKeyDown={isolateButtonActivation}
      onKeyUp={isolateButtonActivation}
    >{entry.label}</button>)}
    <span className="terrain-mask-center" style={polygonStyle(geometry.center, geometry.width, geometry.height)} />
    {geometry.corners.map(({point, bits}, corner) => <i
      key={corner}
      className={`terrain-mask-corner${bits.every((bit) => (value & (1 << bit)) !== 0) ? " is-active" : ""}`}
      style={{left: `${point.x / geometry.width * 100}%`, top: `${point.y / geometry.height * 100}%`}}
      role="img"
      aria-label={`${language === "zh" ? "角" : "Corner"} ${bits.map((bit) => geometry.entries[bit].label).join(" / ")}: ${bits.every((bit) => (value & (1 << bit)) !== 0) ? (language === "zh" ? "连接" : "connected") : (language === "zh" ? "开放" : "open")}`}
      title={`${language === "zh" ? "角" : "Corner"} ${bits.map((bit) => geometry.entries[bit].label).join(" / ")}`}
    />)}
    </div>
    <output className="terrain-mask-preview-label">{terrainMaskPreviewLabel(mode, value, language)}</output>
  </div>;
}
