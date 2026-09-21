import type {collectTilesetReferences} from "./tilesetReferences";

interface Props {
  references: ReturnType<typeof collectTilesetReferences>;
  language: "zh" | "en";
  firstFrame: number;
  onSelectLayer: (id: string) => void;
  onSelectCel: (layerId: string, frameId: string) => void;
  onSelectTerrain: (id: number) => void;
}

export function TilesetReferencesPanel({
  references, language, firstFrame, onSelectLayer, onSelectCel, onSelectTerrain,
}: Props) {
  const zh = language === "zh";
  const linkCounts = new Map<string, number>();
  for (const cel of references.cels) {
    linkCounts.set(cel.linkId, (linkCounts.get(cel.linkId) ?? 0) + 1);
  }
  return <details className="tileset-reference-details">
    <summary>{zh ? "引用明细" : "Reference details"}</summary>
    <div className="tileset-reference-list">
      <h3>{zh ? "图层" : "Layers"} ({references.layers.length})</h3>
      {references.layers.map((layer) => <button type="button" className="panel-command" key={layer.id}
        onClick={() => onSelectLayer(layer.id)} title={layer.name}>{layer.name}</button>)}
      <h3>Cels ({references.cels.length})</h3>
      {references.cels.map((cel) => {
        const label = `${cel.layerName} · ${zh ? "帧" : "Frame"} ${cel.frameIndex + firstFrame}`;
        return <button type="button" className="panel-command" key={cel.id}
          onClick={() => onSelectCel(cel.layerId, cel.frameId)} title={label}>
          <span>{label}</span>
          {(linkCounts.get(cel.linkId) ?? 0) > 1 && <small>{zh ? "链接" : "Linked"}</small>}
        </button>;
      })}
      <h3>Terrain ({references.terrains.length})</h3>
      {references.terrains.map((terrain) => <button type="button" className="panel-command" key={terrain.id}
        onClick={() => onSelectTerrain(terrain.id)} title={`${terrain.name} (#${terrain.id})`}>
        <span>{terrain.name} (#{terrain.id})</span>
        <small>{terrain.ruleCount} {zh ? "规则" : "rules"} · {terrain.candidateCount} {zh ? "候选" : "candidates"}</small>
      </button>)}
    </div>
  </details>;
}
