import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    ...configDefaults,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    maxWorkers: 1,
    poolOptions: {
      threads: {
        maxThreads: 1,
        minThreads: 1
      }
    },
    testTimeout: 10000,
    teardownTimeout: 1000
  }
});
