import {expect, test, type Page} from "@playwright/test";

async function openEnglishEditor(page: Page) {
  await page.goto("/");
  await page.getByRole("button", {name: "切换为 English"}).click();
}

async function createDocument(page: Page) {
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /New project/}).click();
  await page.getByRole("button", {name: "Create", exact: true}).click();
}

for (const theme of ["dark", "light"]) {
  test(`modal focus is contained and restored in ${theme} theme`, async ({page}, testInfo) => {
    await openEnglishEditor(page);
    const isLight = await page.locator(".app-shell").evaluate((element) => element.classList.contains("is-light"));
    if (isLight !== (theme === "light")) await page.getByRole("button", {name: "Toggle theme"}).click();
    if (theme === "light") await expect(page.locator(".app-shell")).toHaveClass(/is-light/);
    else await expect(page.locator(".app-shell")).not.toHaveClass(/is-light/);
    const trigger = page.getByRole("button", {name: "Preferences", exact: true});
    await trigger.click();
    const dialog = page.getByRole("dialog", {name: "Preferences", exact: true});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", {name: "Close preferences"})).toBeFocused();
    await expect(page.locator(".topbar")).toHaveAttribute("inert", "");
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", {name: "Close preferences"})).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator(".topbar")).not.toHaveAttribute("inert", "");
    await createDocument(page);
    await page.screenshot({path: testInfo.outputPath(`editor-${theme}.png`)});
  });
}

test("new document retains autofocus and wraps Tab without reaching editor controls", async ({page}) => {
  await openEnglishEditor(page);
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /New project/}).click();
  const dialog = page.getByRole("dialog", {name: "New document", exact: true});
  await expect(dialog.getByRole("spinbutton", {name: "Width", exact: true})).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", {name: "Create", exact: true})).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("spinbutton", {name: "Width", exact: true})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", {name: "File", exact: true})).toBeFocused();
});

test("panel separators support bounded keyboard resizing and cancelled pointer gestures", async ({page}) => {
  await openEnglishEditor(page);
  await createDocument(page);
  const inspector = page.getByRole("separator", {name: "Resize inspector"});
  await inspector.focus();
  await inspector.press("Home");
  await expect(inspector).toHaveAttribute("aria-valuenow", "190");
  await inspector.press("Shift+ArrowLeft");
  await expect(inspector).toHaveAttribute("aria-valuenow", "200");
  await inspector.press("End");
  await inspector.press("ArrowLeft");
  await expect(inspector).toHaveAttribute("aria-valuenow", "420");
  const timeline = page.getByRole("separator", {name: "Resize timeline"});
  await timeline.focus();
  await timeline.press("Home");
  await timeline.press("Shift+ArrowUp");
  await expect(timeline).toHaveAttribute("aria-valuenow", "160");
  await timeline.dispatchEvent("pointerdown", {button: 0, isPrimary: true, pointerId: 77, clientY: 500});
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointercancel", {pointerId: 77}));
    window.dispatchEvent(new PointerEvent("pointermove", {pointerId: 77, clientY: 300}));
  });
  await expect(timeline).toHaveAttribute("aria-valuenow", "160");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pixtorio-timeline-height"))).toBe("160");
});

test("menu navigation skips disabled items and Escape restores its trigger", async ({page}) => {
  await openEnglishEditor(page);
  const file = page.getByRole("button", {name: "File", exact: true});
  await file.focus();
  await file.press("ArrowDown");
  await expect(page.getByRole("menu", {name: "File", exact: true})).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("menuitem", {name: /New project/})).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", {name: /Open project/})).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitem", {name: /New project/})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", {name: "File", exact: true})).toHaveCount(0);
  await expect(file).toBeFocused();
});

test("submenu arrows preserve the parent menu and Tab leaves the menu", async ({page}) => {
  await openEnglishEditor(page);
  await createDocument(page);
  const edit = page.getByRole("button", {name: "Edit", exact: true});
  await edit.focus();
  await edit.press("ArrowDown");
  const pasteSpecial = page.getByRole("menuitem", {name: "Paste Special", exact: true});
  await pasteSpecial.focus();
  await pasteSpecial.press("ArrowRight");
  const submenu = page.getByRole("menu", {name: "Paste Special", exact: true});
  await expect(submenu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(submenu).toHaveCount(0);
  await expect(pasteSpecial).toBeFocused();
  await expect(page.getByRole("menu", {name: "Edit", exact: true})).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu", {name: "Edit", exact: true})).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Sprite", exact: true})).toBeFocused();
});

for (const language of ["zh", "en"]) {
  test(`compact preferences remain within the viewport in ${language}`, async ({page}, testInfo) => {
    await page.setViewportSize({width: 390, height: 740});
    await page.goto("/");
    if (language === "en") await page.getByRole("button", {name: "切换为 English"}).click();
    await page.getByRole("button", {name: language === "zh" ? "偏好设置" : "Preferences", exact: true}).click();
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
    await page.screenshot({path: testInfo.outputPath(`preferences-${language}.png`)});
  });
}
