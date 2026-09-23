import {describe, expect, it} from "vitest";
import {createAdjustmentDialogState} from "./app/adjustmentState";

describe("adjustment dialog defaults", () => {
  it("enables alpha for a visible outside outline and isolates direction arrays between dialogs", () => {
    const state = createAdjustmentDialogState("outline");
    expect(state.channelValues.alpha).toBe(true);
    expect(state.outlinePosition).toBe("outside");
    expect(state.outlineThickness).toBe(1);
    expect(state.outlineDirections).toHaveLength(8);
    state.outlineDirections.pop();
    expect(createAdjustmentDialogState("outline").outlineDirections).toHaveLength(8);
  });
  it("starts every operation on the active cel with RGB enabled", () => {
    const state = createAdjustmentDialogState("brightness-contrast");
    expect(state.scope).toBe("active");
    expect(state.channelValues).toEqual({red: true, green: true, blue: true, alpha: false});
  });

  it("uses a larger window for despeckle and preserves curve endpoints", () => {
    const despeckle = createAdjustmentDialogState("despeckle");
    const curves = createAdjustmentDialogState("curves");
    expect(despeckle.medianSize).toBe(5);
    expect(curves.curvePoints).toEqual(Object.fromEntries(["red", "green", "blue", "alpha"].map((channel) => [channel, [{input: 0, output: 0}, {input: 255, output: 255}]])));
    expect(curves.curvePoints.red).not.toBe(curves.curvePoints.green);
  });

  it("exposes relative HSL as the initial advanced color mode", () => {
    const state = createAdjustmentDialogState("hsv-hsl");
    expect(state.hsvSpace).toBe("hsl");
    expect(state.hsvMode).toBe("relative");
    expect(state.hue).toBe(0);
    expect(state.saturation).toBe(0);
  });
});
