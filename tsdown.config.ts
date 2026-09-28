import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    platform: "browser",
    dts: true,
    clean: true,
    outDir: "dist",
    // Every export is a hook or a component; Next.js App Router needs the directive to use them from Server Components.
    banner: { js: '"use client";' },
});
