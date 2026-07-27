// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// Inline the resvg wasm as a base64 data URL so the Cloudflare Worker
// receives the binary bytes at bundle time — no fs, no runtime fetch,
// no dynamic module resolution. Runtime compilation is handled via
// initWasm(bytes) inside the consumers.
const RESVG_WASM_VIRTUAL = "virtual:resvg-wasm-bytes";
const RESVG_WASM_RESOLVED = "\0" + RESVG_WASM_VIRTUAL;

const inlineResvgWasm = {
  name: "inline-resvg-wasm-bytes",
  enforce: "pre" as const,
  resolveId(id: string) {
    if (id === RESVG_WASM_VIRTUAL) return RESVG_WASM_RESOLVED;
    return null;
  },
  load(id: string) {
    if (id !== RESVG_WASM_RESOLVED) return null;
    const path = fileURLToPath(
      new URL("./node_modules/@resvg/resvg-wasm/index_bg.wasm", import.meta.url),
    );
    const bytes = readFileSync(path);
    const base64 = bytes.toString("base64");
    return `const b64=${JSON.stringify(base64)};
const bin=typeof atob==='function'?atob(b64):Buffer.from(b64,'base64').toString('binary');
const bytes=new Uint8Array(bin.length);
for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
export default bytes;`;
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
