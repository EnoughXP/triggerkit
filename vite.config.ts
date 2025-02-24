import { defineConfig } from 'vite';
import { resolve } from 'path';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/lib/index.ts'),
        trigger: resolve(__dirname, 'src/lib/trigger.ts'),
      },
      formats: ['es']
    },
    rollupOptions: {
      external: [
        'vite',
        'esbuild',
        '@trigger.dev/sdk',
        '@trigger.dev/build/extensions',
        '@typescript-eslint/typescript-estree',
        'fast-glob',
        'path',
        'fs',
        'node:path',
        'node:fs'
      ]
    }
  },
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