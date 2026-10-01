import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Most specs run against a real in-memory MongoDB, one per file, all in parallel. On a busy
    // laptop a 1.5s test hit the 5s default (BS-5); 20s absorbs load without hiding real hangs.
    testTimeout: 20_000,
    // Each file starts its own MongoDB in beforeAll; under full parallel load that can take >10s.
    hookTimeout: 120_000,
  },
});
