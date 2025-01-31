import { defineConfig, type Options } from 'tsup';
import { visualizer } from 'rollup-plugin-visualizer';

const baseConfig: Options = {
  entry: ['src/lib/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: process.env.NODE_ENV !== 'production',
  clean: true,
  minify: true,
  treeshake: true,
  external: [
    'vite',
    'node:fs',
    'node:path',
    'glob',
    '@sveltejs/kit',
    'svelte'
  ],
  noExternal: [
    /^@sveltejs\/kit/,
    /^svelte/
  ],
  esbuildOptions(options) {
    options.drop = ['console', 'debugger'];
  }
};

export default defineConfig(baseConfig);

export const analyzeConfig = defineConfig({
  ...baseConfig,
  plugins: [
    visualizer({
      filename: './dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }) as Plugin
  ]
});
