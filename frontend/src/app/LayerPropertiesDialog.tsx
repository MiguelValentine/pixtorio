import type {Dispatch, SetStateAction} from "react";
import type {BlendMode, LayerRole} from "../editor/document";
import {allBlendModes, blendModeText, labels, layerRoleText, type Language} from "./localization";

export type TriStateProperty = "keep" | "on" | "off";

export type LayerRoleProperty = "keep" | LayerRole;

export interface LayerPropertiesDialogState {
  layerIds: string[];
  name: string;
  opacity: string;
  blendMode: "keep" | BlendMode;
  role: LayerRoleProperty;
  visible: TriStateProperty;
  locked: TriStateProperty;
  alphaLock: TriStateProperty;
  continuous: TriStateProperty;
}

interface LayerPropertiesDialogProps {
  layerPropertiesDialog: LayerPropertiesDialogState;
  setLayerPropertiesDialog: Dispatch<SetStateAction<LayerPropertiesDialogState | null>>;
  language: Language;
  applyLayerPropertiesDialog: () => void;
}

export function LayerPropertiesDialog({layerPropertiesDialog, setLayerPropertiesDialog, language, applyLayerPropertiesDialog}: LayerPropertiesDialogProps) {
  const ui = labels[language];
  return (<div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog" role="dialog" aria-modal="true" aria-labelledby="layer-properties-title" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setLayerPropertiesDialog(null); } }} onSubmit={(event) => { event.preventDefault(); applyLayerPropertiesDialog(); }}>
          <h2 id="layer-properties-title">{language === "zh" ? "图层属性" : "Layer properties"}</h2>
          <p className="dialog-hint">{language === "zh" ? `编辑 ${layerPropertiesDialog.layerIds.length} 个图层。空值或“保持”表示保留原值。` : `Editing ${layerPropertiesDialog.layerIds.length} layers. Empty fields or “Keep” preserve each value.`}</p>
          <div className="dialog-field-grid">
            <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "名称（仅单个图层）" : "Name (single layer only)"}</span><input type="text" autoFocus value={layerPropertiesDialog.name} disabled={layerPropertiesDialog.layerIds.length !== 1} placeholder={language === "zh" ? "保持原名称" : "Keep current name"} onChange={(event) => setLayerPropertiesDialog({...layerPropertiesDialog, name: event.target.value})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "不透明度 (%)" : "Opacity (%)"}</span><input type="number" min="0" max="100" step="any" value={layerPropertiesDialog.opacity} placeholder="Keep" onChange={(event) => setLayerPropertiesDialog({...layerPropertiesDialog, opacity: event.target.value})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "混合模式" : "Blend mode"}</span><select value={layerPropertiesDialog.blendMode} onChange={(event) => setLayerPropertiesDialog({...layerPropertiesDialog, blendMode: event.target.value as LayerPropertiesDialogState["blendMode"]})}><option value="keep">{language === "zh" ? "保持" : "Keep"}</option>{allBlendModes.map((mode) => <option value={mode} key={mode}>{blendModeText[language][mode]}</option>)}</select></label>
            <label className="dialog-field"><span>{language === "zh" ? "角色" : "Role"}</span><select value={layerPropertiesDialog.role} onChange={(event) => setLayerPropertiesDialog({...layerPropertiesDialog, role: event.target.value as LayerRoleProperty})}><option value="keep">{language === "zh" ? "保持" : "Keep"}</option>{(["standard", "background", "reference"] as LayerRole[]).map((role) => <option value={role} key={role}>{layerRoleText[language][role]}</option>)}</select></label>
            {(["visible", "locked", "alphaLock", "continuous"] as const).map((property) => {
              const labelsByProperty = {
                visible: language === "zh" ? "可见" : "Visible",
                locked: language === "zh" ? "锁定" : "Locked",
                alphaLock: language === "zh" ? "锁定透明度" : "Alpha lock",
                continuous: language === "zh" ? "连续动画格" : "Continuous",
              };
              return <label className="dialog-field" key={property}><span>{labelsByProperty[property]}</span><select value={layerPropertiesDialog[property]} onChange={(event) => setLayerPropertiesDialog({...layerPropertiesDialog, [property]: event.target.value as TriStateProperty})}><option value="keep">{language === "zh" ? "保持" : "Keep"}</option><option value="on">{language === "zh" ? "开启" : "On"}</option><option value="off">{language === "zh" ? "关闭" : "Off"}</option></select></label>;
            })}
          </div>
          <div className="dialog-actions"><button type="button" onClick={() => setLayerPropertiesDialog(null)}>{ui.cancel}</button><button type="submit">{ui.apply}</button></div>
        </form>
      </div>);
}
