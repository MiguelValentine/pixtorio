import type {CurvePoint} from "./adjustments";

const BYTE_MIN = 0;
const BYTE_MAX = 255;

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return BYTE_MIN;
  return Math.round(Math.max(BYTE_MIN, Math.min(BYTE_MAX, value)));
}

function copyPoint(point: CurvePoint): CurvePoint {
  return {input: point.input, output: point.output};
}

function normalizePoint(point: CurvePoint): CurvePoint {
  return {
    input: clampByte(point.input),
    output: clampByte(point.output),
  };
}

function copyPoints(points: readonly CurvePoint[]): CurvePoint[] {
  return points.map(copyPoint);
}

/** Returns the two fixed endpoints of an identity curve. */
export function identityCurvePoints(): CurvePoint[] {
  return [
    {input: BYTE_MIN, output: BYTE_MIN},
    {input: BYTE_MAX, output: BYTE_MAX},
  ];
}

/** Inserts a point in input order, replacing the first point at an existing input. */
export function insertCurvePoint(
  points: readonly CurvePoint[],
  point: CurvePoint,
): {points: CurvePoint[]; index: number} {
  const normalized = normalizePoint(point);
  const index = points.findIndex((existing) => existing.input >= normalized.input);

  if (index >= 0 && points[index].input === normalized.input) {
    const result = copyPoints(points);
    result[index] = normalized;
    return {points: result, index};
  }

  const insertionIndex = index >= 0 ? index : points.length;
  const result = copyPoints(points);
  result.splice(insertionIndex, 0, normalized);
  return {points: result, index: insertionIndex};
}

/** Moves a point while keeping its input between its neighboring control points. */
export function moveCurvePoint(points: readonly CurvePoint[], index: number, point: CurvePoint): CurvePoint[] {
  const result = copyPoints(points);
  if (!Number.isInteger(index) || index < 0 || index >= points.length) return result;

  const normalized = normalizePoint(point);
  if (index === 0) {
    result[0] = {input: BYTE_MIN, output: normalized.output};
    return result;
  }
  if (index === points.length - 1) {
    result[index] = {input: BYTE_MAX, output: normalized.output};
    return result;
  }

  const minimumInput = points[index - 1].input + 1;
  const maximumInput = points[index + 1].input - 1;
  const input = minimumInput <= maximumInput
    ? Math.max(minimumInput, Math.min(maximumInput, normalized.input))
    : points[index].input;
  result[index] = {input, output: normalized.output};
  return result;
}

/** Removes an interior control point; the two curve endpoints are protected. */
export function removeCurvePoint(points: readonly CurvePoint[], index: number): CurvePoint[] {
  const result = copyPoints(points);
  if (!Number.isInteger(index) || index <= 0 || index >= points.length - 1) return result;
  result.splice(index, 1);
  return result;
}
