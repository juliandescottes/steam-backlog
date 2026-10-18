import { expect, test, type Page } from "@playwright/test";

const COUNT = Number(process.env.PERF_GAMES ?? 3000);
const BUDGET_MS = 100;
const CPU_SLOWDOWN = Number(process.env.CPU_SLOWDOWN ?? 4); // a mid-range phone, roughly

// Timings depend on the machine and suffer when other tests run in parallel: `npm run perf` only
const TIMED = !!process.env.PERF;

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

test(`PRIN-5: ${COUNT.toLocaleString("en")} games, ${CPU_SLOWDOWN}x slower CPU: search, filter and status changes render within 100 ms`, async ({ page }) => {
  test.skip(!TIMED, "timings: npm run perf");
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

test("PRIN-1: only cards near the screen are mounted, and they follow the scroll", async ({ page }) => {
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

test("PRIN-1: a status change only renders and touches the changed card", async ({ page }) => {
  await page.route("**/*steamstatic.com/**", r => r.abort());
  await page.goto("/");
  await page.setInputFiles("input[type=file]", { name: "library.json", mimeType: "application/json", buffer: Buffer.from(library()) });
  await expect(page.locator("h1")).toContainText(`${COUNT.toLocaleString("en")} games`);
  // One game Playing first, so the Now playing shelf exists and doesn't push the grid down
  await page.locator(".bands .game button.cover").first().focus();
  await page.keyboard.press("p");
  await expect(page.getByRole("region", { name: "Now playing" })).toBeVisible();
  const cover = page.locator(".bands .game button.cover").nth(1);
  const appid = await cover.evaluate(el => el.closest<HTMLElement>(".game")!.dataset.appid);
  await cover.focus();

  // Watch the grid once art fallbacks (covers blocked above) have stopped changing it
  await page.evaluate(async () => {
    const w = window as any;
    w.touched = new Set<string>();
    let last = performance.now();
    new MutationObserver(list => {
      last = performance.now();
      for (const m of list) {
        const el = m.target instanceof Element ? m.target : m.target.parentElement;
        w.touched.add(el?.closest<HTMLElement>(".game")?.dataset.appid ?? el?.className ?? "?");
      }
    }).observe(document.querySelector(".bands")!, { subtree: true, childList: true, attributes: true, characterData: true });
    while (performance.now() - last < 500) await new Promise(r => setTimeout(r, 100));
    w.touched.clear();
    w.cardRenders.length = 0; // counted by main.tsx in dev
  });
  await page.keyboard.press("p");
  await expect(page.locator(`.bands .game[data-appid="${appid}"] .status-chip`)).toHaveText("Playing");
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => [...(window as any).touched])).toEqual([appid]);
  expect(await page.evaluate(() => [...new Set((window as any).cardRenders.map(String))])).toEqual([appid]);
});
