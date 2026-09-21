import {expect, test, type Page} from "@playwright/test";

async function createDocument(page: Page) {
  await page.goto("/");
  const switchToEnglish = page.getByRole("button", {name: "切换为 English"});
  if (await switchToEnglish.isVisible()) await switchToEnglish.click();
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /New project/}).click();
  await page.getByRole("button", {name: "Create", exact: true}).click();
}

test("Backspace and Delete remove selected frames and layers without affecting text inputs", async ({page}) => {
  await createDocument(page);

  await page.getByRole("button", {name: "Add frame", exact: true}).click();
  const frameHeaders = page.locator(".timeline-frame-number");
  await expect(frameHeaders).toHaveCount(2);
  await frameHeaders.nth(1).click();
  await page.keyboard.press("Backspace");
  await expect(frameHeaders).toHaveCount(1);

  await page.getByRole("button", {name: "Undo"}).click();
  await expect(frameHeaders).toHaveCount(2);

  await page.getByRole("button", {name: "Add layer", exact: true}).click();
  const layerRows = page.locator(".timeline-layer-row");
  await expect(layerRows).toHaveCount(2);
  await layerRows.first().click();
  await page.keyboard.press("Delete");
  await expect(layerRows).toHaveCount(1);

  await page.getByRole("button", {name: "Undo"}).click();
  await expect(layerRows).toHaveCount(2);
  await layerRows.first().locator("button.layer-name").dblclick();
  const nameInput = layerRows.first().locator("input.layer-name-input");
  await nameInput.fill("Layer AB");
  await nameInput.press("Backspace");
  await expect(nameInput).toHaveValue("Layer A");
  await expect(layerRows).toHaveCount(2);
});
