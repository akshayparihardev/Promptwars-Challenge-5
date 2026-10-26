/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devApi } from './scripts/dev-api';

/** The production security headers from vercel.json, reused by `vite preview` so e2e runs under the real CSP. */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    headers?: { headers: { key: string; value: string }[] }[];
  };
  return Object.fromEntries(
    (config.headers ?? []).flatMap((rule) => rule.headers.map((h) => [h.key, h.value])),
  );
}

export default defineConfig({
  plugins: [react(), devApi()],
  build: { target: 'es2022', sourcemap: false },
  preview: { headers: productionHeaders() },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // UI tests with axe are slow under coverage instrumentation; give them room on CI runners.
    testTimeout: 20_000,
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'text'],
      // Whole app (UI, state, API) and a stricter bar for the business-logic engine.
      thresholds: {
        lines: 99,
        statements: 98,
        functions: 97,
        branches: 90,
        'src/engine/**': { lines: 100, functions: 100, statements: 99, branches: 90 },
      },
    },
  },
});
