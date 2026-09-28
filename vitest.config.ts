import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        include: ["src/**/*.test.{ts,tsx}"],
        typecheck: { enabled: true, include: ["src/**/*.test-d.ts"] },
    },
});
