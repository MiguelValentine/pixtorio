import {expect, test, type Page} from "@playwright/test";

async function openEditor(page: Page) {
  await page.goto("/");
  await page.getByRole("button", {name: "切换为 English"}).click();
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /New project/}).click();
  await page.getByRole("button", {name: "Create", exact: true}).click();
}

test("palette editing is direct, cancellable and one undoable change", async ({page}) => {
  await openEditor(page);
  const swatch = page.locator(".swatch-grid .swatch").nth(2);
  const original = await swatch.getAttribute("title");
  await swatch.dblclick();
  const picker = page.getByRole("dialog", {name: "Edit palette color #2", exact: true});
  await expect(picker).toBeVisible();
  await picker.getByRole("textbox", {name: "HEX", exact: true}).fill("#12ab3480");
  await expect(swatch).toHaveAttribute("title", original!);
  await picker.getByRole("button", {name: "Cancel", exact: true}).click();
  await expect(picker).toHaveCount(0);
  await expect(swatch).toBeFocused();
  await expect(page.getByRole("button", {name: "Undo", exact: true})).toBeDisabled();

  await page.getByRole("button", {name: "Edit selected color", exact: true}).click();
  await picker.getByRole("textbox", {name: "HEX", exact: true}).fill("#12ab3480");
  await picker.getByRole("spinbutton", {name: "R value", exact: true}).fill("35");
  await picker.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(picker).toHaveCount(0);
  await expect(swatch).toHaveAttribute("title", "2: #23AB3480");
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  await expect(swatch).toHaveAttribute("title", original!);
  await expect(page.getByRole("button", {name: "Undo", exact: true})).toBeDisabled();
  await page.getByRole("button", {name: "Redo", exact: true}).click();
  await expect(swatch).toHaveAttribute("title", "2: #23AB3480");
});

test("foreground and background use custom pickers and preserve alpha during selection", async ({page}) => {
  await openEditor(page);
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  const foreground = page.getByRole("button", {name: "Foreground", exact: true});
  await foreground.click();
  const picker = page.getByRole("dialog", {name: "Foreground", exact: true});
  await picker.getByRole("textbox", {name: "HEX", exact: true}).fill("#00000080");
  await picker.getByRole("slider", {name: "Hue", exact: true}).fill("240");
  const selector = picker.getByRole("slider", {name: "Color selector", exact: true});
  const bounds = await selector.boundingBox();
  await selector.click({position: {x: bounds!.width - 3, y: 3}});
  await expect(picker.getByRole("textbox", {name: "HEX", exact: true})).toHaveValue(/^#[\da-f]{6}80$/i);
  const selected = await picker.getByRole("textbox", {name: "HEX", exact: true}).inputValue();
  expect(parseInt(selected.slice(5, 7), 16)).toBeGreaterThan(240);
  await picker.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page.locator(".color-editor-summary code")).toContainText("50%");
  await foreground.click();
  await expect(picker.getByRole("textbox", {name: "HEX", exact: true})).toHaveValue(selected);
  await page.keyboard.press("Escape");
  await expect(foreground).toBeFocused();
  await page.getByRole("button", {name: "Background", exact: true}).click();
  const background = page.getByRole("dialog", {name: "Background", exact: true});
  await background.getByRole("textbox", {name: "HEX", exact: true}).fill("#abcdef40");
  await background.getByRole("button", {name: "Apply", exact: true}).click();
  await foreground.click();
  await expect(picker.getByRole("textbox", {name: "HEX", exact: true})).toHaveValue(selected);
});

test("palette replacement explicitly previews the foreground and invalid hex cannot apply", async ({page}) => {
  await openEditor(page);
  await page.locator(".swatch-grid .swatch").nth(1).click();
  await page.getByRole("button", {name: "Foreground", exact: true}).click();
  const foreground = page.getByRole("dialog", {name: "Foreground", exact: true});
  await foreground.getByRole("textbox", {name: "HEX", exact: true}).fill("#abcdef80");
  await foreground.getByRole("button", {name: "Apply", exact: true}).click();
  await page.getByRole("button", {name: "Edit selected color", exact: true}).click();
  const picker = page.getByRole("dialog", {name: "Edit palette color #1", exact: true});
  const original = await page.locator(".swatch-grid .swatch").nth(1).getAttribute("title");
  await picker.getByRole("button", {name: "Use foreground color", exact: true}).click();
  await expect(picker.getByRole("textbox", {name: "HEX", exact: true})).toHaveValue("#abcdef80");
  await expect(page.locator(".swatch-grid .swatch").nth(1)).toHaveAttribute("title", original!);
  await picker.getByRole("textbox", {name: "HEX", exact: true}).fill("#oops");
  await expect(picker.getByRole("button", {name: "Apply", exact: true})).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(picker).toBeVisible();
  await picker.getByRole("textbox", {name: "HEX", exact: true}).fill("#abcdef80");
  await picker.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page.locator(".swatch-grid .swatch").nth(1)).toHaveAttribute("title", "1: #ABCDEF80");
});

test("typed alpha hex, HSLA and all selector modes remain usable", async ({page}) => {
  await openEditor(page);
  await page.getByRole("button", {name: "Foreground", exact: true}).click();
  const picker = page.getByRole("dialog", {name: "Foreground", exact: true});
  const hex = picker.getByRole("textbox", {name: "HEX", exact: true});
  await hex.fill("");
  await hex.pressSequentially("#80808080");
  await expect(hex).toHaveValue("#80808080");
  await picker.getByRole("slider", {name: "Hue", exact: true}).fill("240");
  await picker.getByRole("tab", {name: "HSLA", exact: true}).click();
  await picker.getByRole("spinbutton", {name: "S value", exact: true}).fill("100");
  await expect(hex).toHaveValue(/^#0101ff80$/i);
  await picker.getByRole("combobox", {name: "Selector", exact: true}).selectOption("wheel");
  await expect(picker.locator("canvas")).toHaveClass(/is-wheel/);
  await picker.locator("canvas").press("ArrowLeft");
  await expect(hex).toHaveValue(/^#[\da-f]{6}80$/i);
  await picker.getByRole("combobox", {name: "Selector", exact: true}).selectOption("tint-shade-tone");
  await picker.locator("canvas").press("ArrowDown");
  await expect(hex).toHaveValue(/^#[\da-f]{6}80$/i);
  await picker.getByRole("button", {name: "Cancel", exact: true}).click();
  await expect(page.locator(".color-editor-summary code")).toContainText("#EF476F");
});

test("adding the current background color preserves alpha and selects an existing slot without another edit", async ({page}) => {
  await openEditor(page);
  await page.getByRole("button", {name: "Background", exact: true}).click();
  const picker = page.getByRole("dialog", {name: "Background", exact: true});
  await picker.getByRole("textbox", {name: "HEX", exact: true}).fill("#12345680");
  await picker.getByRole("button", {name: "Apply", exact: true}).click();
  const swatches = page.locator(".swatch-grid .swatch");
  const originalCount = await swatches.count();
  await page.getByRole("button", {name: "Add current color", exact: true}).click();
  await expect(swatches).toHaveCount(originalCount + 1);
  await expect(swatches.last()).toHaveAttribute("title", `${originalCount}: #12345680`);
  await page.getByRole("button", {name: "Add current color", exact: true}).click();
  await expect(swatches).toHaveCount(originalCount + 1);
  await expect(swatches.last()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  await expect(swatches).toHaveCount(originalCount);
  await expect(page.getByRole("button", {name: "Undo", exact: true})).toBeDisabled();
});

test("scaled picker remains in the viewport and can apply a preference without submitting its parent", async ({page}, testInfo) => {
  await page.setViewportSize({width: 1024, height: 768});
  await openEditor(page);
  await page.getByRole("button", {name: "Preferences", exact: true}).click();
  const preferences = page.getByRole("dialog", {name: "Preferences", exact: true});
  await preferences.getByRole("combobox", {name: "UI scale", exact: true}).selectOption("150");
  await preferences.locator("summary").filter({hasText: /^Cursors$/}).click();
  await preferences.getByRole("button", {name: "Cursor color", exact: true}).click();
  const picker = page.getByRole("dialog", {name: "Cursor color", exact: true});
  await picker.getByRole("combobox", {name: "Selector", exact: true}).selectOption("wheel");
  const bounds = await picker.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1024);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(768);
  await picker.getByRole("textbox", {name: "HEX", exact: true}).fill("#123456");
  await page.screenshot({path: testInfo.outputPath("color-picker-scaled-wheel.png")});
  await picker.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(preferences).toBeVisible();
  await preferences.getByRole("button", {name: "Cursor color", exact: true}).click();
  await expect(picker.getByRole("textbox", {name: "HEX", exact: true})).toHaveValue("#123456");
});

for (const language of ["zh", "en"] as const) {
  test(`nested preferences picker traps focus and stays in a narrow viewport in ${language}`, async ({page}, testInfo) => {
    await page.setViewportSize({width: 390, height: 740});
    await page.goto("/");
    if (language === "en") await page.getByRole("button", {name: "切换为 English"}).click();
    await page.getByRole("button", {name: language === "zh" ? "偏好设置" : "Preferences", exact: true}).click();
    const preferences = page.getByRole("dialog", {name: language === "zh" ? "偏好设置" : "Preferences", exact: true});
    await preferences.locator("summary").filter({hasText: language === "zh" ? /^光标$/ : /^Cursors$/}).click();
    const label = language === "zh" ? "光标颜色" : "Cursor color";
    const trigger = preferences.getByRole("button", {name: label, exact: true});
    await trigger.click();
    const picker = page.getByRole("dialog", {name: label, exact: true});
    await expect(picker).toBeVisible();
    const bounds = await picker.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
    await picker.getByRole("button", {name: language === "zh" ? "应用" : "Apply", exact: true}).focus();
    await page.keyboard.press("Tab");
    await expect.poll(() => picker.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.screenshot({path: testInfo.outputPath(`color-picker-narrow-${language}.png`)});
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(preferences).toBeVisible();
    await expect(trigger).toBeFocused();
  });
}

for (const theme of ["light", "dark"]) {
  test(`picker is adjacent to its swatch and visible in ${theme} theme`, async ({page}, testInfo) => {
    await openEditor(page);
    if (theme === "dark") await page.getByRole("button", {name: "Toggle theme"}).click();
    const trigger = page.getByRole("button", {name: "Foreground", exact: true});
    await trigger.click();
    const picker = page.getByRole("dialog", {name: "Foreground", exact: true});
    const pickerBounds = await picker.boundingBox();
    const triggerBounds = await trigger.boundingBox();
    expect(pickerBounds!.x + pickerBounds!.width).toBeLessThanOrEqual(triggerBounds!.x);
    expect(Math.abs(pickerBounds!.y - triggerBounds!.y)).toBeLessThan(16);
    const canvas = picker.locator("canvas");
    await expect.poll(() => canvas.evaluate((element) => {
      const {data} = element.getContext("2d")!.getImageData(0, 0, element.width, element.height);
      return data.some((channel, index) => index % 4 !== 3 && channel > 0);
    })).toBe(true);
    await page.screenshot({path: testInfo.outputPath(`color-picker-${theme}.png`)});
    await page.mouse.click(500, 400);
    await expect(picker).toHaveCount(0);
    await expect(page.getByRole("button", {name: "Undo", exact: true})).toBeDisabled();
  });
}

test.describe("color section styling", () => {
  test.use({deviceScaleFactor: 2});

  for (const theme of ["light", "dark"]) {
    test(`keeps palette selection and foreground chip styling stable in ${theme} theme`, async ({page}, testInfo) => {
      await openEditor(page);
      if (theme === "dark") await page.getByRole("button", {name: "Toggle theme"}).click();

      const swatch = page.locator(".swatch-grid .swatch").first();
      await swatch.click();
      await expect(swatch).toHaveClass(/is-selected/);
      await expect.poll(() => swatch.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          width: style.width,
          height: style.height,
          borderTopWidth: style.borderTopWidth,
          boxShadow: style.boxShadow,
          outlineStyle: style.outlineStyle,
        };
      })).toEqual({
        width: "20px",
        height: "20px",
        borderTopWidth: "2px",
        boxShadow: "none",
        outlineStyle: "none",
      });
      await page.mouse.move(1, 1);
      await expect(swatch).toBeFocused();
      await expect.poll(() => swatch.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          borderTopWidth: style.borderTopWidth,
          boxShadow: style.boxShadow,
          outlineStyle: style.outlineStyle,
        };
      })).toEqual({borderTopWidth: "2px", boxShadow: "none", outlineStyle: "none"});

      const foreground = page.locator(".color-pair .color-chip.is-foreground");
      await expect.poll(() => foreground.evaluate((element) => {
        const style = getComputedStyle(element);
        const after = getComputedStyle(element, "::after");
        return {
          borderTopWidth: style.borderTopWidth,
          borderRightWidth: style.borderRightWidth,
          borderBottomWidth: style.borderBottomWidth,
          borderLeftWidth: style.borderLeftWidth,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          outlineStyle: style.outlineStyle,
          afterTop: after.top,
          afterRight: after.right,
          afterBottom: after.bottom,
          afterLeft: after.left,
          afterBorderRadius: after.borderRadius,
        };
      })).toEqual({
        borderTopWidth: "1px",
        borderRightWidth: "1px",
        borderBottomWidth: "1px",
        borderLeftWidth: "1px",
        borderRadius: "4px",
        boxShadow: "none",
        outlineStyle: "none",
        afterTop: "1px",
        afterRight: "1px",
        afterBottom: "1px",
        afterLeft: "1px",
        afterBorderRadius: "2px",
      });

      await page.locator(".color-section").screenshot({path: testInfo.outputPath(`swatch-outline-${theme}.png`), scale: "device"});
    });
  }
});
