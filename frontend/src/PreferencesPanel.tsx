import type {AppPreferences} from "./editor/preferences";

type PreferenceSection = Exclude<keyof AppPreferences, "version">;

export function PreferencesPanel({preferences, onChange, zh}: {
  preferences: AppPreferences;
  onChange: (preferences: AppPreferences) => void;
  zh: boolean;
}) {
  const patch = <K extends PreferenceSection>(section: K, value: Partial<AppPreferences[K]>) => {
    onChange({...preferences, [section]: {...preferences[section], ...value}});
  };
  const toggle = (section: PreferenceSection, key: string, label: string, checked: boolean) => (
    <label className="dialog-checkbox"><input type="checkbox" checked={checked} onChange={(event) => patch(section, {[key]: event.target.checked} as never)} />{label}</label>
  );

  return <div className="preferences-sections">
    <details open>
      <summary>{zh ? "常规" : "General"}</summary>
      <div className="preferences-section-body preferences-general">
        <label className="dialog-field"><span>{zh ? "界面主题" : "Theme"}</span><select value={preferences.general.theme} onChange={(event) => patch("general", {theme: event.target.value as AppPreferences["general"]["theme"]})}><option value="dark">{zh ? "深色" : "Dark"}</option><option value="light">{zh ? "浅色" : "Light"}</option></select></label>
        <label className="dialog-field"><span>{zh ? "界面语言" : "Language"}</span><select value={preferences.general.language} onChange={(event) => patch("general", {language: event.target.value as AppPreferences["general"]["language"]})}><option value="zh">中文</option><option value="en">English</option></select></label>
        <label className="dialog-field"><span>{zh ? "界面缩放" : "UI scale"}</span><select value={preferences.general.uiScale} onChange={(event) => patch("general", {uiScale: Number(event.target.value)})}>{[75, 100, 125, 150, 175, 200].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label>
        {toggle("general", "expandMenusOnHover", zh ? "悬停展开菜单" : "Expand menus on hover", preferences.general.expandMenusOnHover)}
        {toggle("general", "paletteSeparators", zh ? "显示调色板色块分隔" : "Separate palette entries", preferences.general.paletteSeparators)}
      </div>
    </details>

    <details>
      <summary>{zh ? "文件与恢复" : "Files & Recovery"}</summary>
      <div className="preferences-section-body preferences-general">
        {toggle("files", "autosaveEnabled", zh ? "启用恢复数据" : "Enable recovery data", preferences.files.autosaveEnabled)}
        <label className="dialog-field"><span>{zh ? "自动保存间隔（秒）" : "Autosave interval (sec)"}</span><input type="number" min="5" max="600" value={preferences.files.autosaveSeconds} onChange={(event) => patch("files", {autosaveSeconds: Math.max(5, Math.min(600, Math.round(Number(event.target.value) || 5)))})} /></label>
        <label className="dialog-field"><span>{zh ? "最近项目数量" : "Recent items"}</span><input type="number" min="0" max="50" value={preferences.files.recentItems} onChange={(event) => patch("files", {recentItems: Math.max(0, Math.min(50, Math.round(Number(event.target.value) || 0)))})} /></label>
      </div>
    </details>

    <details>
      <summary>{zh ? "颜色" : "Color"}</summary>
      <div className="preferences-section-body preferences-general">
        <label className="dialog-field"><span>{zh ? "Alpha / 不透明度范围" : "Alpha / opacity range"}</span><select value={preferences.color.alphaRange} onChange={(event) => patch("color", {alphaRange: event.target.value as AppPreferences["color"]["alphaRange"]})}><option value="percent">0–100%</option><option value="byte">0–255</option></select></label>
        <label className="dialog-field"><span>{zh ? "新建项目颜色模式" : "New document color mode"}</span><select value={preferences.color.defaultColorMode} onChange={(event) => patch("color", {defaultColorMode: event.target.value as AppPreferences["color"]["defaultColorMode"]})}><option value="rgba">RGBA</option><option value="grayscale">{zh ? "灰度" : "Grayscale"}</option><option value="indexed">{zh ? "索引色" : "Indexed"}</option></select></label>
        <label className="dialog-field"><span>{zh ? "默认颜色配置" : "Default color profile"}</span><select value={preferences.color.defaultProfile} onChange={(event) => patch("color", {defaultProfile: event.target.value as AppPreferences["color"]["defaultProfile"]})}><option value="srgb">sRGB</option><option value="display-p3">Display P3</option><option value="none">{zh ? "不分配" : "Unassigned"}</option></select></label>
      </div>
    </details>

    <details>
      <summary>{zh ? "提醒" : "Alerts"}</summary>
      <div className="preferences-section-body preferences-check-grid">
        {toggle("alerts", "closeUnsaved", zh ? "关闭未保存文件时提醒" : "Warn before closing unsaved files", preferences.alerts.closeUnsaved)}
        {toggle("alerts", "deleteLayer", zh ? "删除图层时提醒" : "Warn before deleting layers", preferences.alerts.deleteLayer)}
        {toggle("alerts", "deleteFrame", zh ? "删除帧时提醒" : "Warn before deleting frames", preferences.alerts.deleteFrame)}
        {toggle("alerts", "deleteCel", zh ? "清除动画格时提醒" : "Warn before clearing cels", preferences.alerts.deleteCel)}
        {toggle("alerts", "convertColorMode", zh ? "转换颜色模式时提醒" : "Warn before color conversion", preferences.alerts.convertColorMode)}
      </div>
    </details>

    <details>
      <summary>{zh ? "编辑器" : "Editor"}</summary>
      <div className="preferences-section-body preferences-check-grid">
        {toggle("editor", "wheelZoom", zh ? "滚轮缩放" : "Zoom with scroll wheel", preferences.editor.wheelZoom)}
        {toggle("editor", "zoomFromCenter", zh ? "从画布中心缩放" : "Zoom from canvas center", preferences.editor.zoomFromCenter)}
        {toggle("editor", "autoFitOnOpen", zh ? "打开文件时适应窗口" : "Fit sprite on open", preferences.editor.autoFitOnOpen)}
        {toggle("editor", "previewShiftLine", zh ? "立即预览 Shift 直线" : "Preview Shift line immediately", preferences.editor.previewShiftLine)}
        {toggle("editor", "discardCustomBrushOnEyedropper", zh ? "吸管取色后丢弃自定义笔刷" : "Discard custom brush after eyedropper", preferences.editor.discardCustomBrushOnEyedropper)}
      </div>
    </details>

    <details>
      <summary>{zh ? "选区" : "Selection"}</summary>
      <div className="preferences-section-body preferences-general">
        {toggle("selection", "keepAfterDelete", zh ? "删除内容后保留选区" : "Keep selection after delete", preferences.selection.keepAfterDelete)}
        {toggle("selection", "showEdges", zh ? "显示选区边缘" : "Show selection edges", preferences.selection.showEdges)}
        <label className="dialog-field dialog-field-wide"><span>{zh ? "时间轴变换范围" : "Timeline transform scope"}</span><select value={preferences.selection.transformScope} onChange={(event) => patch("selection", {transformScope: event.target.value as AppPreferences["selection"]["transformScope"]})}><option value="selected-cels">{zh ? "仅所选动画格" : "Selected cels only"}</option><option value="selected-rows-columns">{zh ? "所选图层与帧交集" : "Selected layers and frames"}</option></select></label>
      </div>
    </details>

    <details>
      <summary>{zh ? "时间轴" : "Timeline"}</summary>
      <div className="preferences-section-body preferences-general">
        {toggle("timeline", "autoShow", zh ? "创建图层或帧时显示时间轴" : "Show timeline after layer/frame creation", preferences.timeline.autoShow)}
        {toggle("timeline", "rewindOnStop", zh ? "停止播放时回到起始帧" : "Rewind on stop", preferences.timeline.rewindOnStop)}
        {toggle("timeline", "keepSelection", zh ? "编辑画布时保留时间轴选区" : "Keep timeline selection", preferences.timeline.keepSelection)}
        <label className="dialog-field"><span>{zh ? "首帧编号" : "First frame number"}</span><input type="number" min="0" max="9999" value={preferences.timeline.firstFrame} onChange={(event) => patch("timeline", {firstFrame: Math.max(0, Math.min(9999, Math.round(Number(event.target.value) || 0)))})} /></label>
        <label className="dialog-field"><span>{zh ? "前置洋葱帧" : "Previous onion frames"}</span><input type="number" min="0" max="16" value={preferences.timeline.onionPreviousFrames} onChange={(event) => patch("timeline", {onionPreviousFrames: Math.max(0, Math.min(16, Math.round(Number(event.target.value) || 0)))})} /></label>
        <label className="dialog-field"><span>{zh ? "后置洋葱帧" : "Next onion frames"}</span><input type="number" min="0" max="16" value={preferences.timeline.onionNextFrames} onChange={(event) => patch("timeline", {onionNextFrames: Math.max(0, Math.min(16, Math.round(Number(event.target.value) || 0)))})} /></label>
        <label className="dialog-field"><span>{zh ? "洋葱皮不透明度" : "Onion opacity"}</span><input type="number" min="0" max="100" value={preferences.timeline.onionOpacity} onChange={(event) => patch("timeline", {onionOpacity: Math.max(0, Math.min(100, Math.round(Number(event.target.value) || 0)))})} /></label>
        <label className="dialog-color-field"><span>{zh ? "前置帧颜色" : "Previous frame color"}</span><input type="color" value={preferences.timeline.onionPreviousColor} onChange={(event) => patch("timeline", {onionPreviousColor: event.target.value})} /></label>
        <label className="dialog-color-field"><span>{zh ? "后置帧颜色" : "Next frame color"}</span><input type="color" value={preferences.timeline.onionNextColor} onChange={(event) => patch("timeline", {onionNextColor: event.target.value})} /></label>
      </div>
    </details>

    <details>
      <summary>{zh ? "光标" : "Cursors"}</summary>
      <div className="preferences-section-body preferences-general">
        <label className="dialog-field"><span>{zh ? "笔刷预览" : "Brush preview"}</span><select value={preferences.cursor.preview} onChange={(event) => patch("cursor", {preview: event.target.value as AppPreferences["cursor"]["preview"]})}><option value="brush">{zh ? "笔刷边缘" : "Brush edges"}</option><option value="crosshair">{zh ? "十字准星" : "Crosshair"}</option><option value="both">{zh ? "两者" : "Both"}</option></select></label>
        <label className="dialog-field"><span>{zh ? "光标缩放" : "Cursor scale"}</span><input type="number" min="50" max="400" step="25" value={preferences.cursor.scale} onChange={(event) => patch("cursor", {scale: Math.max(50, Math.min(400, Math.round(Number(event.target.value) || 100)))})} /></label>
        <label className="dialog-color-field"><span>{zh ? "光标颜色" : "Cursor color"}</span><input type="color" value={preferences.cursor.color} onChange={(event) => patch("cursor", {color: event.target.value})} /></label>
      </div>
    </details>

    <details>
      <summary>{zh ? "透明背景" : "Background"}</summary>
      <div className="preferences-general">
        <label className="dialog-field"><span>{zh ? "新建项目背景" : "New document background"}</span><select value={preferences.background.defaultFill} onChange={(event) => patch("background", {defaultFill: event.target.value as AppPreferences["background"]["defaultFill"]})}><option value="transparent">{zh ? "透明" : "Transparent"}</option><option value="foreground">{zh ? "前景色" : "Foreground"}</option><option value="background">{zh ? "背景色" : "Background"}</option></select></label>
        <label className="dialog-field"><span>{zh ? "棋盘格尺寸" : "Checker size"}</span><input type="number" min="2" max="64" value={preferences.background.checkerSize} onChange={(event) => patch("background", {checkerSize: Math.max(2, Math.min(64, Math.round(Number(event.target.value) || 8)))})} /></label>
        <label className="dialog-color-field"><span>{zh ? "浅色格" : "Light square"}</span><input type="color" value={preferences.background.checkerLight} onChange={(event) => patch("background", {checkerLight: event.target.value})} /></label>
        <label className="dialog-color-field"><span>{zh ? "深色格" : "Dark square"}</span><input type="color" value={preferences.background.checkerDark} onChange={(event) => patch("background", {checkerDark: event.target.value})} /></label>
      </div>
    </details>

    <details>
      <summary>{zh ? "网格" : "Grid"}</summary>
      <div className="preferences-section-body preferences-field-grid">
        {(["width", "height", "offsetX", "offsetY"] as const).map((key) => <label className="dialog-field" key={key}><span>{{width: zh ? "宽度" : "Width", height: zh ? "高度" : "Height", offsetX: zh ? "偏移 X" : "Offset X", offsetY: zh ? "偏移 Y" : "Offset Y"}[key]}</span><input type="number" min={key.startsWith("offset") ? -2048 : 1} max="2048" value={preferences.grid[key]} onChange={(event) => patch("grid", {[key]: Math.round(Number(event.target.value) || 0)})} /></label>)}
        <label className="dialog-color-field"><span>{zh ? "网格线颜色" : "Grid line color"}</span><input type="color" value={preferences.grid.lineColor} onChange={(event) => patch("grid", {lineColor: event.target.value})} /></label>
        <label className="dialog-field"><span>{zh ? "网格线不透明度" : "Grid opacity"}</span><input type="number" min="0" max="100" value={preferences.grid.lineOpacity} onChange={(event) => patch("grid", {lineOpacity: Math.max(0, Math.min(100, Math.round(Number(event.target.value) || 0)))})} /></label>
        {toggle("grid", "showPixelGrid", zh ? "默认显示像素网格" : "Show pixel grid by default", preferences.grid.showPixelGrid)}
        <label className="dialog-color-field"><span>{zh ? "像素网格颜色" : "Pixel grid color"}</span><input type="color" value={preferences.grid.pixelGridColor} onChange={(event) => patch("grid", {pixelGridColor: event.target.value})} /></label>
        <label className="dialog-field"><span>{zh ? "像素网格不透明度" : "Pixel grid opacity"}</span><input type="number" min="0" max="100" value={preferences.grid.pixelGridOpacity} onChange={(event) => patch("grid", {pixelGridOpacity: Math.max(0, Math.min(100, Math.round(Number(event.target.value) || 0)))})} /></label>
      </div>
    </details>

    <details>
      <summary>{zh ? "辅助线与切片" : "Guides & Slices"}</summary>
      <div className="preferences-section-body preferences-general">
        <label className="dialog-color-field"><span>{zh ? "辅助线颜色" : "Guide color"}</span><input type="color" value={preferences.guides.guideColor} onChange={(event) => patch("guides", {guideColor: event.target.value})} /></label>
        <label className="dialog-color-field"><span>{zh ? "切片边缘颜色" : "Slice edge color"}</span><input type="color" value={preferences.guides.sliceColor} onChange={(event) => patch("guides", {sliceColor: event.target.value})} /></label>
      </div>
    </details>

    <details>
      <summary>{zh ? "历史记录" : "Undo"}</summary>
      <div className="preferences-section-body preferences-check-grid">
        <label className="dialog-field"><span>{zh ? "历史内存上限（MB）" : "History memory limit (MB)"}</span><input type="number" min="16" max="2048" step="16" value={preferences.undo.memoryLimitMB} onChange={(event) => patch("undo", {memoryLimitMB: Math.max(16, Math.min(2048, Math.round(Number(event.target.value) || 16)))})} /></label>
        {toggle("undo", "goToModified", zh ? "撤销时跳转到修改的帧与图层" : "Go to modified frame and layer", preferences.undo.goToModified)}
        {toggle("undo", "allowNonLinear", zh ? "允许非线性历史记录" : "Allow non-linear history", preferences.undo.allowNonLinear)}
        {toggle("undo", "showTooltip", zh ? "显示撤销提示" : "Show undo tooltip", preferences.undo.showTooltip)}
      </div>
    </details>

    <details>
      <summary>{zh ? "绘制" : "Drawing"}</summary>
      <div className="preferences-section-body preferences-check-grid">
        {toggle("drawing", "pixelPerfect", zh ? "默认启用像素完美" : "Enable pixel perfect by default", preferences.drawing.pixelPerfect)}
        {toggle("drawing", "pressure", zh ? "默认启用压感" : "Enable pressure by default", preferences.drawing.pressure)}
        {toggle("drawing", "brushDynamics", zh ? "默认启用笔刷动态" : "Enable brush dynamics by default", preferences.drawing.brushDynamics)}
      </div>
    </details>
  </div>;
}
