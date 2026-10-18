import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const LIBRARY = "e2e/fixtures/library.json";
const LENGTHS = "e2e/fixtures/lengths.csv";

// Shelves mount only the rows near the screen; a tall window keeps the whole fixture mounted
test.use({ viewport: { width: 1280, height: 1600 } });

async function openLibrary(page: Page) {
  // Covers fall back to the game name; keeps tests off the network
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  await page.setInputFiles("input[type=file]", LIBRARY);
  await expect(page.locator("h1")).toHaveText(/^6 games/);
}

const card = (page: Page, name: string) => page.locator(".bands .game").filter({ has: page.locator(".name", { hasText: name }) });
const band = (page: Page, id: string) => page.locator(`section[id="${id}"]`);

test("ONB-1 PRIN-4 LIB-1 LIB-3 LIB-5: opens a library file and groups games by length", async ({ page }) => {
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
  await expect(page.getByRole("navigation", { name: "Length bands" }).locator('.legend a[href="#unknown"]')).toContainText("Unknown 3");
});

test("STATUS-3 STATUS-5 LIB-6 PRIN-2: quick status action, then undo from the toast", async ({ page }) => {
  await openLibrary(page);
  await card(page, "Short One").hover();
  await card(page, "Short One").getByRole("button", { name: "Mark Finished" }).click();
  await expect(card(page, "Short One")).toHaveCount(0); // finished games are filtered out by default
  await expect(page.locator(".toast")).toContainText("Short One → Finished");
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(card(page, "Short One")).toBeVisible();
  // Pressed again, a quick action goes back to Backlog
  await card(page, "Short One").getByRole("button", { name: "Mark Playing" }).click();
  await expect(card(page, "Short One").locator(".status-chip")).toHaveText("Playing");
  await card(page, "Short One").getByRole("button", { name: "Back to Backlog" }).click();
  await expect(card(page, "Short One").locator(".status-chip")).toHaveCount(0);
});

test("STATUS-2 STATUS-5: status keys on a focused card, undo with Ctrl/Cmd+Z", async ({ page }) => {
  await openLibrary(page);
  await card(page, "Mid Game").locator("button.cover").focus();
  await page.keyboard.press("p");
  await expect(card(page, "Mid Game").locator(".status-chip")).toHaveText("Playing");
  await page.keyboard.press("d");
  await expect(card(page, "Mid Game")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card(page, "Mid Game").locator(".status-chip")).toHaveText("Playing");
  await card(page, "Mid Game").locator("button.cover").focus();
  await page.keyboard.press("b");
  await expect(card(page, "Mid Game").locator(".status-chip")).toHaveCount(0);
  await page.keyboard.press("f");
  await expect(card(page, "Mid Game")).toHaveCount(0);
});

test("STATUS-4 STATUS-5 STATUS-6: finishing records the date, leaving Finished clears it, the date can be changed, undo restores it", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-03-01T12:00:00"));
  await openLibrary(page);
  await card(page, "Mid Game").locator("button.cover").click();
  const sheet = page.getByRole("dialog", { name: "Mid Game" });
  const finished = sheet.getByLabel("Finished");
  const button = (name: string) => sheet.getByRole("button", { name, exact: true });
  await expect(finished).toHaveCount(0);

  await button("Finished").click();
  await expect(finished).toHaveValue("2026-03-01");
  await finished.fill("2026-02-14");
  await expect(page.locator(".toast")).toContainText("Mid Game: finished");
  await button("Playing").click();
  await expect(finished).toHaveCount(0);
  await page.clock.setFixedTime(new Date("2026-04-02T12:00:00"));
  await button("Finished").click();
  await expect(finished).toHaveValue("2026-04-02");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(button("Playing")).toHaveAttribute("aria-pressed", "true");
  await expect(finished).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(finished).toHaveValue("2026-02-14");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(finished).toHaveValue("2026-03-01");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(button("Backlog")).toHaveAttribute("aria-pressed", "true");
  await expect(finished).toHaveCount(0);
});

test("LEN-1 LEN-4 LEN-5 LEN-7 LEN-8: fill-in mode: typed time, rough guess, no ending", async ({ page }) => {
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

test("LEN-1 LEN-10: fill-in mode: a skipped game comes back once", async ({ page }) => {
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

test("LEN-6 LEN-11: paste a times block into the inline editor", async ({ page }) => {
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

test("STATUS-3 LIB-8 LEN-12: detail panel edits status and survives a reload", async ({ page }) => {
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

test("LEN-14 DATA-1: import lengths from CSV and export a backup", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator("input[type=file][accept*=csv]").setInputFiles(LENGTHS);
  await expect(page.locator(".toast")).toContainText("Imported 1 lengths (1 for games not in your library)");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  const backup = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect(backup.format).toBe("backlog-export");
  expect(backup.games.find((g: any) => g.appid === 4)).toMatchObject({ my: { main_extra: 7 }, myKind: "imported" });

  await page.keyboard.press("Escape");
  await expect(card(page, "Mystery A").locator(".hrs")).toHaveText("7h");
});

test("DATA-2 DATA-4 ONB-1: restore a backup after a summary, delete local data, open a backup on the welcome page", async ({ page }) => {
  await openLibrary(page);
  await card(page, "Mid Game").locator("button.cover").focus();
  await page.keyboard.press("p");
  await page.getByRole("button", { name: "Settings" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  const backup = await download.path();
  await page.keyboard.press("Escape");

  await card(page, "Mid Game").locator("button.cover").focus();
  await page.keyboard.press("d");
  await expect(card(page, "Mid Game")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Restore backup" }).click()]);
  await chooser.setFiles(backup);
  await expect(page.locator(".sheet .callout")).toContainText("6 games, 1 with a status");
  await page.getByRole("button", { name: "Replace this library" }).click();
  await expect(page.locator(".toast")).toContainText("Library replaced from backup");
  await page.keyboard.press("Escape");
  await expect(card(page, "Mid Game").locator(".status-chip")).toHaveText("Playing");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Delete local data…" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page.getByRole("button", { name: "Sign in with Steam" })).toBeVisible();

  await page.setInputFiles("input[type=file]", backup);
  await expect(page.locator("h1")).toHaveText(/^6 games/);
  await expect(card(page, "Mid Game").locator(".status-chip")).toHaveText("Playing");
});

test("PLAT-1: no horizontal scrolling at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await openLibrary(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test("ONB-5: offers once to finish games played past 80% of their length", async ({ page }) => {
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  const library = JSON.parse(readFileSync(LIBRARY, "utf8"));
  library.games[0].playtimeMin = 100; // Short One: 2h, so 96 min is 80%
  library.games[1].playtimeMin = 600; // Mid Game: 15h, not yet
  await page.setInputFiles("input[type=file]", { name: "library.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(library)) });

  await expect(card(page, "Mid Game").locator(".sub")).toHaveText("Played 10h");
  const triage = page.getByRole("complementary", { name: "Finished games" });
  await expect(triage).toContainText("You've played 1 game for at least 80% of its length (Short One). Mark it Finished?");
  await triage.getByRole("button", { name: "Mark Finished" }).click();
  await expect(card(page, "Short One")).toHaveCount(0);
  await expect(triage).toHaveCount(0);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(card(page, "Short One")).toHaveCount(1);
  // Writes reach IndexedDB a moment later; reload once the undo is stored
  await page.waitForFunction(() => new Promise(resolve => {
    indexedDB.open("backlog").onsuccess = e => {
      const get = (e.target as IDBOpenDBRequest).result.transaction("games").objectStore("games").get(1);
      get.onsuccess = () => resolve(get.result.status === "backlog");
    };
  }));
  await page.reload();
  await expect(page.locator("h1")).toHaveText(/^6 games/);
  await expect(triage).toHaveCount(0); // asked once
});

test("FIND-7 FIND-1: arrow keys move between games across bands; ? lists the shortcuts", async ({ page }) => {
  await openLibrary(page);
  const focused = () => page.evaluate(() => document.activeElement?.closest(".game")?.querySelector(".name")?.textContent);
  await page.keyboard.press("ArrowRight"); // lands on the first game on screen
  expect(await focused()).toBe("Short One");
  await page.keyboard.press("ArrowDown"); // next band, same column
  expect(await focused()).toBe("Mid Game");
  await page.keyboard.press("ArrowRight");
  expect(await focused()).toBe("Long Haul");
  await page.keyboard.press("ArrowUp");
  expect(await focused()).toBe("Mid Game");

  await page.keyboard.press("Enter");
  await expect(page.locator("#detail-title")).toHaveText("Mid Game");
  await page.keyboard.press("Escape");
  await expect.poll(focused).toBe("Mid Game");
  await page.keyboard.press("f");
  await expect(page.locator(".toast")).toContainText("Mid Game → Finished");

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Shortcuts" })).toContainText("Move between games");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Shortcuts" })).toHaveCount(0);
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Search games by name" })).toBeFocused();
});

test("FIND-7: keyboard focus reaches games far down a long shelf", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  const games = Array.from({ length: 300 }, (_, i) => ({ appid: 1000 + i, name: `Game ${String(i).padStart(3, "0")}`, igdb: { main: 5, main_extra: 6, comp: 9, count: 9 } }));
  await page.setInputFiles("input[type=file]", { name: "l.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "backlog-library", version: 1, games })) });
  await expect(page.locator("h1")).toHaveText(/^300 games/);
  await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowDown");
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector(".shelf")!).gridTemplateColumns.split(" ").length);
  const name = `Game ${String(Math.min(30 * cols, 299 - (299 % cols))).padStart(3, "0")}`;
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest(".game")?.querySelector(".name")?.textContent)).toBe(name);
  const box = await page.locator(".bands .game", { hasText: name }).boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(700);
});

test("FIND-8 PRIN-2 LIB-1: bulk select: click, shift-click a range, act on all with one undo", async ({ page }) => {
  await openLibrary(page);
  const bar = page.getByRole("toolbar", { name: "Selected games" });
  await card(page, "Short One").hover();
  await card(page, "Short One").getByRole("checkbox").click();
  await card(page, "Long Haul").getByRole("checkbox").click({ modifiers: ["Shift"] });
  await expect(bar).toContainText("3 games selected"); // Short One, Mid Game, Long Haul
  await expect(card(page, "Mid Game").getByRole("checkbox")).toHaveAttribute("aria-checked", "true");

  await page.keyboard.press("f");
  await expect(page.locator(".toast")).toContainText("3 games → Finished");
  await expect(page.getByRole("progressbar", { name: "Hours cleared" })).toHaveAttribute("aria-valuenow", "100");
  await expect(bar).toHaveCount(0);
  await expect(page.locator(".bands .game")).toHaveCount(3);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".bands .game")).toHaveCount(6);
});

test("FIND-8: bulk select from the keyboard", async ({ page }) => {
  await openLibrary(page);
  const bar = page.getByRole("toolbar", { name: "Selected games" });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await expect(bar).toContainText("6 games selected");
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("x");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("x");
  await expect(bar).toContainText("2 games selected");
  // While selecting, clicking a cover selects instead of opening details
  await card(page, "Long Haul").locator("button.cover").click();
  await expect(bar).toContainText("3 games selected");
  await expect(page.locator("#detail-title")).toHaveCount(0);
  await bar.getByRole("button", { name: "Playing" }).click();
  await expect(page.locator(".toast")).toContainText("3 games → Playing");
});

test("FIND-9 FIND-5 DATA-1: command palette: jump to a game, run actions", async ({ page }) => {
  await openLibrary(page);
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  const palette = page.getByRole("dialog", { name: "Command palette" });

  await page.keyboard.press(`${mod}+k`);
  await page.keyboard.type("mid");
  await expect(palette.getByRole("option").first()).toContainText("Mid Game");
  await page.keyboard.press("Enter");
  await expect(page.locator("#detail-title")).toHaveText("Mid Game");
  await page.keyboard.press("Escape");

  await page.keyboard.press(`${mod}+k`);
  await page.keyboard.type("sort by name");
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Sort" })).toHaveValue("name");

  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+k`);
  await page.keyboard.type("selection fin");
  await expect(palette.getByRole("option", { selected: true })).toHaveText("Mark selection Finished");
  await page.keyboard.press("Enter");
  await expect(page.locator(".toast")).toContainText("6 games → Finished");

  await page.keyboard.press(`${mod}+k`);
  await page.keyboard.type("export");
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(download.suggestedFilename()).toMatch(/^backlog-/);
  await page.keyboard.press(`${mod}+k`);
  await page.keyboard.type("zzzz");
  await expect(palette).toContainText("Nothing matches");
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
});

test("FIND-6 FIND-3 FIND-2 LEN-2 PRIN-4: smart views: built-in ones, conditions as pills, save and delete your own", async ({ page }) => {
  await openLibrary(page);
  const views = page.getByRole("navigation", { name: "Views" });
  await expect(views.locator("[aria-current]")).toHaveText("To play");

  await views.getByRole("button", { name: "Under 5 h" }).click();
  await expect(page.locator(".bands .game .name")).toHaveText(["Short One"]);
  await page.getByRole("button", { name: "Remove condition: Under 5 h" }).click();
  await expect(views.locator("[aria-current]")).toHaveText("To play");
  await expect(page.locator(".bands .game")).toHaveCount(6);

  await views.getByRole("button", { name: "Needs a length" }).click();
  await expect(page.locator(".bands .game")).toHaveCount(3);

  await page.getByRole("button", { name: "Dropped", exact: true }).click();
  await expect(views.locator("[aria-current]")).toHaveCount(0);
  await views.getByRole("button", { name: "+ Save view" }).click();
  await page.keyboard.type("Unknown incl. dropped");
  await page.keyboard.press("Enter");
  await expect(views.locator("[aria-current]")).toHaveText("Unknown incl. dropped");

  await page.waitForFunction(() => new Promise(resolve => {
    indexedDB.open("backlog").onsuccess = e => {
      const all = (e.target as IDBOpenDBRequest).result.transaction("views").objectStore("views").count();
      all.onsuccess = () => resolve(all.result === 1);
    };
  }));
  await page.reload();
  await expect(page.locator("h1")).toHaveText(/^6 games/);
  await views.getByRole("button", { name: "Unknown incl. dropped", exact: true }).click();
  await expect(page.locator(".bands .game")).toHaveCount(3);
  await views.getByRole("button", { name: "Delete view Unknown incl. dropped" }).click();
  await expect(views.getByRole("button", { name: "Unknown incl. dropped", exact: true })).toHaveCount(0);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(views.getByRole("button", { name: "Unknown incl. dropped", exact: true })).toHaveCount(1);
});

test("LIB-2: Now playing shelf: Playing games, latest first, hidden when empty", async ({ page }) => {
  await openLibrary(page);
  const shelf = page.getByRole("region", { name: "Now playing" });
  await expect(shelf).toHaveCount(0);

  for (const name of ["Short One", "Mid Game"]) {
    await card(page, name).locator("button.cover").focus();
    await page.keyboard.press("p");
  }
  await expect(shelf.locator(".game .name")).toHaveText(["Mid Game", "Short One"]);

  // Still shown when the view hides Playing games
  await page.getByRole("button", { name: "Playing", exact: true }).click();
  await expect(card(page, "Mid Game")).toHaveCount(0);
  await expect(shelf.locator(".game")).toHaveCount(2);

  const short = shelf.locator(".game", { hasText: "Short One" });
  await short.hover();
  await short.getByRole("button", { name: "Mark Finished" }).click();
  await expect(shelf.locator(".game .name")).toHaveText(["Mid Game"]);
  await shelf.locator(".game").hover();
  await shelf.getByRole("button", { name: "Back to Backlog" }).click();
  await expect(shelf).toHaveCount(0);
});
