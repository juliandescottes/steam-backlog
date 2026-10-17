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

const card = (page: Page, name: string) => page.locator(".bands .game").filter({ has: page.locator(".name", { hasText: new RegExp(`^${name}$`) }) });

test("sign in, import the Steam library, and see a change on another device", async ({ page, browser }) => {
  const id = steamId();
  await signIn(page, id);
  await expect(page.locator(".bands .game .name")).toHaveText(DEV_GAMES);

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
  const view = page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "With dropped", exact: true });
  await page.getByRole("button", { name: "Dropped", exact: true }).click();
  await page.getByRole("button", { name: "+ Save view" }).click();
  await page.keyboard.type("With dropped");
  await page.keyboard.press("Enter");
  await expect(view).toBeVisible();
  await page.waitForFunction(() => new Promise(resolve => {
    indexedDB.open("backlog").onsuccess = e => {
      const n = (e.target as IDBOpenDBRequest).result.transaction("views").objectStore("views").count();
      n.onsuccess = () => resolve(n.result === 1);
    };
  }));

  await page.request.post("/api/auth/dev", { data: { steamId: steamId() }, headers: { "x-requested-with": "backlog" } });
  await page.reload();
  await expect(page.locator(".bands .game .name")).toHaveText(DEV_GAMES);
  await expect(card(page, "Portal 2").locator(".status-chip")).toHaveText("Playing");

  await page.reload(); // and it's on the server, not only local
  await page.evaluate(() => new Promise(ok => { const r = indexedDB.deleteDatabase("backlog"); r.onsuccess = r.onerror = r.onblocked = ok; }));
  await page.reload();
  await expect(card(page, "Portal 2").locator(".status-chip")).toHaveText("Playing");
  await expect(view).toBeVisible();
});

test("sign out clears this browser", async ({ page }) => {
  await signIn(page, steamId());
  await expect(page.locator(".bands .game")).toHaveCount(5);
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
  const view = page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "With dropped", exact: true });
  await page.getByRole("button", { name: "Dropped", exact: true }).click();
  await page.getByRole("button", { name: "+ Save view" }).click();
  await page.keyboard.type("With dropped");
  await page.keyboard.press("Enter");
  await expect(view).toBeVisible();
  await page.waitForFunction(() => new Promise(resolve => {
    indexedDB.open("backlog").onsuccess = e => {
      const n = (e.target as IDBOpenDBRequest).result.transaction("views").objectStore("views").count();
      n.onsuccess = () => resolve(n.result === 1);
    };
  }));

  await page.request.post("/api/auth/dev", { data: { steamId: steamId() }, headers: { "x-requested-with": "backlog" } });
  await page.reload();
  await expect(page.locator(".bands .game .name")).toHaveText(DEV_GAMES);
  await expect(card(page, "Portal 2").locator(".status-chip")).toHaveCount(0);
  await page.reload(); // and the library is stored, not only in memory
  await expect(page.locator(".bands .game .name")).toHaveText(DEV_GAMES);
});

test("deleting the account offers a backup, then removes everything", async ({ page }) => {
  const id = steamId();
  await signIn(page, id);
  await expect(page.locator(".bands .game .name")).toHaveText(DEV_GAMES);
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
  await expect(page.locator(".bands .game .name")).toHaveText(DEV_GAMES);
  await expect(page.locator(".status-chip")).toHaveCount(0);
});

test("views sync between devices, deletes included", async ({ page, browser }) => {
  const id = steamId();
  await signIn(page, id);
  await expect(page.locator(".bands .game .name")).toHaveText(DEV_GAMES);
  const views = (p: Page) => p.getByRole("navigation", { name: "Views" });
  await page.getByRole("button", { name: "Finished", exact: true }).click();
  await views(page).getByRole("button", { name: "+ Save view" }).click();
  await page.keyboard.type("Everything open or done");
  await page.keyboard.press("Enter");

  const other = await browser.newPage();
  await expect(async () => {
    await signIn(other, id);
    await expect(views(other).getByRole("button", { name: "Everything open or done", exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await views(other).getByRole("button", { name: "Everything open or done", exact: true }).click();
  await views(other).getByRole("button", { name: "Delete view Everything open or done" }).click();

  await expect(async () => {
    await page.reload();
    await expect(page.locator(".bands .game")).toHaveCount(5);
    await expect(views(page).getByRole("button", { name: "Everything open or done", exact: true })).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await other.close();
});

test("lists and their order sync between devices, and come along on first sign-in", async ({ page, browser }) => {
  // Made before signing in
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  await page.setInputFiles("input[type=file]", "e2e/fixtures/library.json");
  await page.getByRole("button", { name: "Lists" }).click();
  await page.getByLabel("New list").fill("Weekend");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("h1")).toHaveText("Weekend");

  const id = steamId();
  await signIn(page, id);
  await expect(page.locator(".bands .game .name")).toHaveText(DEV_GAMES);
  for (const name of ["Portal", "Terraria"]) {
    await card(page, name).hover();
    await card(page, name).getByRole("button", { name: `Add ${name} to a list` }).click();
    await page.getByRole("dialog", { name: "Add to list" }).getByRole("option", { name: /Weekend/ }).click();
  }

  const other = await browser.newPage();
  await expect(async () => {
    await signIn(other, id);
    await other.getByRole("button", { name: "Lists" }).click();
    await other.getByRole("dialog", { name: "Lists" }).getByRole("link", { name: /Weekend/ }).click({ timeout: 1000 });
    await expect(other.locator(".bands .game .name")).toHaveText(["Portal", "Terraria"], { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await card(other, "Terraria").dragTo(card(other, "Portal"), { targetPosition: { x: 5, y: 60 } });
  await expect(other.locator(".bands .game .name")).toHaveText(["Terraria", "Portal"]);

  await page.getByRole("button", { name: "Lists" }).click();
  await page.getByRole("dialog", { name: "Lists" }).getByRole("link", { name: /Weekend/ }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.locator(".bands .game .name")).toHaveText(["Terraria", "Portal"], { timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  await page.getByRole("button", { name: "Delete list" }).click();
  await expect(async () => {
    await other.reload();
    await expect(other.locator("h1")).toHaveText("List not found", { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await other.close();
});

test("share a list: one click for a link, viewers see it signed out, changes show up, private hides it", async ({ page, browser }) => {
  const id = steamId();
  await signIn(page, id);
  await expect(page.locator(".bands .game .name")).toHaveText(DEV_GAMES);
  for (const name of ["Portal", "Half-Life 2"]) {
    await card(page, name).getByRole("checkbox").click();
  }
  await page.keyboard.press("a");
  await page.getByRole("combobox", { name: "Find or create a list" }).fill("Valve classics");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Lists" }).click();
  await page.getByRole("link", { name: /Valve classics/ }).click();

  await page.getByRole("button", { name: "Share" }).click();
  await page.getByRole("radio", { name: "Anyone with the link" }).click();
  const link = page.getByRole("region", { name: "Sharing" }).getByRole("link");
  await expect(link).toHaveText(/^localhost:5180\/l\/[0-9a-z]{12}$/);
  await expect(page.getByRole("region", { name: "Sharing" })).toContainText("Shared as Dev user.");
  const path = new URL(await link.getAttribute("href")!).pathname;
  expect(new URL(page.url()).pathname).toBe(path); // the owner's page has the same address

  // A signed-out viewer
  const viewer = await (await browser.newContext()).newPage();
  await viewer.route("**/*steamstatic.com/**", r => r.abort());
  await expect(async () => {
    await viewer.goto(path);
    await expect(viewer.locator("h1")).toHaveText("Valve classics", { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(viewer.locator(".eyebrow")).toHaveText("Dev user's list");
  await viewer.goto(path.replace("/l/", "/s/")); // links from before lists moved to /l/
  await expect(viewer).toHaveURL(new RegExp(`${path}$`));
  await expect(viewer.locator("h1")).toHaveText("Valve classics");
  await expect(viewer.locator(".game .name")).toHaveText(["Portal", "Half-Life 2"]); // in the order they were added
  await expect(viewer.locator(".game button")).toHaveCount(0); // read-only

  // The owner finishes a game: the viewer sees the status after a refresh
  await card(page, "Portal").hover();
  await card(page, "Portal").getByRole("button", { name: "Mark Finished" }).click();
  await expect(async () => {
    await viewer.reload();
    await expect(viewer.locator(".game", { hasText: "Portal" }).locator(".status-chip")).toHaveText("Finished", { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await viewer.getByRole("button", { name: "Finished", exact: true }).click();
  await expect(viewer.locator(".game .name")).toHaveText(["Half-Life 2"]);

  await page.getByRole("radio", { name: "Private" }).click();
  await expect(async () => {
    await viewer.reload();
    await expect(viewer.locator("h1")).toHaveText("List not found", { timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  // The owner on another device sees their own page at the same address once it has synced
  const other = await browser.newPage();
  await other.route("**/*steamstatic.com/**", r => r.abort());
  await signIn(other, id);
  await expect(async () => {
    await other.goto(path);
    await expect(other.getByRole("button", { name: "Rename" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await other.close();
});
