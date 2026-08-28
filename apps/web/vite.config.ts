import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // `rush dev` runs this server and the API's in one terminal, so anything that
  // clears the screen also destroys the other server's output. Vite is not the
  // one clearing today, but the option is free insurance if that changes.
  clearScreen: false,
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // nitro() turns the default web-standard { fetch } server build into a self-listening
    // Node server (.output/server/index.mjs) — needed for the Docker Compose self-hosted
    // setup. Only enabled for `vite build`: as of nitro@3.0.260610-beta, its dev-mode module
    // runner fails to resolve @tanstack/react-start's default dev entry (a beta-package bug,
    // not a config issue — `vite dev` works fine without it since TanStack Start's own dev
    // server doesn't need a Node adapter).
    ...(command === "build" ? [nitro()] : []),
    viteReact(),
  ],
}));
