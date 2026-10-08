import {useEffect, useRef, useState} from "react";
import {ImagePlus, LoaderCircle} from "lucide-react";
import type {Language} from "./localization";
import type {DitherMode} from "../editor/colorModes";
import type {PhotoPixelationResult} from "../editor/photoPixelation";
import PhotoPixelationWorker from "../editor/photoPixelation.worker?worker&inline";
import {fitPhotoDimensions, loadPhoto, maxPhotoOutputDimension, photoFileAccept, samplePhoto, type LoadedPhoto} from "./photoImport";
import "./PhotoImportDialog.css";

interface PhotoImportDialogProps {
  language: Language;
  onClose: () => void;
  onImport: (name: string, result: PhotoPixelationResult) => void;
}

export function PhotoImportDialog({language, onClose, onImport}: PhotoImportDialogProps) {
  const chinese = language === "zh";
  const fileInput = useRef<HTMLInputElement>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const requestId = useRef(0);
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [width, setWidth] = useState(128);
  const [height, setHeight] = useState(128);
  const [locked, setLocked] = useState(true);
  const [maxColors, setMaxColors] = useState(32);
  const [mergeThreshold, setMergeThreshold] = useState(0);
  const [dither, setDither] = useState<DitherMode>("none");
  const [smoothing, setSmoothing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PhotoPixelationResult | null>(null);
  const valid = [width, height].every((value) => Number.isInteger(value) && value >= 1 && value <= maxPhotoOutputDimension)
    && Number.isInteger(maxColors) && maxColors >= 2 && maxColors <= 256;

  useEffect(() => () => { requestId.current += 1; }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const selectFile = async (file?: File) => {
    if (!file) return;
    const current = ++requestId.current;
    setLoading(true);
    setError("");
    setPhoto(null);
    setResult(null);
    try {
      const next = await loadPhoto(file);
      if (current !== requestId.current) { URL.revokeObjectURL(next.url); return; }
      const dimensions = fitPhotoDimensions(next.width, next.height);
      setWidth(dimensions.width);
      setHeight(dimensions.height);
      setPhoto(next);
    } catch (failure) {
      if (current === requestId.current) setError(failure instanceof Error ? failure.message : "decode");
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    setResult(null);
    if (!photo || !valid) { setProcessing(false); return; }
    let worker: Worker | undefined;
    let cancelled = false;
    setProcessing(true);
    setError("");
    const timer = window.setTimeout(() => {
      try {
        const pixels = samplePhoto(photo, width, height, smoothing);
        worker = new PhotoPixelationWorker();
        worker.onmessage = (event: MessageEvent<{result?: PhotoPixelationResult; error?: boolean}>) => {
          if (cancelled) return;
          if (event.data.result) setResult(event.data.result);
          else setError("processing");
          setProcessing(false);
          worker?.terminate();
        };
        worker.onerror = () => {
          if (cancelled) return;
          setError("processing");
          setProcessing(false);
          worker?.terminate();
        };
        worker.postMessage({pixels, width, height, options: {maxColors, mergeThreshold, dither}}, [pixels.buffer]);
      } catch {
        if (!cancelled) { setError("processing"); setProcessing(false); }
      }
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); worker?.terminate(); };
  }, [photo, width, height, maxColors, mergeThreshold, dither, smoothing, valid]);

  useEffect(() => {
    if (!result || !previewCanvas.current) return;
    const canvas = previewCanvas.current;
    canvas.width = result.width;
    canvas.height = result.height;
    canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(result.pixels), result.width, result.height), 0, 0);
  }, [result]);

  const updateDimension = (axis: "width" | "height", value: number) => {
    setResult(null);
    if (axis === "width") setWidth(value); else setHeight(value);
    if (!locked || !photo || !Number.isInteger(value) || value < 1 || value > maxPhotoOutputDimension) return;
    const ratio = photo.width / photo.height;
    const nextWidth = axis === "width" ? value : Math.max(1, Math.round(value * ratio));
    const nextHeight = axis === "height" ? value : Math.max(1, Math.round(value / ratio));
    const fitted = fitPhotoDimensions(nextWidth, nextHeight, maxPhotoOutputDimension);
    setWidth(fitted.width);
    setHeight(fitted.height);
  };

  const errorText: Record<string, string> = chinese ? {
    format: "请选择 PNG、JPEG、WebP 或 BMP 图片。",
    "file-size": "图片文件必须非空，且不超过 64 MiB。",
    "source-size": "原图不能超过 1 亿像素。",
    decode: "无法解码此图片，请检查文件或换用 PNG/JPEG。",
    processing: "无法生成预览，请缩小目标尺寸后重试。",
  } : {
    format: "Choose a PNG, JPEG, WebP or BMP image.",
    "file-size": "The image must be nonempty and no larger than 64 MiB.",
    "source-size": "The source image cannot exceed 100 megapixels.",
    decode: "Could not decode this image. Check the file or use PNG/JPEG.",
    processing: "Could not generate the preview. Try a smaller output size.",
  };
  const ready = photo && result && valid && !loading && !processing && !error;

  return <div className="dialog-backdrop" role="presentation"
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); void selectFile(event.dataTransfer.files[0]); }}>
    <form className="canvas-dialog editor-dialog photo-import-dialog" role="dialog" aria-modal="true"
      aria-label={chinese ? "照片转像素画" : "Photo to pixel art"}
      onSubmit={(event) => { event.preventDefault(); if (ready) onImport(photo.name, result); }}>
      <h2>{chinese ? "照片转像素画" : "Photo to pixel art"}</h2>
      <div className="photo-import-file">
        <button type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={16} />{chinese ? "选择照片" : "Choose photo"}</button>
        <input ref={fileInput} type="file" accept={photoFileAccept} hidden aria-label={chinese ? "照片文件" : "Photo file"}
          onChange={(event) => { void selectFile(event.target.files?.[0]); event.target.value = ""; }} />
        <span title={photo?.name}>{photo ? `${photo.name} (${photo.width} × ${photo.height})` : "PNG / JPEG / WebP / BMP"}</span>
      </div>
      <div className="photo-import-previews">
        <figure>
          <figcaption>{chinese ? "原图" : "Original"}</figcaption>
          <div className="photo-import-stage">{photo && <img src={photo.url} alt={chinese ? "原始照片" : "Original photo"} />}</div>
        </figure>
        <figure>
          <figcaption>{chinese ? "像素画" : "Pixel art"}{result ? ` · ${result.width} × ${result.height} · ${result.colorCount} ${chinese ? "色" : "colors"}` : ""}</figcaption>
          <div className="photo-import-stage" aria-busy={processing || loading}>
            {result && <canvas ref={previewCanvas} aria-label={chinese ? "像素画预览" : "Pixel art preview"}
              style={{aspectRatio: `${result.width} / ${result.height}`}} />}
            {(loading || processing) && <LoaderCircle className="photo-import-spinner" size={24} aria-label={chinese ? "处理中" : "Processing"} />}
          </div>
        </figure>
      </div>
      <div className="dialog-field-grid">
        <label className="dialog-field"><span>{chinese ? "目标宽度" : "Output width"}</span><input type="number" min={1} max={maxPhotoOutputDimension} step={1} required value={width || ""} onChange={(event) => updateDimension("width", Number(event.target.value))} /></label>
        <label className="dialog-field"><span>{chinese ? "目标高度" : "Output height"}</span><input type="number" min={1} max={maxPhotoOutputDimension} step={1} required value={height || ""} onChange={(event) => updateDimension("height", Number(event.target.value))} /></label>
        <label className="dialog-checkbox dialog-field-wide"><input type="checkbox" checked={locked} onChange={(event) => {
          setLocked(event.target.checked);
          if (event.target.checked && photo) {
            const dimensions = fitPhotoDimensions(photo.width, photo.height, Math.min(maxPhotoOutputDimension, Math.max(width, height) || 128));
            setWidth(dimensions.width); setHeight(dimensions.height); setResult(null);
          }
        }} />{chinese ? "锁定原图比例" : "Lock original aspect ratio"}</label>
        <label className="dialog-field"><span>{chinese ? "最大颜色数" : "Maximum colors"}</span><input type="number" min={2} max={256} step={1} required value={maxColors || ""} onChange={(event) => { setResult(null); setMaxColors(Number(event.target.value)); }} /></label>
        <label className="dialog-field"><span>{chinese ? "采样方式" : "Resampling"}</span><select value={smoothing ? "smooth" : "nearest"} onChange={(event) => { setResult(null); setSmoothing(event.target.value === "smooth"); }}>
          <option value="smooth">{chinese ? "平滑缩小" : "Smooth"}</option><option value="nearest">{chinese ? "最近邻" : "Nearest neighbor"}</option>
        </select></label>
        <label className="dialog-field"><span>{chinese ? "相似色合并" : "Merge similar colors"} · {mergeThreshold}%</span><input type="range" min={0} max={100} step={1} value={mergeThreshold} onChange={(event) => { setResult(null); setMergeThreshold(Number(event.target.value)); }} /></label>
        <label className="dialog-field"><span>{chinese ? "抖动" : "Dithering"}</span><select value={dither} onChange={(event) => { setResult(null); setDither(event.target.value as DitherMode); }}>
          <option value="none">{chinese ? "无" : "None"}</option><option value="ordered">{chinese ? "有序抖动" : "Ordered"}</option><option value="floyd-steinberg">Floyd–Steinberg</option>
        </select></label>
      </div>
      {result && <div className="photo-import-palette" aria-label={chinese ? "生成的调色板" : "Generated palette"}>
        {result.palette.map((color) => <span key={color} title={color} style={{backgroundColor: color}} />)}
      </div>}
      {error && <p className="photo-import-error" role="alert">{errorText[error] ?? errorText.decode}</p>}
      {photo && !valid && <p className="photo-import-error" role="alert">{chinese ? "宽高须为 1–1024 的整数，颜色数须为 2–256 的整数。" : "Dimensions must be integers from 1–1024; colors must be an integer from 2–256."}</p>}
      <div className="dialog-actions"><button type="button" onClick={onClose}>{chinese ? "取消" : "Cancel"}</button><button type="submit" disabled={!ready}>{chinese ? "创建像素画" : "Create pixel art"}</button></div>
    </form>
  </div>;
}
