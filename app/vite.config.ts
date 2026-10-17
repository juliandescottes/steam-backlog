import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  // Ports off the defaults so another Vite or Wrangler project can run alongside. npm run dev:api serves the Worker.
  server: { port: 5190, strictPort: true, proxy: { "/api": { target: `http://localhost:${process.env.API_PORT ?? 8790}`, xfwd: true } } },
});
