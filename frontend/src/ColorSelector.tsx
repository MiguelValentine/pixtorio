import {useEffect, useRef} from "react";
import {hexToHsv, hsvToHex, selectorColorAt, tintShadeToneColor, type ColorSelectorMode, type TintShadeToneCell} from "./editor/colorSelector";
import {hexToRGBA} from "./editor/pixels";

const canvasWidth = 196;
const canvasHeight = 92;

export function ColorSelector({mode, color, onChange, label}: {mode: ColorSelectorMode; color: string; onChange: (color: string) => void; label: string}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const variantBaseRef = useRef(color);
  const variantCellRef = useRef<TintShadeToneCell | null>(null);
  const selfUpdateRef = useRef(false);
  const previousModeRef = useRef(mode);
  if (previousModeRef.current !== mode) {
    previousModeRef.current = mode;
    variantBaseRef.current = color;
    variantCellRef.current = null;
  } else if (mode === "tint-shade-tone" && !selfUpdateRef.current) {
    variantBaseRef.current = color;
    variantCellRef.current = null;
  }
  selfUpdateRef.current = false;
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const image = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const selected = selectorColorAt(mode, x, y, canvas.width, canvas.height, mode === "tint-shade-tone" ? variantBaseRef.current : color);
        const offset = (y * canvas.width + x) * 4;
        if (!selected) {
          image.data.set([0, 0, 0, 0], offset);
          continue;
        }
        const rgba = hexToRGBA(selected);
        image.data.set([rgba[0], rgba[1], rgba[2], 255], offset);
      }
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.putImageData(image, 0, 0);

    const hsv = hexToHsv(color);
    if (mode === "spectrum") {
      drawMarker(context, hsv.s * (canvas.width - 1), (1 - hsv.v) * (canvas.height - 1));
    } else if (mode === "wheel") {
      const strip = Math.min(14, Math.max(8, Math.floor(canvas.height * 0.16)));
      const wheelHeight = canvas.height - strip - 2;
      const radius = Math.max(1, Math.min(canvas.width, wheelHeight) / 2 - 1);
      const radians = hsv.h * Math.PI / 180;
      drawMarker(context, canvas.width / 2 + Math.cos(radians) * radius * hsv.s, wheelHeight / 2 + Math.sin(radians) * radius * hsv.s);
      context.save();
      context.strokeStyle = hsv.v > 0.5 ? "#151619" : "#ffffff";
      context.lineWidth = 1;
      context.strokeRect(Math.round(hsv.v * (canvas.width - 1)) - 2.5, canvas.height - strip, 5, strip - 1);
      context.restore();
    } else if (variantCellRef.current) {
      const cellWidth = canvas.width / 7;
      const cellHeight = canvas.height / 3;
      context.save();
      context.strokeStyle = "#ffffff";
      context.lineWidth = 2;
      context.strokeRect(variantCellRef.current.column * cellWidth + 1, variantCellRef.current.row * cellHeight + 1, cellWidth - 2, cellHeight - 2);
      context.strokeStyle = "#202124";
      context.lineWidth = 1;
      context.strokeRect(variantCellRef.current.column * cellWidth + 2.5, variantCellRef.current.row * cellHeight + 2.5, cellWidth - 5, cellHeight - 5);
      context.restore();
    }
  }, [color, mode]);

  const update = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * event.currentTarget.width / Math.max(1, rect.width);
    const y = (event.clientY - rect.top) * event.currentTarget.height / Math.max(1, rect.height);
    const base = mode === "tint-shade-tone" ? variantBaseRef.current : color;
    const selected = selectorColorAt(mode, x, y, event.currentTarget.width, event.currentTarget.height, base);
    if (selected) {
      if (mode === "tint-shade-tone") variantCellRef.current = {column: Math.max(0, Math.min(6, Math.floor(x / event.currentTarget.width * 7))), row: Math.max(0, Math.min(2, Math.floor(y / event.currentTarget.height * 3)))};
      selfUpdateRef.current = true;
      onChange(selected);
    }
  };
  const keyboard = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    if (mode === "tint-shade-tone") {
      const cell = variantCellRef.current ?? {column: 0, row: 0};
      if (event.key === "ArrowLeft") cell.column = Math.max(0, cell.column - 1);
      if (event.key === "ArrowRight") cell.column = Math.min(6, cell.column + 1);
      if (event.key === "ArrowUp") cell.row = Math.max(0, cell.row - 1);
      if (event.key === "ArrowDown") cell.row = Math.min(2, cell.row + 1);
      variantCellRef.current = cell;
      selfUpdateRef.current = true;
      onChange(tintShadeToneColor(variantBaseRef.current, cell));
      return;
    }
    const hsv = hexToHsv(color);
    const step = event.shiftKey ? 0.1 : 0.02;
    if (mode === "wheel") {
      if (event.key === "ArrowLeft") hsv.h = (hsv.h - (event.shiftKey ? 10 : 2) + 360) % 360;
      if (event.key === "ArrowRight") hsv.h = (hsv.h + (event.shiftKey ? 10 : 2)) % 360;
    } else {
      if (event.key === "ArrowLeft") hsv.s = Math.max(0, hsv.s - step);
      if (event.key === "ArrowRight") hsv.s = Math.min(1, hsv.s + step);
    }
    if (event.key === "ArrowUp") hsv.v = Math.min(1, hsv.v + step);
    if (event.key === "ArrowDown") hsv.v = Math.max(0, hsv.v - step);
    selfUpdateRef.current = true;
    onChange(hsvToHex(hsv));
  };
  return <canvas
    ref={canvasRef}
    className={`color-selector-canvas is-${mode}`}
    width={canvasWidth}
    height={canvasHeight}
    tabIndex={0}
    role="slider"
    aria-label={label}
    onKeyDown={keyboard}
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); update(event); }}
    onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event); }}
  />;
}

function drawMarker(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.beginPath();
  context.arc(x, y, 3.5, 0, Math.PI * 2);
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.stroke();
  context.beginPath();
  context.arc(x, y, 4.5, 0, Math.PI * 2);
  context.strokeStyle = "#202124";
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}
