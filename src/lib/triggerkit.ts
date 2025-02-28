import type { Plugin } from 'esbuild';
import { esbuildPlugin } from "@trigger.dev/build/extensions";
import { resolve } from 'node:path';
import type { TriggerkitOptions } from './types/index.js';
import {
  generateEntryModule,
  scanForFunctions,
  NAMESPACE,
} from './utils/index.js';

export function triggerkit(options: TriggerkitOptions = {}) {
  const {
    placement = 'last',
    target = 'dev',
  } = options;

  const defaultOptions = {
    includeDirs: ['src/lib'],
    include: ['**/*.ts', '**/*.js', '**/*.svelte.ts', '**/*.svelte.js'],
    exclude: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts'],
  };

  const resolvedOptions = { ...defaultOptions, ...options };
  const { includeDirs, include, exclude } = resolvedOptions;

  let cachedModuleContent: string | null = null;

  const esbuildConfig: Plugin = {
    name: 'vite-plugin-triggerkit',
    setup(build) {
      const resolvedIncludeDirs = includeDirs.map(dir =>
        resolve(process.cwd(), dir)
      );

      build.onResolve({ filter: /^(\.\.?\/.*|src\/lib\/.*)$/ }, (args) => {
        console.log(`[triggerkit] Resolving project path: ${args.path}`);

        // Handle project-specific relative paths
        const fullPath = resolve(args.resolveDir, args.path);

        // Ensure the path ends with .ts
        const finalPath = fullPath.endsWith('.ts') ? fullPath : `${fullPath}.ts`;

        console.log(`[triggerkit] Original import: ${args.path}`);
        console.log(`[triggerkit] Resolved project path: ${finalPath}`);

        return {
          path: finalPath,
          namespace: 'file'
        };
      });

      // Separate handler for virtual:triggerkit
      build.onResolve({ filter: /^virtual:triggerkit$/ }, (args) => {
        console.log(`[triggerkit] Resolving virtual module: ${args.path}`);
        return {
          path: args.path,
          namespace: NAMESPACE
        };
      });

      // Load the virtual module
      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, async (args) => {
        try {
          // If we have cached content, use it
          if (cachedModuleContent) {
            console.log('[triggerkit] Using cached virtual module');
            return {
              contents: cachedModuleContent,
              loader: 'ts',
              resolveDir: build.initialOptions.absWorkingDir
            };
          }

          const { exportedFunctions, discoveredEnvVars } = await scanForFunctions(
            resolvedIncludeDirs,
            include,
            exclude
          );

          cachedModuleContent = generateEntryModule(exportedFunctions, discoveredEnvVars);
          console.log(`[triggerkit] Generated module with ${exportedFunctions.length} functions`);
          console.log(`[triggerkit] ${cachedModuleContent}`);
          return {
            contents: cachedModuleContent,
            loader: 'ts',
            resolveDir: build.initialOptions.absWorkingDir
          };
        } catch (error) {
          console.error('[triggerkit] Error loading virtual module:', error);
          return {
            contents: `
              // triggerkit error: ${error instanceof Error ? error.message : 'Unknown error'}
              console.error("[triggerkit] Error generating module: ", ${JSON.stringify(String(error))});
              export const functions = {}; 
            `,
            loader: 'ts',
            resolveDir: build.initialOptions.absWorkingDir
          };
        }
      });

      build.onEnd(() => {
        cachedModuleContent = null;
      });
    }
  };

  return esbuildPlugin(esbuildConfig, { placement, target });
}