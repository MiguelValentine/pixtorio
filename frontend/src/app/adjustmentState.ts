import type {CurvePoint} from "../editor/adjustments";
import {identityCurvePoints} from "../editor/curveEditor";
import type {OutlineDirection, OutlineShape} from "../editor/effects";

export type AdjustmentKind = "brightness-contrast" | "hsl" | "invert" | "convolution" | "median" | "despeckle" | "curves" | "hsv-hsl" | "channel-mask" | "outline";

export type AdjustmentTargetScope = "active" | "selected" | "all";

export type AdjustmentCurveChannel = "red" | "green" | "blue" | "alpha";

export type AdjustmentConvolutionPreset = "blur" | "sharpen" | "edge" | "emboss" | "custom";

export const adjustmentConvolutionPresets: Record<AdjustmentConvolutionPreset, {kernel: number[]; divisor: number; bias: number}> = {
  blur: {kernel: [1, 1, 1, 1, 1, 1, 1, 1, 1], divisor: 9, bias: 0},
  sharpen: {kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0], divisor: 1, bias: 0},
  edge: {kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], divisor: 1, bias: 128},
  emboss: {kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2], divisor: 1, bias: 128},
  custom: {kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0], divisor: 1, bias: 0},
};

export type AdjustmentChannelValues = Record<"red" | "green" | "blue" | "alpha", boolean>;

function defaultAdjustmentChannelValues(): AdjustmentChannelValues {
  return {red: true, green: true, blue: true, alpha: false};
}

export function createAdjustmentDialogState(kind: AdjustmentKind): AdjustmentDialogState {
  const channelValues = defaultAdjustmentChannelValues();
  if (kind === "channel-mask" || kind === "outline") channelValues.alpha = true;
  return {
    kind,
    scope: "active",
    brightness: 0,
    contrast: 0,
    hue: 0,
    saturation: 0,
    lightness: 0,
    value: 0,
    hsvSpace: "hsl",
    hsvMode: "relative",
    convolutionPreset: "sharpen",
    medianSize: kind === "despeckle" ? 5 : 3,
    medianThreshold: 0,
    curveChannel: "red",
    curvePoints: {red: identityCurvePoints(), green: identityCurvePoints(), blue: identityCurvePoints(), alpha: identityCurvePoints()},
    outlineThickness: 1,
    outlinePosition: "outside",
    outlineShape: "square",
    outlineDirections: ["n", "ne", "e", "se", "s", "sw", "w", "nw"],
    outlineTileX: false,
    outlineTileY: false,
    channelValues,
  };
}

export interface AdjustmentDialogState {
  kind: AdjustmentKind;
  scope: AdjustmentTargetScope;
  brightness: number;
  contrast: number;
  hue: number;
  saturation: number;
  lightness: number;
  value: number;
  hsvSpace: "hsv" | "hsl";
  hsvMode: "relative" | "absolute";
  convolutionPreset: AdjustmentConvolutionPreset;
  medianSize: 3 | 5;
  medianThreshold: number;
  curveChannel: AdjustmentCurveChannel;
  curvePoints: Record<AdjustmentCurveChannel, CurvePoint[]>;
  outlineThickness: number;
  outlinePosition: "inside" | "outside";
  outlineShape: OutlineShape;
  outlineDirections: OutlineDirection[];
  outlineTileX: boolean;
  outlineTileY: boolean;
  channelValues: AdjustmentChannelValues;
}
