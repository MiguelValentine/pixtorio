import {expect, test, type Page} from "@playwright/test";

async function photoFile(page: Page, type = "image/jpeg", width = 96, height = 64) {
  const data = await page.evaluate(({type, width, height}) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#ed6454");
    gradient.addColorStop(0.5, "#78bf97");
    gradient.addColorStop(1, "#485dc5");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#efd16b";
    context.fillRect(width / 4, height / 4, width / 3, height / 3);
    return canvas.toDataURL(type).split(",")[1];
  }, {type, width, height});
  return {name: type === "image/jpeg" ? "photo.jpg" : type === "image/webp" ? "photo.webp" : "photo.png", mimeType: type, buffer: Buffer.from(data, "base64")};
}

async function openPhoto(page: Page) {
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: "Photo to pixel art", exact: true}).click();
  return page.getByRole("dialog", {name: "Photo to pixel art", exact: true});
}

test("photo import is independent, matches its preview, supports editing undo and PNG export", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: "切换为 English"}).click();
  await page.getByRole("button", {name: "Toggle theme", exact: true}).click();
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /New project/}).click();
  await page.getByRole("button", {name: "Create", exact: true}).click();
  const originalTabs = await page.locator(".document-tab").count();
  const dialog = await openPhoto(page);
  await expect(dialog.getByRole("button", {name: "Choose photo"})).toBeFocused();
  await dialog.locator('input[type="file"]').setInputFiles(await photoFile(page));
  await dialog.getByRole("spinbutton", {name: "Output width"}).fill("24");
  await expect(dialog.getByRole("spinbutton", {name: "Output height"})).toHaveValue("16");
  await dialog.getByRole("spinbutton", {name: "Maximum colors"}).fill("8");
  await expect(dialog.getByRole("button", {name: "Create pixel art"})).toBeEnabled();
  const preview = await dialog.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const pixels = Array.from(canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data);
    const colors = new Set(pixels.reduce<string[]>((values, _, index) => { if (index % 4 === 0) values.push(pixels.slice(index, index + 4).join(",")); return values; }, []));
    return {pixels, width: canvas.width, height: canvas.height, colors: colors.size};
  });
  expect(preview.width).toBe(24);
  expect(preview.height).toBe(16);
  expect(preview.colors).toBeGreaterThan(1);
  expect(preview.colors).toBeLessThanOrEqual(8);
  await page.screenshot({path: "test-results/photo-import-dark.png"});
  await dialog.getByRole("button", {name: "Create pixel art"}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".document-tab")).toHaveCount(originalTabs + 1);
  await expect(page.locator(".document-tab.is-active")).toContainText("photo-pixel");
  const cancelDialog = await openPhoto(page);
  await cancelDialog.locator('input[type="file"]').setInputFiles(await photoFile(page, "image/png"));
  await expect(cancelDialog.getByRole("button", {name: "Create pixel art"})).toBeEnabled();
  await cancelDialog.getByRole("button", {name: "Cancel", exact: true}).click();
  await expect(page.locator(".document-tab")).toHaveCount(originalTabs + 1);
  await expect(page.locator(".document-tab.is-active")).toContainText("photo-pixel");
  await page.getByRole("button", {name: "Sprite", exact: true}).click();
  await page.getByRole("menuitem", {name: /Flip horizontal/i}).click();
  await expect(page.getByRole("button", {name: "Undo", exact: true})).toBeEnabled();
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  await expect(page.getByRole("button", {name: "Redo", exact: true})).toBeEnabled();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /^Export PNG(?:\s|$)/}).filter({hasNotText: "sequence"}).click();
  await page.getByRole("dialog").getByRole("button", {name: "Export", exact: true}).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
  }, Buffer.concat(chunks).toString("base64"));
  expect(exported).toEqual(preview.pixels);
});

test("cancellation, invalid files, pending jobs and empty startup leave existing documents untouched", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: "切换为 English"}).click();
  let dialog = await openPhoto(page);
  await expect(dialog.getByRole("button", {name: "Create pixel art"})).toBeDisabled();
  await dialog.locator('input[type="file"]').setInputFiles({name: "bad.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image")});
  await expect(dialog.getByRole("alert")).toContainText("Could not decode");
  await dialog.locator('input[type="file"]').setInputFiles(await photoFile(page, "image/webp"));
  await expect(dialog.getByRole("button", {name: "Create pixel art"})).toBeEnabled();
  await dialog.getByRole("spinbutton", {name: "Maximum colors"}).fill("1");
  await expect(dialog.getByRole("button", {name: "Create pixel art"})).toBeDisabled();
  await dialog.getByRole("spinbutton", {name: "Maximum colors"}).fill("16");
  await dialog.getByRole("combobox", {name: "Dithering", exact: true}).selectOption("floyd-steinberg");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".document-tab-strip")).toHaveCount(0);
  await expect(page.locator(".topbar")).not.toHaveAttribute("inert", "");
  dialog = await openPhoto(page);
  await expect(dialog.locator("canvas")).toHaveCount(0);
  const dropped = await photoFile(page, "image/png");
  const dataTransfer = await page.evaluateHandle(({base64}) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))], "drop.png", {type: "image/png"}));
    return transfer;
  }, {base64: dropped.buffer.toString("base64")});
  await dialog.dispatchEvent("drop", {dataTransfer});
  await dataTransfer.dispose();
  await expect(dialog.getByRole("button", {name: "Create pixel art"})).toBeEnabled();
  await expect(page.locator(".document-tab-strip")).toHaveCount(0);
  await dialog.getByRole("button", {name: "Cancel", exact: true}).click();
});

test("Chinese light and narrow layouts preserve color merging and unlocked dimensions", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: "文件", exact: true}).click();
  await page.getByRole("menuitem", {name: "照片转像素画", exact: true}).click();
  const dialog = page.getByRole("dialog", {name: "照片转像素画", exact: true});
  await dialog.locator('input[type="file"]').setInputFiles(await photoFile(page, "image/png", 600, 400));
  await dialog.getByRole("checkbox", {name: "锁定原图比例"}).uncheck();
  await dialog.getByRole("spinbutton", {name: "目标宽度"}).fill("32");
  await dialog.getByRole("spinbutton", {name: "目标高度"}).fill("32");
  await dialog.getByRole("slider", {name: /相似色合并/}).fill("100");
  await expect(dialog.getByRole("button", {name: "创建像素画"})).toBeEnabled();
  await expect(dialog.locator(".photo-import-palette span")).toHaveCount(1);
  await dialog.getByRole("slider", {name: /相似色合并/}).fill("0");
  await expect(dialog.getByRole("button", {name: "创建像素画"})).toBeEnabled();
  await page.screenshot({path: "test-results/photo-import-light.png"});
  await page.setViewportSize({width: 390, height: 844});
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({path: "test-results/photo-import-narrow.png"});
});
