// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

const RESVG_WASM_ID = "@resvg/resvg-wasm/index_bg.wasm?module";
const RESVG_WASM_PATH = `${fileURLToPath(
  new URL("./node_modules/@resvg/resvg-wasm/index_bg.wasm", import.meta.url),
)}?module`;

const preserveResvgWasmForWorker = {
  name: "preserve-resvg-wasm-for-worker",
  enforce: "pre" as const,
  resolveId(id: string) {
    if (id === RESVG_WASM_ID) {
      return { id: RESVG_WASM_PATH, external: true };
    }
    return null;
  },
};

export default defineConfig({
  vite: {
    plugins: [preserveResvgWasmForWorker],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
