import type {Dispatch, SetStateAction} from "react";
import {CurveEditor} from "../CurveEditor";
import type {AdjustmentConvolutionPreset, AdjustmentCurveChannel, AdjustmentDialogState, AdjustmentTargetScope} from "./adjustmentState";
import {labels, type Language} from "./localization";
import {LayerThumbnail} from "../editor/LayerThumbnail";
import type {OutlineShape} from "../editor/effects";

interface AdjustmentDialogProps {
  adjustmentDialog: AdjustmentDialogState;
  setAdjustmentDialog: Dispatch<SetStateAction<AdjustmentDialogState | null>>;
  language: Language;
  selectedCelCount: number;
  hasSelection: boolean;
  canPreviewOutline: boolean;
  previewOutline: () => void;
  outlinePreview: {before: Uint8ClampedArray; after: Uint8ClampedArray; width: number; height: number} | null;
  applyAdjustment: () => void;
}

export function AdjustmentDialog({adjustmentDialog, setAdjustmentDialog, language, selectedCelCount, hasSelection, canPreviewOutline, previewOutline, outlinePreview, applyAdjustment}: AdjustmentDialogProps) {
  const ui = labels[language];
  return (<div className="dialog-backdrop" role="presentation">
        <form className="canvas-dialog editor-dialog adjustment-dialog" role="dialog" aria-modal="true" aria-label={language === "zh" ? "颜色调整" : "Color adjustment"} onSubmit={(event) => { event.preventDefault(); applyAdjustment(); }}>
          <h2>{adjustmentDialog.kind === "brightness-contrast" ? (language === "zh" ? "亮度 / 对比度" : "Brightness / Contrast")
            : adjustmentDialog.kind === "hsl" ? (language === "zh" ? "色相 / 饱和度 / 明度" : "Hue / Saturation / Lightness")
              : adjustmentDialog.kind === "invert" ? (language === "zh" ? "反相" : "Invert")
                : adjustmentDialog.kind === "convolution" ? (language === "zh" ? "卷积滤镜" : "Convolution filter")
                  : adjustmentDialog.kind === "median" ? (language === "zh" ? "中值滤波" : "Median filter")
                    : adjustmentDialog.kind === "despeckle" ? (language === "zh" ? "去斑" : "Despeckle")
                      : adjustmentDialog.kind === "curves" ? (language === "zh" ? "颜色曲线" : "Color curves")
                        : adjustmentDialog.kind === "hsv-hsl" ? (language === "zh" ? "HSV / HSL 调整" : "HSV / HSL adjustment")
                          : adjustmentDialog.kind === "outline" ? (language === "zh" ? "轮廓效果" : "Outline effect")
                            : (language === "zh" ? "通道掩码" : "Channel mask")}</h2>
          <div className="adjustment-common">
            <label className="dialog-field"><span>{language === "zh" ? "作用范围" : "Apply to"}</span><select value={adjustmentDialog.scope} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, scope: event.target.value as AdjustmentTargetScope})}>
              <option value="active">{language === "zh" ? "当前动画格" : "Active cel"}</option>
              <option value="selected" disabled={selectedCelCount === 0}>{language === "zh" ? `选中的动画格 (${selectedCelCount})` : `Selected cels (${selectedCelCount})`}</option>
              <option value="all">{language === "zh" ? "全部可编辑图像动画格" : "All editable image cels"}</option>
            </select></label>
            <div className="adjustment-channel-block">
              <span className="adjustment-label">{adjustmentDialog.kind === "channel-mask" ? (language === "zh" ? "保留通道" : "Keep channels") : (language === "zh" ? "处理通道" : "Channels")}</span>
              <div className="adjustment-channel-grid">
                {([['red', 'R'], ['green', 'G'], ['blue', 'B'], ['alpha', 'A']] as const).map(([key, label]) => <label className="dialog-checkbox" key={key}><input type="checkbox" checked={adjustmentDialog.channelValues[key]} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, channelValues: {...adjustmentDialog.channelValues, [key]: event.target.checked}})} />{label}</label>)}
              </div>
            </div>
            {adjustmentDialog.scope !== "active" && hasSelection && <p className="adjustment-note">{language === "zh" ? "选区仅应用于当前动画格；批量范围将处理每个动画格的完整像素。" : "The selection applies to the active cel only; batch scopes process each cel completely."}</p>}
          </div>
          {adjustmentDialog.kind === "outline" && <div className="outline-options">
            <div className="dialog-field-grid">
              <label className="dialog-field"><span>{language === "zh" ? "位置" : "Position"}</span><select value={adjustmentDialog.outlinePosition} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, outlinePosition: event.target.value as "inside" | "outside"})}><option value="outside">{language === "zh" ? "外侧" : "Outside"}</option><option value="inside">{language === "zh" ? "内侧" : "Inside"}</option></select></label>
              <label className="dialog-field"><span>{language === "zh" ? "厚度" : "Thickness"}</span><input type="number" min="1" max="32" value={adjustmentDialog.outlineThickness} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, outlineThickness: Math.max(1, Math.min(32, Math.round(Number(event.target.value) || 1)))})} /></label>
              <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "形状" : "Shape"}</span><select value={adjustmentDialog.outlineShape} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, outlineShape: event.target.value as OutlineShape})}><option value="square">{language === "zh" ? "方形" : "Square"}</option><option value="diamond">{language === "zh" ? "菱形" : "Diamond"}</option><option value="circle">{language === "zh" ? "圆形" : "Circle"}</option></select></label>
              <label className="dialog-checkbox"><input type="checkbox" checked={adjustmentDialog.outlineTileX} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, outlineTileX: event.target.checked})} />{language === "zh" ? "水平平铺" : "Tile horizontally"}</label>
              <label className="dialog-checkbox"><input type="checkbox" checked={adjustmentDialog.outlineTileY} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, outlineTileY: event.target.checked})} />{language === "zh" ? "垂直平铺" : "Tile vertically"}</label>
            </div>
            <div className="outline-directions" role="group" aria-label={language === "zh" ? "描边方向" : "Outline directions"}>
              {([['nw', '↖'], ['n', '↑'], ['ne', '↗'], ['w', '←'], ['', '•'], ['e', '→'], ['sw', '↙'], ['s', '↓'], ['se', '↘']] as const).map(([direction, arrow]) => direction ? <button type="button" className="panel-command" key={direction} aria-label={`${language === "zh" ? "描边方向" : "Outline direction"} ${direction.toUpperCase()}`} aria-pressed={adjustmentDialog.outlineDirections.includes(direction)} onClick={() => setAdjustmentDialog({...adjustmentDialog, outlineDirections: adjustmentDialog.outlineDirections.includes(direction) ? adjustmentDialog.outlineDirections.filter((entry) => entry !== direction) : [...adjustmentDialog.outlineDirections, direction]})}>{arrow}</button> : <span key="center" aria-hidden="true">{arrow}</span>)}
            </div>
            <p className="adjustment-note">{language === "zh" ? "使用当前前景色。预览仅显示当前动画格，批量范围在应用时处理。" : "Uses the foreground color. Preview shows only the active cel; batch scope is processed on Apply."}</p>
            <button type="button" className="panel-command" disabled={!canPreviewOutline} onClick={previewOutline}>{language === "zh" ? "生成预览" : "Generate preview"}</button>
            {outlinePreview && <div className="outline-preview-pair">
              <figure><LayerThumbnail pixels={outlinePreview.before} width={outlinePreview.width} height={outlinePreview.height} revision={0} visible ariaLabel={language === "zh" ? "描边前" : "Before outline"} size={144} /><figcaption>{language === "zh" ? "之前" : "Before"}</figcaption></figure>
              <figure><LayerThumbnail pixels={outlinePreview.after} width={outlinePreview.width} height={outlinePreview.height} revision={0} visible ariaLabel={language === "zh" ? "描边后预览" : "Outline preview"} size={144} /><figcaption>{language === "zh" ? "预览" : "Preview"}</figcaption></figure>
            </div>}
          </div>}
          {adjustmentDialog.kind === "brightness-contrast" && <div className="dialog-field-grid">
            <label className="dialog-field"><span>{language === "zh" ? "亮度" : "Brightness"}</span><input type="number" min="-100" max="100" value={adjustmentDialog.brightness} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, brightness: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "对比度" : "Contrast"}</span><input type="number" min="-100" max="100" value={adjustmentDialog.contrast} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, contrast: Number(event.target.value) || 0})} /></label>
          </div>}
          {adjustmentDialog.kind === "hsl" && <div className="dialog-field-grid">
            <label className="dialog-field"><span>{language === "zh" ? "色相" : "Hue"}</span><input type="number" min="-360" max="360" value={adjustmentDialog.hue} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, hue: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "饱和度" : "Saturation"}</span><input type="number" min="-100" max="100" value={adjustmentDialog.saturation} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, saturation: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "明度" : "Lightness"}</span><input type="number" min="-100" max="100" value={adjustmentDialog.lightness} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, lightness: Number(event.target.value) || 0})} /></label>
          </div>}
          {adjustmentDialog.kind === "convolution" && <div className="dialog-field-grid">
            <label className="dialog-field dialog-field-wide"><span>{language === "zh" ? "预设" : "Preset"}</span><select value={adjustmentDialog.convolutionPreset} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, convolutionPreset: event.target.value as AdjustmentConvolutionPreset})}>
              <option value="blur">{language === "zh" ? "柔化 / 模糊" : "Blur"}</option><option value="sharpen">{language === "zh" ? "锐化" : "Sharpen"}</option><option value="edge">{language === "zh" ? "边缘" : "Edge"}</option><option value="emboss">{language === "zh" ? "浮雕" : "Emboss"}</option><option value="custom">{language === "zh" ? "自定义（恒等）" : "Custom (identity)"}</option>
            </select></label>
          </div>}
          {(adjustmentDialog.kind === "median" || adjustmentDialog.kind === "despeckle") && <div className="dialog-field-grid">
            <label className="dialog-field"><span>{language === "zh" ? "窗口" : "Window"}</span><select value={adjustmentDialog.medianSize} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, medianSize: Number(event.target.value) === 5 ? 5 : 3})}><option value={3}>3 × 3</option><option value={5}>5 × 5</option></select></label>
            <label className="dialog-field"><span>{language === "zh" ? "阈值" : "Threshold"}</span><input type="number" min="0" max="255" value={adjustmentDialog.medianThreshold} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, medianThreshold: Math.max(0, Math.min(255, Number(event.target.value) || 0))})} /></label>
          </div>}
          {adjustmentDialog.kind === "curves" && <div className="curve-adjustment-grid">
            <label className="dialog-field"><span>{language === "zh" ? "曲线通道" : "Curve channel"}</span><select value={adjustmentDialog.curveChannel} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, curveChannel: event.target.value as AdjustmentCurveChannel})}><option value="red">R</option><option value="green">G</option><option value="blue">B</option><option value="alpha">A</option></select></label>
            <CurveEditor key={adjustmentDialog.curveChannel} language={language} points={adjustmentDialog.curvePoints[adjustmentDialog.curveChannel]} onChange={(points) => setAdjustmentDialog((current) => current && ({...current, curvePoints: {...current.curvePoints, [current.curveChannel]: points}, channelValues: {...current.channelValues, [current.curveChannel]: true}}))} />
          </div>}
          {adjustmentDialog.kind === "hsv-hsl" && <div className="dialog-field-grid">
            <label className="dialog-field"><span>{language === "zh" ? "色彩空间" : "Color space"}</span><select value={adjustmentDialog.hsvSpace} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, hsvSpace: event.target.value as "hsv" | "hsl"})}><option value="hsv">HSV</option><option value="hsl">HSL</option></select></label>
            <label className="dialog-field"><span>{language === "zh" ? "模式" : "Mode"}</span><select value={adjustmentDialog.hsvMode} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, hsvMode: event.target.value as "relative" | "absolute"})}><option value="relative">{language === "zh" ? "相对" : "Relative"}</option><option value="absolute">{language === "zh" ? "绝对" : "Absolute"}</option></select></label>
            <label className="dialog-field"><span>{language === "zh" ? "色相" : "Hue"}</span><input type="number" min={adjustmentDialog.hsvMode === "absolute" ? 0 : -360} max="360" value={adjustmentDialog.hue} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, hue: Number(event.target.value) || 0})} /></label>
            <label className="dialog-field"><span>{language === "zh" ? "饱和度" : "Saturation"}</span><input type="number" min={adjustmentDialog.hsvMode === "absolute" ? 0 : -100} max="100" value={adjustmentDialog.saturation} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, saturation: Number(event.target.value) || 0})} /></label>
            {adjustmentDialog.hsvSpace === "hsv" ? <label className="dialog-field"><span>Value</span><input type="number" min={adjustmentDialog.hsvMode === "absolute" ? 0 : -100} max="100" value={adjustmentDialog.value} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, value: Number(event.target.value) || 0})} /></label> : <label className="dialog-field"><span>{language === "zh" ? "明度" : "Lightness"}</span><input type="number" min={adjustmentDialog.hsvMode === "absolute" ? 0 : -100} max="100" value={adjustmentDialog.lightness} onChange={(event) => setAdjustmentDialog({...adjustmentDialog, lightness: Number(event.target.value) || 0})} /></label>}
          </div>}
          <div className="dialog-actions"><button type="button" onClick={() => setAdjustmentDialog(null)}>{ui.cancel}</button><button type="submit" disabled={adjustmentDialog.scope === "selected" && selectedCelCount === 0}>{ui.apply}</button></div>
        </form>
      </div>);
}
