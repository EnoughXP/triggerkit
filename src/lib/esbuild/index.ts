import type { Plugin } from 'esbuild';
import { esbuildPlugin } from "@trigger.dev/build/extensions";
import { posix, resolve } from 'node:path';
import type { TriggerkitOptions } from '../types';
import { generateEntryModule, scanForFunctions, VIRTUAL_MODULES_RESOLVED_ID } from '../utils';


export function triggerkit(options: TriggerkitOptions = {}): ReturnType<typeof esbuildPlugin> {
  const {
    placement = 'last',
    target = 'dev',
  } = options;

  const defaultOptions = {
    includeDirs: ['src/lib'],
    include: ['**/*.{ts,js}', '**/*.svelte.{ts,js}'],
    exclude: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts'],
  };
  const resolvedOptions = { ...defaultOptions, ...options };
  const { includeDirs, include, exclude } = resolvedOptions;
  let resolvedIncludeDirs: string[] = [];

  function normalizePath(path: string): string {
    return posix.normalize(path).replace(/\\/g, '/');
  }
  const esbuildConfig: Plugin = {
    name: 'triggerkit-virtual-esbuild',
    setup(build) {
      // Resolve include directories
      resolvedIncludeDirs = includeDirs.map(dir =>
        normalizePath(resolve(process.cwd(), dir))
      );

      // Resolve virtual:triggerkit imports
      build.onResolve({ filter: /^virtual:triggerkit$/ }, () => ({
        path: VIRTUAL_MODULES_RESOLVED_ID,
        namespace: 'triggerkit'
      }));

      // Load virtual module contents
      build.onLoad({ filter: /.*/, namespace: 'triggerkit' }, async () => {
        try {
          const { exportedFunctions, discoveredEnvVars } = await scanForFunctions(
            resolvedIncludeDirs,
            include,
            exclude
          );

          const contents = generateEntryModule(exportedFunctions, discoveredEnvVars);

          return {
            contents,
            loader: 'ts'
          };
        } catch (error) {
          console.error('Error generating triggerkit virtual module:', error);
          return {
            contents: '// Error generating triggerkit module',
            loader: 'ts'
          };
        }
      });
    }
  };

  return esbuildPlugin(esbuildConfig, { placement, target });
}