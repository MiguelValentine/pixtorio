import {expect, test} from "@playwright/test";

test("layer properties retain apply, undo, redo and input focus after extraction", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: "切换为 English"}).click();
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /New project/}).click();
  await page.getByRole("button", {name: "Create", exact: true}).click();
  const layerName = page.locator(".timeline-layer-row .layer-name").first();
  const originalName = await layerName.textContent();
  await page.getByRole("button", {name: "Edit", exact: true}).click();
  await page.getByRole("menuitem", {name: /Layer Properties/}).click();
  const dialog = page.getByRole("dialog", {name: "Layer properties", exact: true});
  const name = dialog.getByRole("textbox");
  await expect(name).toBeFocused();
  await name.fill("Refactored layer");
  await dialog.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(layerName).toHaveText("Refactored layer");
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  await expect(layerName).toHaveText(originalName!);
  await page.getByRole("button", {name: "Redo", exact: true}).click();
  await expect(layerName).toHaveText("Refactored layer");
});

test("extracted adjustment dialog preserves scope, channel controls and cancellation", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: "切换为 English"}).click();
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /New project/}).click();
  await page.getByRole("button", {name: "Create", exact: true}).click();
  await page.getByRole("button", {name: "Sprite", exact: true}).click();
  await page.getByRole("menuitem", {name: "Adjustments and effects", exact: true}).click();
  await page.getByRole("menuitem", {name: /Brightness \/ Contrast/}).click();
  const dialog = page.getByRole("dialog", {name: "Color adjustment", exact: true});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("option", {name: "Selected cels (0)"})).toHaveJSProperty("disabled", true);
  await dialog.getByRole("spinbutton", {name: "Brightness", exact: true}).fill("30");
  await dialog.getByRole("checkbox", {name: "A", exact: true}).check();
  await expect(dialog.getByRole("checkbox", {name: "A", exact: true})).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".topbar")).not.toHaveAttribute("inert", "");
  await expect(page.getByRole("button", {name: "Undo", exact: true})).toBeDisabled();
});
