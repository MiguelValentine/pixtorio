import {describe, expect, it} from "vitest";

import {constrainMenuPlacement, toZoomedMenuStyleValues} from "./menuPositioning";

const anchor = (overrides: Partial<{left: number; top: number; right: number; bottom: number}> = {}) => {
  const value = {
    left: 20,
    top: 0,
    right: 120,
    bottom: 60,
    width: 100,
    height: 60,
    ...overrides,
  };
  return value;
};

describe("menu viewport placement", () => {
  it("uses scaled viewport padding and converts visual coordinates back for CSS zoom", () => {
    const placement = constrainMenuPlacement({
      anchor: anchor(),
      menu: {width: 236, height: 300},
      viewport: {width: 1000, height: 700},
      uiScalePercent: 200,
      kind: "main",
    });

    expect(placement.left).toBe(20);
    expect(placement.top).toBe(72);
    expect(toZoomedMenuStyleValues(placement, 200)).toMatchObject({
      left: "10px",
      top: "36px",
    });
  });

  it("flips a main menu above its trigger when the lower viewport is shorter", () => {
    const placement = constrainMenuPlacement({
      anchor: anchor({top: 600, bottom: 640}),
      menu: {width: 236, height: 250},
      viewport: {width: 1000, height: 700},
      uiScalePercent: 100,
      kind: "main",
    });

    expect(placement.vertical).toBe("above");
    expect(placement.top).toBe(344);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(692);
  });

  it("flips a submenu to the left when the right side has no room", () => {
    const placement = constrainMenuPlacement({
      anchor: anchor({left: 900, right: 980, top: 240, bottom: 300}),
      menu: {width: 260, height: 180},
      viewport: {width: 1000, height: 700},
      uiScalePercent: 100,
      kind: "submenu",
    });

    expect(placement.horizontal).toBe("left");
    expect(placement.left).toBe(634);
    expect(placement.left + 260).toBeLessThanOrEqual(992);
  });

  it("restores the menu's natural height after a short viewport grows", () => {
    const input = {
      anchor: anchor(),
      menu: {width: 236, height: 900},
      uiScalePercent: 200,
      kind: "main" as const,
    };

    const shortViewport = constrainMenuPlacement({...input, viewport: {width: 1000, height: 700}});
    const tallViewport = constrainMenuPlacement({...input, viewport: {width: 1000, height: 1400}});

    expect(shortViewport.scrollable).toBe(true);
    expect(shortViewport.maxHeight).toBe(612);
    expect(tallViewport.scrollable).toBe(false);
    expect(tallViewport.maxHeight).toBe(900);
  });
});
