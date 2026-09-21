import {expect, test, type Page} from "@playwright/test";

async function createTilemapDocument(page: Page) {
  await page.goto("/");
  const switchToEnglish = page.getByRole("button", {name: "切换为 English"});
  if (await switchToEnglish.isVisible()) await switchToEnglish.click();
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /New project/}).click();
  await page.getByRole("button", {name: "Create", exact: true}).click();
  await page.getByRole("button", {name: "New tilemap layer"}).click();
  await page.getByRole("button", {name: "Add empty tile"}).click();
  await expect(page.locator('[data-tile-id="1"]')).toBeVisible();
}

async function addTerrain(page: Page) {
  await page.getByRole("tab", {name: "Terrain"}).click();
  await page.getByRole("button", {name: "Add Terrain"}).click();
  await expect(page.getByRole("listbox", {name: "Terrain list"}).getByRole("option")).toHaveCount(1);
}

async function zoomTo600(page: Page) {
  const zoomOut = page.getByRole("button", {name: "Zoom out"});
  const zoomIn = page.getByRole("button", {name: "Zoom in"});
  const zoomText = page.locator(".zoom-control span");
  let current = Number.parseInt((await zoomText.textContent()) ?? "", 10);
  while (current > 600) {
    await zoomOut.click();
    current = Number.parseInt((await zoomText.textContent()) ?? "", 10);
  }
  while (current < 600) {
    await zoomIn.click();
    current = Number.parseInt((await zoomText.textContent()) ?? "", 10);
  }
  await expect(zoomText).toHaveText("600%");
}

async function documentBounds(page: Page) {
  const canvas = page.locator("canvas.pixel-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Pixel canvas does not have bounds");
  const size = 64 * 6;
  return {
    left: box.x + 96,
    top: box.y + 72,
    right: box.x + 96 + size,
    bottom: box.y + 72 + size,
  };
}

function tileCellCount(page: Page) {
  return page.locator('[data-tile-id="1"]').getAttribute("title").then((title) => {
    const match = title?.match(/cells (\d+)/);
    if (!match) throw new Error(`Tile cell count is missing from ${title}`);
    return Number(match[1]);
  });
}

async function handleNextDialog(page: Page, accept: boolean, message: RegExp) {
  return new Promise<void>((resolve, reject) => {
    page.once("dialog", async (dialog) => {
      try {
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toMatch(message);
        if (accept) await dialog.accept();
        else await dialog.dismiss();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

test("manual Tile and Terrain authority confirmations cancel, accept, and undo atomically", async ({page}) => {
  await createTilemapDocument(page);
  await addTerrain(page);
  await page.getByRole("tab", {name: "Draw Tiles"}).click();
  await zoomTo600(page);
  const bounds = await documentBounds(page);
  const point = {x: bounds.left + 3 * 6, y: bounds.top + 3 * 6};

  await page.mouse.click(point.x, point.y);
  await expect.poll(() => tileCellCount(page)).toBe(1);

  await page.getByRole("tab", {name: "Terrain"}).click();
  let dialogHandled = handleNextDialog(page, false, /Enabling Terrain replaces manual tiles/);
  await page.mouse.click(point.x, point.y);
  await dialogHandled;
  await expect.poll(() => tileCellCount(page)).toBe(1);
  await expect(page.getByText("Draw Tiles", {exact: true}).last()).toBeVisible();

  dialogHandled = handleNextDialog(page, true, /Enabling Terrain replaces manual tiles/);
  await page.mouse.click(point.x, point.y);
  await dialogHandled;
  await expect(page.getByRole("button", {name: "Recalculate Cel"})).toBeEnabled();
  await expect(page.getByRole("button", {name: "Undo"})).toBeEnabled();

  await page.getByRole("tab", {name: "Draw Tiles"}).click();
  dialogHandled = handleNextDialog(page, false, /Detach Terrain from this Cel/);
  await page.mouse.click(point.x, point.y, {button: "right"});
  await dialogHandled;
  await page.getByRole("tab", {name: "Terrain"}).click();
  await expect(page.getByRole("button", {name: "Recalculate Cel"})).toBeEnabled();

  await page.getByRole("tab", {name: "Draw Tiles"}).click();
  dialogHandled = handleNextDialog(page, true, /Detach Terrain from this Cel/);
  await page.mouse.click(point.x, point.y, {button: "right"});
  await dialogHandled;
  await page.getByRole("tab", {name: "Terrain"}).click();
  await expect(page.getByRole("button", {name: "Recalculate Cel"})).toBeDisabled();
  await page.getByRole("button", {name: "Undo"}).click();
  await expect(page.getByRole("button", {name: "Recalculate Cel"})).toBeEnabled();
});

for (const grid of [
  {name: "orthogonal", value: "orthogonal"},
  {name: "isometric", value: "isometric"},
  {name: "pointy hex", value: "hex-pointy-odd"},
  {name: "flat hex", value: "hex-flat-even"},
] as const) {
  test(`${grid.name} tiled pointer writes across the right document boundary`, async ({page}) => {
    await createTilemapDocument(page);
    const gridSelect = page.locator("select").filter({
      has: page.locator('option[value="hex-pointy-odd"]'),
    });
    await gridSelect.selectOption(grid.value);
    await page.getByRole("checkbox", {name: "Tile X", exact: true}).check();
    await zoomTo600(page);
    const bounds = await documentBounds(page);
    const y = (bounds.top + bounds.bottom) / 2;

    await page.mouse.move(bounds.right - 12, y);
    await page.mouse.down();
    await page.mouse.move(bounds.right + 84, y, {steps: 24});
    await page.mouse.up();

    await expect.poll(() => tileCellCount(page)).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("button", {name: "Undo"})).toBeEnabled();
    await page.getByRole("button", {name: "Undo"}).click();
    await expect.poll(() => tileCellCount(page)).toBe(0);

    await page.getByRole("button", {name: "Tile rectangle"}).click();
    await page.mouse.move(bounds.right - 12, y);
    await page.mouse.down();
    await page.mouse.move(bounds.right + 84, y, {steps: 24});
    await page.mouse.up();
    await expect.poll(() => tileCellCount(page)).toBeGreaterThanOrEqual(2);
    await page.getByRole("button", {name: "Undo"}).click();
    await expect.poll(() => tileCellCount(page)).toBe(0);

    await page.getByRole("button", {name: "Tile pencil"}).click();
    const first = {x: bounds.left + 16 * 6, y};
    const second = {x: bounds.left + 32 * 6, y};
    await page.mouse.click(first.x, first.y);
    await page.mouse.click(second.x, second.y);
    await expect.poll(() => tileCellCount(page)).toBeGreaterThanOrEqual(2);
    const sourceCellCount = await tileCellCount(page);

    await page.getByRole("button", {name: "Tile cell selection"}).click();
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.mouse.move(second.x, second.y, {steps: 8});
    await page.mouse.up();
    const createStamp = page.getByRole("button", {name: "Create stamp from selection"});
    await expect(createStamp).toBeEnabled();
    await createStamp.click();
    await expect(page.getByRole("button", {name: "Tile stamp"})).toBeEnabled();
    const stampTarget = grid.value === "isometric" ? {x: 40, y: 16} : {x: 8, y: 8};
    await page.mouse.click(bounds.left + stampTarget.x * 6, bounds.top + stampTarget.y * 6);
    await expect.poll(() => tileCellCount(page)).toBeGreaterThan(sourceCellCount);
    await page.getByRole("button", {name: "Undo"}).click();
    await expect.poll(() => tileCellCount(page)).toBe(sourceCellCount);
  });
}
