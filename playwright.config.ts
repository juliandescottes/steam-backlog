import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  use: { baseURL: "http://localhost:5180", channel: "chrome" },
  webServer: { command: "npx vite --port 5180 --strictPort", cwd: "app", url: "http://localhost:5180", reuseExistingServer: true },
});
