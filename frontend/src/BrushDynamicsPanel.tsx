import type {BrushDynamicsCurve, BrushDynamicsOptions, BrushDynamicsRange, BrushDynamicsSource} from "./editor/tools";

type DynamicsKey = keyof BrushDynamicsOptions;

interface ChannelSpec {
  key: DynamicsKey;
  label: string;
  minimum: number;
  maximum: number;
  scale: number;
  step: number;
  unit: string;
}

export function BrushDynamicsPanel({options, onChange, zh}: {
  options: BrushDynamicsOptions;
  onChange: (options: BrushDynamicsOptions) => void;
  zh: boolean;
}) {
  const update = (key: DynamicsKey, patch: Partial<BrushDynamicsRange>) => {
    const current = options[key];
    onChange({...options, [key]: {...current, ...patch}});
  };
  const shape: ChannelSpec[] = [
    {key: "size", label: zh ? "尺寸" : "Size", minimum: 1, maximum: 64, scale: 1, step: 1, unit: "px"},
    {key: "angle", label: zh ? "角度" : "Angle", minimum: -360, maximum: 360, scale: 1, step: 1, unit: "deg"},
  ];
  const paint: ChannelSpec[] = [
    {key: "opacity", label: zh ? "不透明度" : "Opacity", minimum: 0, maximum: 100, scale: 100, step: 1, unit: "%"},
    {key: "gradient", label: zh ? "前景/背景颜色" : "FG/BG color", minimum: 0, maximum: 100, scale: 100, step: 1, unit: "%"},
  ];

  return <div className="brush-dynamics-panel">
    <DynamicsGroup label={zh ? "形状动态" : "Shape dynamics"} specs={shape} options={options} update={update} zh={zh} />
    <DynamicsGroup label={zh ? "颜料动态" : "Paint dynamics"} specs={paint} options={options} update={update} zh={zh} />
  </div>;
}

function DynamicsGroup({label, specs, options, update, zh}: {
  label: string;
  specs: ChannelSpec[];
  options: BrushDynamicsOptions;
  update: (key: DynamicsKey, patch: Partial<BrushDynamicsRange>) => void;
  zh: boolean;
}) {
  return <details className="brush-dynamics-group" open>
    <summary>{label}</summary>
    {specs.map((spec) => <DynamicsChannel key={spec.key} spec={spec} range={options[spec.key]} update={(patch) => update(spec.key, patch)} zh={zh} />)}
  </details>;
}

function DynamicsChannel({spec, range, update, zh}: {
  spec: ChannelSpec;
  range: BrushDynamicsRange;
  update: (patch: Partial<BrushDynamicsRange>) => void;
  zh: boolean;
}) {
  const display = (value: number) => Math.round(value * spec.scale);
  const parse = (value: string) => Math.max(spec.minimum, Math.min(spec.maximum, Number(value) || 0)) / spec.scale;
  return <section className="brush-dynamics-channel">
    <label className="dynamics-channel-toggle"><input type="checkbox" checked={range.enabled} onChange={(event) => update({enabled: event.target.checked})} /><span>{spec.label}</span></label>
    {range.enabled && <div className="dynamics-channel-fields">
      <label className="compact-field"><span>{zh ? "输入" : "Input"}</span><select value={range.source} onChange={(event) => update({source: event.target.value as BrushDynamicsSource})}><option value="pressure">{zh ? "压感" : "Pressure"}</option><option value="velocity">{zh ? "速度" : "Velocity"}</option></select></label>
      <label className="compact-field"><span>{zh ? "曲线" : "Curve"}</span><select value={range.curve} onChange={(event) => update({curve: event.target.value as BrushDynamicsCurve})}><option value="linear">{zh ? "线性" : "Linear"}</option><option value="ease-in">{zh ? "渐入" : "Ease in"}</option><option value="ease-out">{zh ? "渐出" : "Ease out"}</option><option value="smoothstep">S-Curve</option></select></label>
      <div className="dynamics-range-fields">
        <label><span>{zh ? "最小" : "Min"}</span><input type="number" min={spec.minimum} max={spec.maximum} step={spec.step} value={display(range.min)} onChange={(event) => update({min: parse(event.target.value)})} /></label>
        <label><span>{zh ? "最大" : "Max"}</span><input type="number" min={spec.minimum} max={spec.maximum} step={spec.step} value={display(range.max)} onChange={(event) => update({max: parse(event.target.value)})} /></label>
        <output>{spec.unit}</output>
      </div>
      <label className="compact-range dynamics-threshold"><span>{zh ? "阈值" : "Threshold"}</span><input type="range" min="0" max="99" value={Math.round(range.threshold * 100)} onChange={(event) => update({threshold: Number(event.target.value) / 100})} /><output>{Math.round(range.threshold * 100)}%</output></label>
      <label className="dynamics-invert"><input type="checkbox" checked={range.invert} onChange={(event) => update({invert: event.target.checked})} />{zh ? "反向响应" : "Invert response"}</label>
    </div>}
  </section>;
}
