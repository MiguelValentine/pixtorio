import {useState} from "react";
import {deleteBrushPreset, readBrushPresets, saveBrushPreset, type BrushPresetSettings} from "./editor/brushPresets";

export function BrushPresetPanel({settings, onApply, zh}: {settings: BrushPresetSettings; onApply: (settings: BrushPresetSettings) => void; zh: boolean}) {
  const [presets, setPresets] = useState(() => readBrushPresets(localStorage));
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const save = () => {
    try {
      setPresets(saveBrushPreset(localStorage, name, settings));
      setSelected(name.trim()); setName(name.trim()); setError("");
    } catch { setError(zh ? "无法保存笔刷预设，请检查名称或本地存储空间。" : "Could not save the brush preset. Check the name or local storage space."); }
  };
  return <details className="brush-presets">
    <summary>{zh ? "笔刷预设" : "Brush presets"}</summary>
    <div className="brush-preset-fields">
      <label className="compact-field"><span>{zh ? "预设" : "Preset"}</span><select value={selected} onChange={(event) => {setSelected(event.target.value); setName(event.target.value); setError("");}}>
        <option value="">{zh ? "选择预设" : "Choose preset"}</option>
        {presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
      </select></label>
      <div className="brush-preset-actions">
        <button type="button" disabled={!selected} onClick={() => {
          const preset = readBrushPresets(localStorage).find((item) => item.name === selected);
          if (preset) {onApply(preset.settings); setError("");}
          else {setPresets(readBrushPresets(localStorage)); setSelected("");}
        }}>{zh ? "应用" : "Apply"}</button>
        <button type="button" disabled={!selected} onClick={() => {
          try {setPresets(deleteBrushPreset(localStorage, selected)); setSelected(""); setName(""); setError("");}
          catch {setError(zh ? "无法删除笔刷预设。" : "Could not delete the brush preset.");}
        }}>{zh ? "删除" : "Delete"}</button>
      </div>
      <label className="compact-field"><span>{zh ? "名称" : "Name"}</span><input type="text" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button className="panel-command" type="button" disabled={!name.trim()} onClick={save}>{presets.some((preset) => preset.name === name.trim()) ? (zh ? "更新当前设置到预设" : "Update preset from settings") : (zh ? "保存当前设置为预设" : "Save current settings as preset")}</button>
      {error && <p className="brush-preset-error" role="status">{error}</p>}
    </div>
  </details>;
}
