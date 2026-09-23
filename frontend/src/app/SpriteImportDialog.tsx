import type {Dispatch, SetStateAction} from "react";
import {PNGResponse} from "../app/bridgeResponses";
import {Language, labels} from "../app/localization";
import {type SpriteSheetImportLayout} from "../editor/gameAssets";
export interface SpriteImportDialogState {
  image: PNGResponse;
  frameWidth: number;
  frameHeight: number;
  layout: SpriteSheetImportLayout;
  offsetX: number;
  offsetY: number;
  paddingX: number;
  paddingY: number;
}

interface SpriteImportDialogProps {
  spriteImportDialog: SpriteImportDialogState;
  setSpriteImportDialog: Dispatch<SetStateAction<SpriteImportDialogState | null>>;
  language: Language;
  applySpriteSheetImport: () => void;
}

export function SpriteImportDialog({spriteImportDialog, setSpriteImportDialog, language, applySpriteSheetImport}: SpriteImportDialogProps) {
  const ui = labels[language];
  return (<div className="dialog-backdrop" role="presentation">
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
      </div>);
}
