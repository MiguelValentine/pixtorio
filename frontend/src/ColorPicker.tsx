import {useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent} from "react";
import {createPortal} from "react-dom";
import {ArrowRight, X} from "lucide-react";
import {ColorSelector} from "./ColorSelector";
import {
  alphaDisplayMaximum,
  alphaFromDisplay,
  alphaToDisplay,
  clampPercent,
  hslaToRgba,
  normalizeHue,
  parseHexColor,
  rgbToHsla,
  rgbaToHex,
  type AlphaDisplayRange,
  type HSLAColor,
  type RGBAColor,
} from "./editor/colorEditor";
import {hexToHsv, hsvToHex} from "./editor/colorSelector";
import "./ColorPicker.css";

export interface ColorPickerPopoverProps {
  value: string;
  title: string;
  language: "zh" | "en";
  anchor: HTMLElement;
  onApply: (hex: string) => void;
  onClose: () => void;
  alpha?: boolean;
  alphaRange?: AlphaDisplayRange;
  preset?: {label: string; value: string};
}

export interface ColorFieldProps {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  language: "zh" | "en";
  className?: string;
  disabled?: boolean;
  alpha?: boolean;
  alphaRange?: AlphaDisplayRange;
  onOpen?: () => void;
}

interface PickerState {
  rgba: RGBAColor;
  hue: number;
}

const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

function readPickerState(value: string, alpha: boolean): PickerState {
  const parsed = parseHexColor(value) ?? {r: 0, g: 0, b: 0, a: 100};
  const rgba = {...parsed, a: alpha ? parsed.a : 100};
  return {rgba, hue: hexToHsv(rgbaToHex(rgba)).h};
}

function canonicalHex(state: PickerState, alpha: boolean) {
  return rgbaToHex(state.rgba, alpha);
}

function checkerboardStyle(color: string, alpha: boolean): CSSProperties {
  const parsed = parseHexColor(color) ?? {r: 0, g: 0, b: 0, a: 100};
  const fill = `rgb(${parsed.r} ${parsed.g} ${parsed.b} / ${alpha ? parsed.a / 100 : 1})`;
  return {"--color-field-fill": fill} as CSSProperties;
}

function isValidHexDraft(value: string) {
  const raw = value.trim().replace(/^#/, "");
  return (raw.length === 6 || raw.length === 8) && /^[\da-f]+$/i.test(raw);
}

function updateRgb(state: PickerState, channel: "r" | "g" | "b", value: number): PickerState {
  const rgba = {...state.rgba, [channel]: Math.max(0, Math.min(255, Math.round(value)))};
  const derivedHue = rgbToHsla(rgba).h;
  return {rgba, hue: rgbToHsla(rgba).s === 0 ? state.hue : derivedHue};
}

function updateHsla(state: PickerState, changes: Partial<HSLAColor>): PickerState {
  const current = rgbToHsla(state.rgba);
  const hsla: HSLAColor = {
    h: changes.h ?? (current.s === 0 ? state.hue : current.h),
    s: changes.s ?? current.s,
    l: changes.l ?? current.l,
    a: changes.a ?? current.a,
  };
  return {rgba: hslaToRgba(hsla), hue: normalizeHue(hsla.h)};
}

function fieldValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function labelFor(language: "zh" | "en", zh: string, en: string) {
  return language === "zh" ? zh : en;
}

function Swatch({color, alpha, label}: {color: string; alpha: boolean; label: string}) {
  return <span className="color-picker-swatch" style={checkerboardStyle(color, alpha)} aria-label={label} />;
}

export function ColorPickerPopover({value, title, language, anchor, onApply, onClose, alpha = false, alphaRange = "percent", preset}: ColorPickerPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef<HTMLSelectElement | null>(null);
  const closeRef = useRef(onClose);
  const anchorRef = useRef(anchor);
  const initialRef = useRef(readPickerState(value, alpha));
  const [state, setState] = useState<PickerState>(() => initialRef.current);
  const [mode, setMode] = useState<"spectrum" | "wheel" | "tint-shade-tone">("spectrum");
  const [channelMode, setChannelMode] = useState<"rgba" | "hsla">("rgba");
  const [hexDraft, setHexDraft] = useState(() => canonicalHex(initialRef.current, alpha));
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({top: 8, left: 8});
  const [invalidHex, setInvalidHex] = useState(false);
  const titleId = useId();

  closeRef.current = onClose;
  anchorRef.current = anchor;

  const currentHex = canonicalHex(state, alpha);
  const hsla = useMemo<HSLAColor>(() => {
    const derived = rgbToHsla(state.rgba);
    return {...derived, h: derived.s === 0 ? state.hue : derived.h};
  }, [state]);
  const displayAlpha = alphaToDisplay(state.rgba.a, alphaRange);
  const maxAlpha = alphaDisplayMaximum(alphaRange);

  const reposition = useCallback(() => {
    const popover = popoverRef.current;
    const trigger = anchorRef.current;
    if (!popover || !trigger) return;
    const anchorRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const preferredLeft = anchorRect.left - popoverRect.width - gap;
    const fitsLeft = preferredLeft >= margin;
    const left = fitsLeft
      ? preferredLeft
      : Math.max(margin, Math.min(anchorRect.left, viewportWidth - popoverRect.width - margin));
    const top = fitsLeft
      ? Math.max(margin, Math.min(anchorRect.top, viewportHeight - popoverRect.height - margin))
      : anchorRect.bottom + gap + popoverRect.height <= viewportHeight - margin
        ? anchorRect.bottom + gap
        : Math.max(margin, anchorRect.top - popoverRect.height - gap);
    const scale = popover.offsetWidth > 0 ? popoverRect.width / popover.offsetWidth : 1;
    const next = {top: top / scale, left: left / scale};
    setPosition((previous) => previous.top === next.top && previous.left === next.left ? previous : next);
  }, []);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    const candidate = popover as HTMLDivElement & {showPopover?: () => void};
    const supportsPopover = typeof candidate.showPopover === "function";
    if (supportsPopover) {
      popover.setAttribute("popover", "manual");
      try { candidate.showPopover?.(); } catch {
        popover.removeAttribute("popover");
        setOpen(true);
      }
    } else {
      setOpen(true);
    }
    reposition();
    modeRef.current?.focus({preventScroll: true});
    const focusRequest = requestAnimationFrame(() => {
      reposition();
    });
    const onViewportChange = () => reposition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reposition);
    observer?.observe(popover);
    observer?.observe(anchorRef.current);
    return () => {
      cancelAnimationFrame(focusRequest);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      observer?.disconnect();
      const closable = popover as HTMLDivElement & {hidePopover?: () => void};
      try { closable.hidePopover?.(); } catch { /* The fallback is already closed by unmount. */ }
    };
  }, [reposition]);

  useEffect(() => {
    const onOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
      requestAnimationFrame(() => {
        if (anchorRef.current.isConnected && !anchorRef.current.matches(":disabled")) anchorRef.current.focus({preventScroll: true});
      });
    };
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", onOutsidePointerDown, true);
  }, []);

  const closeAndRestore = useCallback(() => {
    closeRef.current();
    requestAnimationFrame(() => {
      if (anchorRef.current.isConnected && !anchorRef.current.matches(":disabled")) anchorRef.current.focus({preventScroll: true});
    });
  }, []);

  const apply = useCallback(() => {
    if (invalidHex || !isValidHexDraft(hexDraft)) return;
    const parsed = parseHexColor(hexDraft);
    if (!parsed) return;
    const next = {rgba: {...parsed, a: alpha ? parsed.a : 100}, hue: state.hue};
    onApply(rgbaToHex(next.rgba, alpha));
    closeAndRestore();
  }, [alpha, closeAndRestore, hexDraft, invalidHex, onApply, state.hue]);

  const setColorFromHex = useCallback((nextHex: string, preserveAlpha = false) => {
    const parsed = parseHexColor(nextHex);
    if (!parsed) return;
    const nextRgba = {...parsed, a: alpha ? (preserveAlpha ? state.rgba.a : parsed.a) : 100};
    const derived = rgbToHsla(nextRgba);
    setState({rgba: nextRgba, hue: derived.s === 0 ? state.hue : derived.h});
    setHexDraft(rgbaToHex(nextRgba, alpha));
    setInvalidHex(false);
  }, [alpha, state.hue, state.rgba.a]);

  const onHexChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setInvalidHex(!isValidHexDraft(next));
    if (isValidHexDraft(next)) setColorFromHex(next);
    setHexDraft(next);
  };

  const onHexBlur = () => {
    if (isValidHexDraft(hexDraft)) {
      setHexDraft(currentHex);
      setInvalidHex(false);
    }
  };

  const onHexKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (isValidHexDraft(hexDraft)) apply();
    else event.currentTarget.select();
  };

  const onPopoverKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestore();
      return;
    }
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      event.stopPropagation();
      apply();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.getClientRects().length > 0);
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const changeRgb = (channel: "r" | "g" | "b", event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    const next = updateRgb(state, channel, value);
    setState(next);
    setHexDraft(canonicalHex(next, alpha));
    setInvalidHex(false);
  };

  const changeAlpha = (event: ChangeEvent<HTMLInputElement>) => {
    const next = {...state, rgba: {...state.rgba, a: alphaFromDisplay(event.target.value, alphaRange, displayAlpha)}};
    setState(next);
    setHexDraft(canonicalHex(next, alpha));
    setInvalidHex(false);
  };

  const changeHsla = (channel: "h" | "s" | "l", event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    const next = updateHsla(state, {[channel]: channel === "h" ? value : clampPercent(value)});
    setState(next);
    setHexDraft(canonicalHex(next, alpha));
    setInvalidHex(false);
  };

  const selectorChange = (nextHex: string) => setColorFromHex(nextHex, true);

  const popoverClass = `color-picker-popover${open ? " is-open" : ""}`;
  const style = {top: position.top, left: position.left} as CSSProperties;

  return <div
    ref={popoverRef}
    className={popoverClass}
    style={style}
    role="dialog"
    aria-modal="false"
    aria-labelledby={titleId}
    onKeyDown={onPopoverKeyDown}
    onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => event.stopPropagation()}
  >
    <div className="color-picker-header">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="color-picker-icon-button" aria-label={labelFor(language, "关闭", "Close")} title={labelFor(language, "关闭", "Close")} onClick={closeAndRestore}><X size={15} strokeWidth={1.8} /></button>
    </div>

    <div className="color-picker-preview-row">
      <div className="color-picker-preview-block">
        <span>{labelFor(language, "原色", "Original")}</span>
        <Swatch color={canonicalHex(initialRef.current, alpha)} alpha={alpha} label={labelFor(language, "原色", "Original")} />
      </div>
      <ArrowRight className="color-picker-preview-arrow" size={14} aria-hidden="true" />
      <div className="color-picker-preview-block">
        <span>{labelFor(language, "新色", "New")}</span>
        <Swatch color={currentHex} alpha={alpha} label={labelFor(language, "新色", "New")} />
      </div>
    </div>

    <div className="color-picker-controls">
      <label className="color-picker-select-field">
        <span>{labelFor(language, "选择器", "Selector")}</span>
        <select ref={modeRef} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="spectrum">{labelFor(language, "光谱", "Spectrum")}</option>
          <option value="wheel">{labelFor(language, "色轮", "Color wheel")}</option>
          <option value="tint-shade-tone">{labelFor(language, "色调 / 明暗", "Tint / shade / tone")}</option>
        </select>
      </label>
      <ColorSelector mode={mode} color={rgbaToHex(state.rgba)} hue={state.hue} onChange={selectorChange} label={labelFor(language, "颜色选择器", "Color selector")} />
      <label className="color-picker-hue-field">
        <span>{labelFor(language, "色相", "Hue")}</span>
        <input type="range" min="0" max="359" step="1" value={Math.round(state.hue) % 360} aria-label={labelFor(language, "色相", "Hue")} onChange={(event) => {
          const hsv = hexToHsv(rgbaToHex(state.rgba));
          const nextHue = Number(event.target.value);
          const nextHex = hsvToHex({...hsv, h: nextHue});
          const parsed = parseHexColor(nextHex);
          if (!parsed) return;
          const next = {rgba: {...parsed, a: state.rgba.a}, hue: nextHue};
          setState(next);
          setHexDraft(canonicalHex(next, alpha));
          setInvalidHex(false);
        }} />
        <output>{Math.round(state.hue)}°</output>
      </label>
    </div>

    <div className="color-picker-channel-tabs" role="tablist" aria-label={labelFor(language, "颜色通道模式", "Color channel mode")}>
      <button type="button" role="tab" aria-selected={channelMode === "rgba"} className={channelMode === "rgba" ? "is-active" : ""} onClick={() => setChannelMode("rgba")}>RGBA</button>
      <button type="button" role="tab" aria-selected={channelMode === "hsla"} className={channelMode === "hsla" ? "is-active" : ""} onClick={() => setChannelMode("hsla")}>HSLA</button>
    </div>

    <div className="color-picker-channel-grid">
      {channelMode === "rgba" ? <>
        {(["r", "g", "b"] as const).map((channel) => <label className="color-picker-channel" key={channel}>
          <span>{channel.toUpperCase()}</span>
          <input type="range" min="0" max="255" step="1" value={state.rgba[channel]} aria-label={channel.toUpperCase()} onChange={(event) => changeRgb(channel, event)} />
          <input type="number" min="0" max="255" step="1" value={state.rgba[channel]} aria-label={`${channel.toUpperCase()} ${labelFor(language, "数值", "value")}`} onChange={(event) => changeRgb(channel, event)} />
        </label>)}
      </> : <>
        {(["h", "s", "l"] as const).map((channel) => <label className="color-picker-channel" key={channel}>
          <span>{channel.toUpperCase()}</span>
          <input type="range" min="0" max={channel === "h" ? 359 : 100} step="1" value={Math.round(hsla[channel])} aria-label={channel.toUpperCase()} onChange={(event) => changeHsla(channel, event)} />
          <input type="number" min="0" max={channel === "h" ? 359 : 100} step="1" value={fieldValue(hsla[channel])} aria-label={`${channel.toUpperCase()} ${labelFor(language, "数值", "value")}`} onChange={(event) => changeHsla(channel, event)} />
        </label>)}
      </>}
      {alpha && <label className="color-picker-channel color-picker-alpha-channel">
        <span>A</span>
        <input type="range" min="0" max={maxAlpha} step="1" value={Math.round(displayAlpha)} aria-label={labelFor(language, "透明度", "Alpha")} onChange={changeAlpha} />
        <input type="number" min="0" max={maxAlpha} step="1" value={fieldValue(displayAlpha)} aria-label={`${labelFor(language, "透明度", "Alpha")} ${labelFor(language, "数值", "value")}`} onChange={changeAlpha} />
      </label>}
    </div>

    <label className={`color-picker-hex-field${invalidHex ? " is-invalid" : ""}`}>
      <span>HEX</span>
      <input type="text" value={hexDraft} aria-invalid={invalidHex} spellCheck={false} onChange={onHexChange} onBlur={onHexBlur} onKeyDown={onHexKeyDown} />
    </label>

    {preset && <button type="button" className="color-picker-preset" aria-label={preset.label} onClick={() => setColorFromHex(preset.value)}>
      <Swatch color={preset.value} alpha={alpha} label={preset.label} />
      <span>{preset.label}</span>
    </button>}

    <div className="color-picker-actions">
      <button type="button" className="color-picker-secondary-button" onClick={closeAndRestore}>{labelFor(language, "取消", "Cancel")}</button>
      <button type="button" className="color-picker-primary-button" disabled={invalidHex || !isValidHexDraft(hexDraft)} onClick={apply}>{labelFor(language, "应用", "Apply")}</button>
    </div>
  </div>;
}

export function ColorField({value, onChange, label, language, className, disabled = false, alpha = false, alphaRange = "percent", onOpen}: ColorFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const open = () => {
    if (disabled) return;
    onOpen?.();
    setIsOpen(true);
  };
  const close = () => setIsOpen(false);
  return <>
    <button
      ref={anchorRef}
      type="button"
      className={`color-field color-chip${className ? ` ${className}` : ""}`}
      style={checkerboardStyle(value, alpha)}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      title={label}
      disabled={disabled}
      onClick={() => {
        if (isOpen) setIsOpen(false);
        else open();
      }}
    />
    {isOpen && anchorRef.current && createPortal(<ColorPickerPopover
      value={value}
      title={label}
      language={language}
      anchor={anchorRef.current}
      alpha={alpha}
      alphaRange={alphaRange}
      onApply={(next) => { onChange(next); }}
      onClose={close}
    />, anchorRef.current.closest('[role="dialog"], .app-shell') ?? document.body)}
  </>;
}
