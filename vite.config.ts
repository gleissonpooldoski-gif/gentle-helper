// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RESVG_WASM_VIRTUAL_ID = "virtual:resvg-wasm-inline";
const RESVG_WASM_RESOLVED_ID = `\0${RESVG_WASM_VIRTUAL_ID}`;

const inlineResvgWasm = {
  name: "inline-resvg-wasm",
  resolveId(id: string) {
    return id === RESVG_WASM_VIRTUAL_ID ? RESVG_WASM_RESOLVED_ID : null;
  },
  load(id: string) {
    if (id !== RESVG_WASM_RESOLVED_ID) return null;
    const wasmPath = fileURLToPath(
      new URL("./node_modules/@resvg/resvg-wasm/index_bg.wasm", import.meta.url),
    );
    const dataUrl = `data:application/wasm;base64,${readFileSync(wasmPath).toString("base64")}`;
    return `export default ${JSON.stringify(dataUrl)};`;
  },
};

export default defineConfig({
  vite: {
    plugins: [inlineResvgWasm],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
