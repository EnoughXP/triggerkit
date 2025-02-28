import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/lib/index.ts'),
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
        'node:path',
        'node:fs',
        // Add these to ensure they're properly externalized
        'lightningcss',
        '@parcel/css',
        '@parcel/css-darwin-x64',
        '@parcel/css-linux-x64',
        '@parcel/css-win32-x64'
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