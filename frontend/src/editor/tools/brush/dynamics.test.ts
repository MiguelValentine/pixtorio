import {describe, expect, it} from "vitest";

import {
  normalizeBrushVelocity,
  normalizePressure,
  pointerVelocity,
  resolveBrushDynamics,
  stabilizeStroke,
} from "./dynamics";

describe("brush dynamics", () => {
  it("normalizes pressure and velocity independently", () => {
    expect(normalizePressure(-1)).toBe(0);
    expect(normalizePressure(Number.NaN, 0.4)).toBe(0.4);
    expect(normalizeBrushVelocity(4, 2)).toBe(1);
  });

  it("resolves enabled channels and preserves disabled fallbacks", () => {
    expect(resolveBrushDynamics({pressure: 0.5, velocity: 0.5}, {
      size: {enabled: true, source: "pressure", min: 1, max: 9, threshold: 0, invert: false, curve: "ease-in"},
      opacity: {enabled: true, source: "pressure", min: 0, max: 1, threshold: 0, invert: false, curve: "ease-out"},
      angle: {enabled: true, source: "pressure", min: 0, max: 360, threshold: 0, invert: false, curve: "smoothstep"},
      gradient: {enabled: false, source: "velocity", min: 0, max: 1, threshold: 0, invert: false, curve: "linear"},
    }, 1, {gradient: 0.25})).toEqual({
      size: 3,
      opacity: 0.75,
      angle: 180,
      gradient: 0.25,
    });
  });

  it("computes velocity and keeps stabilizer endpoints", () => {
    expect(pointerVelocity({x: 0, y: 0, time: 10}, {x: 3, y: 4, time: 20})).toBe(0.5);
    expect(stabilizeStroke([{x: 0, y: 0}, {x: 9, y: 0}, {x: 3, y: 0}], 1)).toEqual([
      {x: 0, y: 0}, {x: 4, y: 0}, {x: 3, y: 0},
    ]);
  });
});
