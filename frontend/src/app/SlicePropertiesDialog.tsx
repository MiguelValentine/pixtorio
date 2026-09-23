import type {Dispatch, SetStateAction} from "react";
import type {PixelDocument} from "../editor/document";
import {labels, type Language} from "./localization";

export interface SlicePropertiesDialogState {
  sliceId: string;
  frameId: string;
  name: string;
  color: string;
  x: string;
  y: string;
  width: string;
  height: string;
  centerX: string;
  centerY: string;
  centerWidth: string;
  centerHeight: string;
  pivotX: string;
  pivotY: string;
}

interface SlicePropertiesDialogProps {
  slicePropertiesDialog: SlicePropertiesDialogState;
  setSlicePropertiesDialog: Dispatch<SetStateAction<SlicePropertiesDialogState | null>>;
  language: Language;
  pixelDocument: PixelDocument;
  firstFrame: number;
  openSliceProperties: (sliceId: string, frameId: string) => void;
  applySlicePropertiesDialog: () => void;
}

export function SlicePropertiesDialog({slicePropertiesDialog, setSlicePropertiesDialog, language, pixelDocument, firstFrame, openSliceProperties, applySlicePropertiesDialog}: SlicePropertiesDialogProps) {
  const ui = labels[language];
  return (<div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog" role="dialog" aria-modal="true" aria-labelledby="slice-properties-title" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setSlicePropertiesDialog(null); } }} onSubmit={(event) => { event.preventDefault(); applySlicePropertiesDialog(); }}>
          <h2 id="slice-properties-title">{language === "zh" ? "切片属性" : "Slice Properties"}</h2>
          <div className="dialog-field-grid">
            <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "名称" : "Name"}</span><input type="text" autoFocus value={slicePropertiesDialog.name} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, name: event.target.value})} /></label>
            <label className="dialog-color-field"><span>{language === "zh" ? "颜色" : "Color"}</span><input type="color" value={slicePropertiesDialog.color} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, color: event.target.value})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "关键帧" : "Key frame"}</span><select value={slicePropertiesDialog.frameId} onChange={(event) => openSliceProperties(slicePropertiesDialog.sliceId, event.target.value)}>{pixelDocument.frames.map((frame, index) => slicePropertiesDialog.sliceId && pixelDocument.slices.find((slice) => slice.id === slicePropertiesDialog.sliceId)?.keys.some((key) => key.frameId === frame.id) ? <option value={frame.id} key={frame.id}>{index + firstFrame}</option> : null)}</select></label>
            <label className="dialog-field"><span>X</span><input type="number" value={slicePropertiesDialog.x} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, x: event.target.value})} /></label>
            <label className="dialog-field"><span>Y</span><input type="number" value={slicePropertiesDialog.y} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, y: event.target.value})} /></label>
            <label className="dialog-field"><span>{ui.width}</span><input type="number" min="1" value={slicePropertiesDialog.width} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, width: event.target.value})} /></label>
            <label className="dialog-field"><span>{ui.height}</span><input type="number" min="1" value={slicePropertiesDialog.height} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, height: event.target.value})} /></label>
          </div>
          <div className="panel-subheading"><span>{language === "zh" ? "九宫格中心（留空移除）" : "Nine-patch center (blank to remove)"}</span></div>
          <div className="dialog-field-grid">
            <label className="dialog-field"><span>X</span><input type="number" value={slicePropertiesDialog.centerX} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, centerX: event.target.value})} /></label>
            <label className="dialog-field"><span>Y</span><input type="number" value={slicePropertiesDialog.centerY} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, centerY: event.target.value})} /></label>
            <label className="dialog-field"><span>{ui.width}</span><input type="number" min="1" value={slicePropertiesDialog.centerWidth} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, centerWidth: event.target.value})} /></label>
            <label className="dialog-field"><span>{ui.height}</span><input type="number" min="1" value={slicePropertiesDialog.centerHeight} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, centerHeight: event.target.value})} /></label>
          </div>
          <div className="panel-subheading"><span>{language === "zh" ? "枢轴（留空移除）" : "Pivot (blank to remove)"}</span></div>
          <div className="dialog-field-grid">
            <label className="dialog-field"><span>X</span><input type="number" value={slicePropertiesDialog.pivotX} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, pivotX: event.target.value})} /></label>
            <label className="dialog-field"><span>Y</span><input type="number" value={slicePropertiesDialog.pivotY} onChange={(event) => setSlicePropertiesDialog({...slicePropertiesDialog, pivotY: event.target.value})} /></label>
          </div>
          <div className="dialog-actions"><button type="button" onClick={() => setSlicePropertiesDialog(null)}>{ui.cancel}</button><button type="submit">{ui.apply}</button></div>
        </form>
      </div>);
}
