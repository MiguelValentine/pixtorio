import {useRef, useState, type PointerEvent, type KeyboardEvent} from "react";
import {createCurveLut, type CurvePoint} from "./editor/adjustments";
import {identityCurvePoints, insertCurvePoint, moveCurvePoint, removeCurvePoint} from "./editor/curveEditor";

interface Props {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  language: "zh" | "en";
}

export function CurveEditor({points, onChange, language}: Props) {
  const [selected, setSelected] = useState(0);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const drag = useRef<{pointerId: number; index: number} | null>(null);
  const zh = language === "zh";
  const activeIndex = Math.min(selected, points.length - 1);
  const active = points[activeIndex];
  const update = (next: CurvePoint[]) => { pointsRef.current = next; onChange(next); };
  const position = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {input: (event.clientX - rect.left) / rect.width * 279 - 12, output: 255 - ((event.clientY - rect.top) / rect.height * 279 - 12)};
  };
  const remove = (index: number) => {
    update(removeCurvePoint(pointsRef.current, index));
    setSelected(Math.max(0, index - 1));
  };
  const key = (event: KeyboardEvent<SVGElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Delete" || event.key === "Backspace") { remove(index); return; }
    const point = pointsRef.current[index];
    const step = event.shiftKey ? 10 : 1;
    update(moveCurvePoint(pointsRef.current, index, {
      input: point.input + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
      output: point.output + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
    }));
  };
  const lut = createCurveLut(points);
  return <div className="curve-editor">
    <p className="adjustment-note">{zh ? "点击添加控制点，拖动调整；选中后可用方向键微调，Delete 删除中间点。" : "Click to add points; drag or use arrow keys to adjust. Delete removes interior points."}</p>
    <svg className="curve-editor-plot" viewBox="0 0 279 279" role="group" tabIndex={0} onKeyDown={(event) => key(event, activeIndex)} aria-label={zh ? "颜色曲线控制点" : "Color curve control points"}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        const point = position(event);
        const hit = pointsRef.current.findIndex((candidate) => Math.hypot(candidate.input - point.input, candidate.output - point.output) <= 8);
        let index = hit;
        if (hit < 0) {
          const inserted = insertCurvePoint(pointsRef.current, point);
          index = inserted.index;
          update(inserted.points);
        }
        setSelected(index);
        drag.current = {pointerId: event.pointerId, index};
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        update(moveCurvePoint(pointsRef.current, drag.current.index, position(event)));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        update(moveCurvePoint(pointsRef.current, drag.current.index, position(event)));
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}>
      <rect className="curve-editor-grid" x="12" y="12" width="255" height="255" />
      {[64, 128, 192].map((value) => <path className="curve-editor-grid" key={value} d={`M${12 + value} 12V267M12 ${12 + value}H267`} />)}
      <path className="curve-editor-identity" d="M12 267L267 12" />
      <polyline className="curve-editor-line" points={Array.from(lut, (output, input) => `${input + 12},${267 - output}`).join(" ")} />
      {points.map((point, index) => <circle key={index} className={index === activeIndex ? "curve-editor-point is-selected" : "curve-editor-point"} cx={point.input + 12} cy={267 - point.output} r="4" tabIndex={0} role="button" aria-pressed={index === activeIndex} aria-label={`${zh ? "控制点" : "Point"} ${index + 1}: ${point.input}, ${point.output}`} onFocus={() => setSelected(index)} onKeyDown={(event) => key(event, index)} />)}
    </svg>
    <div className="dialog-field-grid">
      <label className="dialog-field"><span>{zh ? "输入" : "Input"}</span><input type="number" min={activeIndex === 0 ? 0 : points[activeIndex - 1].input + 1} max={activeIndex === points.length - 1 ? 255 : points[activeIndex + 1].input - 1} disabled={activeIndex === 0 || activeIndex === points.length - 1} value={active.input} onChange={(event) => update(moveCurvePoint(points, activeIndex, {...active, input: Number(event.target.value)}))} /></label>
      <label className="dialog-field"><span>{zh ? "输出" : "Output"}</span><input type="number" min="0" max="255" value={active.output} onChange={(event) => update(moveCurvePoint(points, activeIndex, {...active, output: Number(event.target.value)}))} /></label>
      <button className="panel-command" type="button" disabled={activeIndex === 0 || activeIndex === points.length - 1} onClick={() => remove(activeIndex)}>{zh ? "删除控制点" : "Delete point"}</button>
      <button className="panel-command" type="button" onClick={() => { update(identityCurvePoints()); setSelected(0); }}>{zh ? "重置当前通道" : "Reset channel"}</button>
    </div>
  </div>;
}
