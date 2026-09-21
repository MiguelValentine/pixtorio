import {expect, test} from "@playwright/test";

test("document tabs and scroll buttons appear only when needed", async ({page}) => {
  await page.goto("/");

  await expect(page.locator(".document-tab-strip")).toHaveCount(0);

  const createDocument = async () => {
    await page.getByRole("button", {name: "文件", exact: true}).click();
    await page.getByRole("menuitem", {name: /新建项目/}).click();
    await page.getByRole("button", {name: "创建", exact: true}).click();
  };

  await createDocument();
  const tabStrip = page.locator(".document-tab-strip");
  await expect(tabStrip).toBeVisible();
  await expect(tabStrip).toHaveCSS("border-left-width", "1px");
  await expect(tabStrip).toHaveCSS("border-left-style", "solid");
  await expect(page.locator(".document-scroll-button")).toHaveCount(0);

  for (let index = 0; index < 4; index += 1) await createDocument();

  await expect(page.locator(".document-scroll-button")).toHaveCount(2);
});
