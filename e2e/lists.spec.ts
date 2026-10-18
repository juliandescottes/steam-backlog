import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 1600 } });

async function openLibrary(page: Page) {
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  await page.setInputFiles("input[type=file]", "e2e/fixtures/library.json");
  await expect(page.locator("h1")).toHaveText(/^6 games/);
}

const card = (page: Page, name: string) => page.locator(".bands .game").filter({ has: page.locator(".name", { hasText: name }) });
const names = (page: Page) => page.locator(".bands .game .name");
const picker = (page: Page) => page.getByRole("dialog", { name: "Add to list" });

/** Waits for IndexedDB to hold `n` games in list `title` before a reload. */
async function savedItems(page: Page, n: number) {
  await expect.poll(() => page.evaluate(() => new Promise<number>(resolve => {
    const req = indexedDB.open("backlog");
    req.onsuccess = () => { const r = req.result.transaction("listItems").objectStore("listItems").count(); r.onsuccess = () => resolve(r.result); };
  }))).toBe(n);
}

test("LIST-1 LIST-2 LIST-3 LIST-4: hand-picked list: create from a cover, add a selection, reorder, remove, survive a reload", async ({ page }) => {
  await openLibrary(page);

  // A new list from the + on a cover
  await card(page, "Mid Game").hover();
  await card(page, "Mid Game").getByRole("button", { name: "Add Mid Game to a list" }).click();
  await picker(page).getByRole("combobox").fill("Up next");
  await page.keyboard.press("Enter");
  await expect(page.locator(".toast")).toContainText("Mid Game → Up next");

  // Two more through a selection and the A key
  await card(page, "Short One").getByRole("checkbox").click();
  await card(page, "Long Haul").getByRole("checkbox").click();
  await page.keyboard.press("a");
  await expect(picker(page).getByRole("option", { name: /Up next/ })).toContainText("1 game");
  await page.keyboard.press("Enter");
  await expect(page.locator(".toast")).toContainText("2 games → Up next");

  // The list page, in the order games were added
  await page.getByRole("button", { name: "Lists" }).click();
  await page.getByRole("dialog", { name: "Lists" }).getByRole("link", { name: /Up next/ }).click();
  await expect(page).toHaveURL(/\/l\/[0-9a-z]{12}$/);
  await expect(page.locator("h1")).toHaveText("Up next");
  await expect(page.locator(".list-meta")).toHaveText("3 games · 107 hours");
  await expect(names(page)).toHaveText(["Mid Game", "Short One", "Long Haul"]);

  // Drag Long Haul to the front, then Alt+→ moves Mid Game one step right
  await card(page, "Long Haul").dragTo(card(page, "Mid Game"), { targetPosition: { x: 5, y: 60 } });
  await expect(names(page)).toHaveText(["Long Haul", "Mid Game", "Short One"]);
  await card(page, "Mid Game").locator("button.cover").focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(names(page)).toHaveText(["Long Haul", "Short One", "Mid Game"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(names(page)).toHaveText(["Long Haul", "Mid Game", "Short One"]);

  // Finished games stay in a list; status chips still filter
  await card(page, "Short One").hover();
  await card(page, "Short One").getByRole("button", { name: "Mark Finished" }).click();
  await expect(names(page)).toHaveText(["Long Haul", "Mid Game", "Short One"]);

  // Remove one through the selection bar
  await card(page, "Mid Game").getByRole("checkbox").click();
  await page.getByRole("toolbar", { name: "Selected games" }).getByRole("button", { name: "Remove from list" }).click();
  await expect(names(page)).toHaveText(["Long Haul", "Short One"]);

  await savedItems(page, 2);
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Up next");
  await expect(names(page)).toHaveText(["Long Haul", "Short One"]);

  // The detail panel shows the lists a game is in
  await page.goto("/");
  await card(page, "Long Haul").locator("button.cover").click();
  const detail = page.getByRole("dialog", { name: "Long Haul" });
  await expect(detail.locator(".list-chip")).toHaveText(["Up next✕"]);
  await detail.getByRole("button", { name: "Remove from Up next" }).click();
  await expect(detail.locator(".list-chip")).toHaveCount(0);
});

test("LIST-5 LIST-6 PRIN-2: list from the current view updates with the library; rename and delete with undo", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "Under 5 h", exact: true }).click();
  await page.getByRole("button", { name: "Lists" }).click();
  const drawer = page.getByRole("dialog", { name: "Lists" });
  await drawer.getByLabel("New list").fill("Quick ones");
  await drawer.getByRole("checkbox").check();
  await drawer.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("h1")).toHaveText("Quick ones");
  await expect(page.locator(".list-meta")).toContainText("1 game · 2 hours · updates with your library");
  await expect(names(page)).toHaveText(["Short One"]);

  // A length typed in the library puts a game in the list
  await page.getByRole("link", { name: "← Backlog" }).click();
  await expect(page.getByRole("button", { name: "Under 5 h", exact: true })).toHaveAttribute("aria-current", "true"); // the library keeps its view
  await page.getByRole("button", { name: "To play" }).click();
  await card(page, "Mystery A").getByRole("button", { name: "Add a length for Mystery A" }).click();
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  await page.goBack();
  await expect(page.locator("h1")).toHaveText("Quick ones");
  await expect(names(page)).toHaveText(["Short One", "Mystery A"]);

  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("List name").fill("Under five");
  await page.getByLabel("Description").fill("For weeknights");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("h1")).toHaveText("Under five");
  await expect(page.locator(".lede")).toHaveText("For weeknights");

  await page.getByRole("button", { name: "Delete list" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".toast")).toContainText('List "Under five" deleted');
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Lists" }).click();
  await expect(drawer.getByRole("link", { name: /Under five/ })).toContainText("auto · 2");
});

test("LIST-7: old /l/<id> addresses move to the list's link; a missing one says so", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "Lists" }).click();
  await page.getByLabel("New list").fill("Old address");
  await page.getByRole("button", { name: "Create" }).click();
  const id = await page.evaluate(() => new Promise<string>(resolve => {
    const req = indexedDB.open("backlog");
    req.onsuccess = () => { const r = req.result.transaction("lists").objectStore("lists").getAll(); r.onsuccess = () => resolve(r.result[0]?.id); };
  }));
  await page.goto(`/l/${id}`);
  await expect(page.locator("h1")).toHaveText("Old address");
  await expect(page).toHaveURL(/\/l\/[0-9a-z]{12}$/);
  await page.goto("/l/nope");
  await expect(page.locator("h1")).toHaveText("List not found");
  await page.getByRole("link", { name: "Back to your backlog" }).click();
  await expect(page.locator("h1")).toHaveText(/^6 games/);
});
