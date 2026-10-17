import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const LIBRARY = "e2e/fixtures/library.json";
const LENGTHS = "e2e/fixtures/lengths.csv";

async function openLibrary(page: Page) {
  // Covers fall back to the game name; keeps tests off the network
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  await page.setInputFiles("input[type=file]", LIBRARY);
  await expect(page.locator(".game")).toHaveCount(6);
}

const card = (page: Page, name: string) => page.locator(".game").filter({ has: page.locator(".name", { hasText: name }) });
const band = (page: Page, id: string) => page.locator(`section[id="${id}"]`);

test("opens a library file and groups games by length", async ({ page }) => {
  await openLibrary(page);
  await expect(page.locator("h1")).toHaveText(/6 games, 107 hours to clear/i);
  await expect(band(page, "under-3")).toContainText("Short One");
  await expect(band(page, "10-20")).toContainText("Mid Game");
  const longHaul = card(page, "Long Haul").locator(".hrs");
  await expect(longHaul).toHaveText("90h");
  await expect(longHaul).toHaveClass(/approx/); // 1 IGDB submission
  await expect(longHaul).toHaveAttribute("title", "IGDB, only 1 submission");
  await expect(band(page, "unknown").locator(".game")).toHaveCount(3);
  await expect(card(page, "Sandbox & Friends")).toBeVisible(); // entity decoded
});

test("quick status action, then undo from the toast", async ({ page }) => {
  await openLibrary(page);
  await card(page, "Short One").hover();
  await card(page, "Short One").getByRole("button", { name: "Mark Finished" }).click();
  await expect(card(page, "Short One")).toHaveCount(0); // finished games are filtered out by default
  await expect(page.locator(".toast")).toContainText("Short One → Finished");
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(card(page, "Short One")).toBeVisible();
});

test("status keys on a focused card, undo with Ctrl/Cmd+Z", async ({ page }) => {
  await openLibrary(page);
  await card(page, "Mid Game").locator("button.cover").focus();
  await page.keyboard.press("p");
  await expect(card(page, "Mid Game").locator(".status-chip")).toHaveText("Playing");
  await page.keyboard.press("d");
  await expect(card(page, "Mid Game")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card(page, "Mid Game").locator(".status-chip")).toHaveText("Playing");
});

test("fill-in mode: typed time, rough guess, no ending", async ({ page }) => {
  await openLibrary(page);
  await band(page, "unknown").getByRole("button", { name: "Fill in lengths" }).click();
  const dialog = page.getByRole("dialog", { name: "Fill in lengths" });

  await expect(dialog.locator("h3")).toHaveText("Mystery B"); // played games come first
  await page.keyboard.type("12h30");
  await expect(dialog.locator(".len-preview")).toHaveText("→ 12.5h");
  await page.keyboard.press("Enter");

  await expect(dialog.locator("h3")).toHaveText("Mystery A");
  await page.keyboard.press("Alt+Digit3");

  await expect(dialog.locator("h3")).toHaveText("Sandbox & Friends");
  await page.keyboard.press("Alt+KeyN");

  await expect(dialog).toContainText("3 lengths added");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(band(page, "10-20")).toContainText("Mystery B");
  await expect(card(page, "Mystery A").locator(".hrs")).toHaveText("8h");
  await expect(card(page, "Mystery A").locator(".hrs")).toHaveAttribute("title", "Your rough guess");
  await expect(band(page, "no-ending")).toContainText("Sandbox & Friends");
  await expect(band(page, "unknown")).toHaveCount(0);
});

test("fill-in mode: a skipped game comes back once", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "3 without a length" }).click();
  const title = page.getByRole("dialog").locator("h3");
  for (const name of ["Mystery B", "Mystery A", "Sandbox & Friends"]) {
    await expect(title).toHaveText(name);
    await page.keyboard.press("Tab");
  }
  await expect(title).toHaveText("Mystery B");
  await expect(page.getByRole("dialog")).toContainText("skipped once");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("paste a times block into the inline editor", async ({ page }) => {
  await openLibrary(page);
  await card(page, "Mystery A").getByRole("button", { name: "Add a length for Mystery A" }).click();
  const input = page.getByRole("textbox", { name: "Hours for Mystery A" });
  await expect(input).toBeFocused();
  await input.evaluate(el => {
    const data = new DataTransfer();
    data.setData("text", "Main Story\n5 Hours\n\nMain + Extras\n7½ Hours\n\nCompletionist\n9 Hours");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator(".popover .len-preview")).toHaveText("→ Main 5h · Main + Extras 7.5h · Completionist 9h");
  await input.press("Enter");
  await expect(band(page, "6-10")).toContainText("Mystery A");
  await expect(card(page, "Mystery A").locator(".hrs")).toHaveText("8h"); // whole hours from 3h
});

test("detail panel edits status and survives a reload", async ({ page }) => {
  await openLibrary(page);
  await card(page, "Long Haul").locator("button.cover").click();
  const sheet = page.getByRole("dialog", { name: "Long Haul" });
  await expect(sheet).toContainText("Approximate · IGDB, only 1 submission");
  await sheet.getByRole("button", { name: "Playing" }).click();
  await sheet.getByRole("textbox").fill("Start after the holidays");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await page.waitForTimeout(600); // note saves are debounced
  await page.reload();
  await expect(card(page, "Long Haul").locator(".status-chip")).toHaveText("Playing");
  await card(page, "Long Haul").locator("button.cover").click();
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveValue("Start after the holidays");
});

test("import lengths from CSV and export a backup", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator("input[type=file][accept*=csv]").setInputFiles(LENGTHS);
  await expect(page.locator(".toast")).toContainText("Imported 1 lengths (1 for games not in your library)");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  const backup = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect(backup.format).toBe("backlog-export");
  expect(backup.games.find((g: any) => g.appid === 4)).toMatchObject({ my: { main_extra: 7 }, myKind: "exact" });

  await page.keyboard.press("Escape");
  await expect(card(page, "Mystery A").locator(".hrs")).toHaveText("7h");
});

test("no horizontal scrolling at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await openLibrary(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
