import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  use: { baseURL: "http://localhost:5180", channel: "chrome" },
  webServer: [
    { command: "VITE_E2E=1 API_PORT=8788 npx vite --port 5180 --strictPort", cwd: "app", url: "http://localhost:5180", reuseExistingServer: true },
    // Its own Worker and D1, offline: no Steam or Twitch keys, dev sign-in and the fixed dev library (worker/src/library.ts)
    {
      // A fresh database each run: community lengths from one run would reorder the next
      command: "rm -rf .wrangler/e2e && npx wrangler d1 migrations apply baquelogue --local --persist-to .wrangler/e2e && npx wrangler dev --port 8788 --inspector-port 9238 --persist-to .wrangler/e2e --var STEAM_API_KEY: --var TWITCH_CLIENT_ID: --var TWITCH_CLIENT_SECRET:",
      url: "http://localhost:8788/api/me",
      reuseExistingServer: true,
    },
  ],
});
