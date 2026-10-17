import { expect, test, type Page } from "@playwright/test";

const COUNT = Number(process.env.PERF_GAMES ?? 3000);
const BUDGET_MS = 100;
const CPU_SLOWDOWN = Number(process.env.CPU_SLOWDOWN ?? 4); // a mid-range phone, roughly

// Timings suffer when other tests run in parallel
test.describe.configure({ retries: 2 });

/** A library shaped like the prototype's: ~38% without a length, a quarter with playtime. */
function library() {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const words = ["Dark", "Star", "Lost", "Iron", "Tiny", "Hollow", "Neon", "Quiet", "Last", "Wild", "Sky", "Deep"];
  const games = Array.from({ length: COUNT }, (_, i) => {
    const name = `${words[Math.floor(rand() * words.length)]} ${words[Math.floor(rand() * words.length)]} ${i + 1}`;
    const main_extra = Math.round(Math.exp(rand() * 5) * 4) / 4;
    return {
      appid: i + 1, name,
      playtimeMin: rand() < 0.25 ? Math.floor(rand() * 3000) : 0,
      igdb: rand() < 0.38 ? null : { main: main_extra * 0.7, main_extra, comp: main_extra * 1.6, count: Math.floor(rand() * 20) },
    };
  });
  return JSON.stringify({ format: "backlog-library", version: 1, games });
}

/** Runs `action` in the page and returns the time until the next frame has painted. */
function timed(page: Page, action: string): Promise<number> {
  return page.evaluate(async code => {
    const start = performance.now();
    new Function(code)();
    await new Promise(r => requestAnimationFrame(() => setTimeout(r)));
    return performance.now() - start;
  }, action);
}

test(`${COUNT.toLocaleString("en")} games, ${CPU_SLOWDOWN}x slower CPU: search, filter and status changes render within 100 ms`, async ({ page }) => {
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  await page.setInputFiles("input[type=file]", { name: "library.json", mimeType: "application/json", buffer: Buffer.from(library()) });
  await expect(page.locator("h1")).toContainText(`${COUNT.toLocaleString("en")} games`);
  await page.waitForTimeout(1000); // let art fallbacks and the IndexedDB write settle
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

  const results: Record<string, number> = {};
  const total = await page.locator(".game").count();

  results.search = await timed(page, `
    const s = document.getElementById("search");
    s.value = "hollow neon";
    s.dispatchEvent(new Event("input", { bubbles: true }));`);
  expect(await page.locator(".game").count()).toBeLessThan(total);

  results.clearSearch = await timed(page, `
    const s = document.getElementById("search");
    s.value = "";
    s.dispatchEvent(new Event("input", { bubbles: true }));`);
  await expect(page.locator(".game")).toHaveCount(total);

  results.statusFilter = await timed(page, `
    [...document.querySelectorAll(".chip")].find(b => b.textContent === "Finished").click();`);

  results.sort = await timed(page, `
    const s = document.querySelector("select[aria-label=Sort]");
    s.value = "name";
    s.dispatchEvent(new Event("change", { bubbles: true }));`);

  await page.locator(".game button.cover").first().focus();
  results.statusKey = await timed(page, `
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));`);
  await expect(page.locator(".game .status-chip").first()).toHaveText("Playing");

  results.undo = await timed(page, `
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));`);

  test.info().annotations.push({ type: "timings (ms)", description: JSON.stringify(results, (_, v) => (typeof v === "number" ? Math.round(v) : v)) });
  console.log("perf, ms:", results);
  for (const [name, ms] of Object.entries(results)) expect(ms, name).toBeLessThan(BUDGET_MS);
});

test("only cards near the screen are mounted, and they follow the scroll", async ({ page }) => {
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  await page.setInputFiles("input[type=file]", { name: "library.json", mimeType: "application/json", buffer: Buffer.from(library()) });
  await expect(page.locator("h1")).toContainText(`${COUNT.toLocaleString("en")} games`);
  expect(await page.locator(".game").count()).toBeLessThan(200);

  await page.locator(".legend a[href='#unknown']").click();
  const unknown = page.locator("section[id=unknown]");
  await expect(unknown.locator(".band-head")).toBeInViewport();
  await expect(unknown.locator(".game").first()).toBeInViewport();
  expect(await page.locator(".game").count()).toBeLessThan(200);

  await page.keyboard.press("End");
  await expect(unknown.locator(".game").last()).toBeInViewport();
  await expect(unknown.locator(".shelf-spacer")).toHaveCount(1); // only above
});
