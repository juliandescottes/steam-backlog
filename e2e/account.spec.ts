import { expect, test, type Page } from "@playwright/test";

// The local Worker imports a fixed dev library without a Steam API key (worker/src/library.ts)
const DEV_GAMES = ["Half-Life 2", "Portal", "Portal 2", "Stardew Valley", "Terraria"];

/** Each test signs in as its own Steam user, so parallel tests don't share an account. */
const steamId = () => `765611${String(Date.now() % 1e9).padStart(9, "0")}${Math.floor(Math.random() * 90 + 10)}`;

async function signIn(page: Page, id: string) {
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  const res = await page.request.post("/api/auth/dev", { data: { steamId: id }, headers: { "x-requested-with": "backlog" } });
  expect(res.ok()).toBe(true);
  await page.reload();
}

const card = (page: Page, name: string) => page.locator(".game").filter({ has: page.locator(".name", { hasText: new RegExp(`^${name}$`) }) });

test("sign in, import the Steam library, and see a change on another device", async ({ page, browser }) => {
  const id = steamId();
  await signIn(page, id);
  await expect(page.locator(".game .name")).toHaveText(DEV_GAMES);

  // Never played, so finishing it adds no community length that would reorder parallel tests
  await card(page, "Stardew Valley").hover();
  await card(page, "Stardew Valley").getByRole("button", { name: "Mark Finished" }).click();
  await expect(card(page, "Stardew Valley")).toHaveCount(0);

  const other = await browser.newPage();
  await expect(async () => {
    await signIn(other, id);
    await other.getByRole("button", { name: "Finished", exact: true }).click();
    await expect(card(other, "Stardew Valley").locator(".status-chip")).toHaveText("Finished", { timeout: 1000 });
  }).toPass({ timeout: 10_000 }); // the first device syncs within a couple of seconds
  await other.close();
});

test("what was done before signing in comes along", async ({ page }) => {
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  const library = { format: "backlog-library", version: 1, games: [{ appid: 620, name: "Portal 2" }, { appid: 999999, name: "Not on Steam" }] };
  await page.setInputFiles("input[type=file]", { name: "library.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(library)) });
  await card(page, "Portal 2").locator("button.cover").focus();
  await page.keyboard.press("p");
  await expect(card(page, "Portal 2").locator(".status-chip")).toHaveText("Playing");

  await page.request.post("/api/auth/dev", { data: { steamId: steamId() }, headers: { "x-requested-with": "backlog" } });
  await page.reload();
  await expect(page.locator(".game .name")).toHaveText(DEV_GAMES);
  await expect(card(page, "Portal 2").locator(".status-chip")).toHaveText("Playing");

  await page.reload(); // and it's on the server, not only local
  await page.evaluate(() => new Promise(ok => { const r = indexedDB.deleteDatabase("backlog"); r.onsuccess = r.onerror = r.onblocked = ok; }));
  await page.reload();
  await expect(card(page, "Portal 2").locator(".status-chip")).toHaveText("Playing");
});

test("sign out clears this browser", async ({ page }) => {
  await signIn(page, steamId());
  await expect(page.locator(".game")).toHaveCount(5);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".account")).toContainText("Signed in as Dev user");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in with Steam" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in with Steam" })).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(401);
});

test("another account signing in on this browser gets its own library", async ({ page }) => {
  await signIn(page, steamId());
  await card(page, "Portal 2").locator("button.cover").focus();
  await page.keyboard.press("p");
  await expect(card(page, "Portal 2").locator(".status-chip")).toHaveText("Playing");

  await page.request.post("/api/auth/dev", { data: { steamId: steamId() }, headers: { "x-requested-with": "backlog" } });
  await page.reload();
  await expect(page.locator(".game .name")).toHaveText(DEV_GAMES);
  await expect(card(page, "Portal 2").locator(".status-chip")).toHaveCount(0);
  await page.reload(); // and the library is stored, not only in memory
  await expect(page.locator(".game .name")).toHaveText(DEV_GAMES);
});

test("deleting the account offers a backup, then removes everything", async ({ page }) => {
  const id = steamId();
  await signIn(page, id);
  await expect(page.locator(".game .name")).toHaveText(DEV_GAMES);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Delete account…" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".callout").getByRole("button", { name: "Export backup" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^backlog-.*\.json$/);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.locator(".toast")).toContainText("Account deleted");
  await expect(page.getByRole("button", { name: "Sign in with Steam" })).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(401);

  // Signing in again starts a new, empty account: nothing from before comes back
  await signIn(page, id);
  await expect(page.locator(".game .name")).toHaveText(DEV_GAMES);
  await expect(page.locator(".status-chip")).toHaveCount(0);
});
