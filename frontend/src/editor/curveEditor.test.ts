import {describe, expect, it} from "vitest";

import {createCurveLut} from "./adjustments";
import {
  identityCurvePoints,
  insertCurvePoint,
  moveCurvePoint,
  removeCurvePoint,
} from "./curveEditor";

describe("curve editor point helpers", () => {
  it("starts with an identity curve and supports nontrivial S-curve LUTs", () => {
    const points = identityCurvePoints();
    expect(points).toEqual([
      {input: 0, output: 0},
      {input: 255, output: 255},
    ]);

    const curve = [
      points[0],
      {input: 64, output: 24},
      {input: 128, output: 224},
      {input: 192, output: 232},
      points[1],
    ];
    const lut = createCurveLut(curve);
    expect(lut[0]).toBe(0);
    expect(lut[64]).toBe(24);
    expect(lut[128]).toBe(224);
    expect(lut[255]).toBe(255);
    expect(lut[32]).toBe(12);
    expect(lut[160]).toBe(228);
  });

  it("inserts sorted byte points and replaces an existing input", () => {
    const source = identityCurvePoints();
    const inserted = insertCurvePoint(source, {input: 128.4, output: 300.4});
    expect(inserted).toEqual({
      points: [
        {input: 0, output: 0},
        {input: 128, output: 255},
        {input: 255, output: 255},
      ],
      index: 1,
    });

    const replaced = insertCurvePoint(inserted.points, {input: 128.49, output: -10.4});
    expect(replaced).toEqual({
      points: [
        {input: 0, output: 0},
        {input: 128, output: 0},
        {input: 255, output: 255},
      ],
      index: 1,
    });
  });

  it("pins endpoint inputs, clamps outputs, and prevents crossing neighbors", () => {
    const source = [
      {input: 0, output: 10},
      {input: 64, output: 80},
      {input: 192, output: 180},
      {input: 255, output: 240},
    ];

    expect(moveCurvePoint(source, 0, {input: 120, output: 300.4})[0]).toEqual({input: 0, output: 255});
    expect(moveCurvePoint(source, 3, {input: 120, output: -20.4})[3]).toEqual({input: 255, output: 0});
    expect(moveCurvePoint(source, 1, {input: 240, output: 100.4})[1]).toEqual({input: 191, output: 100});
    expect(moveCurvePoint(source, 2, {input: 20, output: 100.4})[2]).toEqual({input: 65, output: 100});
  });

  it("protects endpoints during removal and returns independent copies", () => {
    const source = [
      {input: 0, output: 0},
      {input: 128, output: 200},
      {input: 255, output: 255},
    ];

    const invalidMove = moveCurvePoint(source, 99, {input: 10, output: 20});
    const invalidRemove = removeCurvePoint(source, 99);
    const protectedStart = removeCurvePoint(source, 0);
    const protectedEnd = removeCurvePoint(source, 2);
    expect(invalidMove).toEqual(source);
    expect(invalidRemove).toEqual(source);
    expect(protectedStart).toEqual(source);
    expect(protectedEnd).toEqual(source);

    const moved = moveCurvePoint(source, 1, {input: 64, output: 100});
    const removed = removeCurvePoint(source, 1);
    moved[0].output = 99;
    removed[0].output = 88;
    expect(source).toEqual([
      {input: 0, output: 0},
      {input: 128, output: 200},
      {input: 255, output: 255},
    ]);
    expect(insertCurvePoint(source, {input: 64, output: 80}).points).not.toBe(source);
    expect(identityCurvePoints()).not.toBe(identityCurvePoints());
  });
});
