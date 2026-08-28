import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  // nitro() turns the default web-standard { fetch } server build into a self-listening
  // Node server (dist/server/index.mjs) — needed for the Docker Compose self-hosted setup.
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
});
