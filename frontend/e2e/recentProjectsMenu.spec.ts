import {expect, test} from "@playwright/test";

test("recent projects use a GoLand-style submenu", async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem("pixtorio-recent", JSON.stringify([
      "C:\\Art\\terrain-demo.pixio",
      "/Users/pixel/Projects/hex-world.pixio",
      "/Users/pixel/Projects/isometric-town.pixio",
    ]));
  });
  await page.goto("/");
  const switchToEnglish = page.getByRole("button", {name: "切换为 English"});
  if (await switchToEnglish.isVisible()) await switchToEnglish.click();

  await page.getByRole("button", {name: "File", exact: true}).click();
  const trigger = page.getByRole("menuitem", {name: "Recent projects"});
  await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("menu", {name: "Recent projects"})).toHaveCount(0);

  await trigger.hover();
  const submenu = page.getByRole("menu", {name: "Recent projects"});
  await expect(submenu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(submenu.getByRole("menuitem")).toHaveCount(3);
  await expect(submenu.getByRole("menuitem", {name: "terrain-demo.pixio"})).toHaveAttribute("title", "C:\\Art\\terrain-demo.pixio");
  await expect(submenu.getByRole("menuitem", {name: "hex-world.pixio"})).toBeVisible();

  await page.getByRole("menu", {name: "File"}).locator("button").filter({hasText: "Import PNG"}).first().hover();
  await expect(submenu).toHaveCount(0);
});
