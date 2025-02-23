import type { Plugin } from 'esbuild';
import { esbuildPlugin } from "@trigger.dev/build/extensions";
import type { PluginOptions, TriggerkitOptions } from '../types';
import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { transformEnvImports } from '../utils';

export function triggerkit(options: TriggerkitOptions = {}): ReturnType<typeof esbuildPlugin> {
  const defaultOptions: Required<PluginOptions> = {
    includeDirs: ['src/lib'],
    include: ['**/*.{ts,js}', '**/*.svelte.{ts,js}'],
    exclude: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts'],
  };

  const {
    placement = 'last',
    target = 'dev',
    ...pluginOptions
  } = options;

  const resolvedOptions = { ...defaultOptions, ...pluginOptions };

  const esbuildConfig: Plugin = {
    name: 'triggerkit-esbuild',
    setup(build) {
      // Handle virtual:triggerkit imports
      build.onResolve({ filter: /^virtual:triggerkit$/ }, async (args) => {
        // Look for generated file in trigger dir
        const generatedPath = resolve(dirname(args.importer), 'src/trigger/generated/index.ts');
        try {
          await fs.access(generatedPath);
          return {
            path: generatedPath,
            namespace: 'triggerkit'
          };
        } catch {
          // If not found, search in node_modules as fallback
          return {
            path: resolve(args.resolveDir, 'node_modules/triggerkit/dist/index.js'),
            namespace: 'triggerkit'
          };
        }
      });

      // Handle $lib imports
      build.onResolve({ filter: /^\$lib\// }, async (args) => {
        const relativePath = args.path.replace(/^\$lib\//, '');
        const possiblePaths = [
          resolve(args.resolveDir, 'src/lib', relativePath),
          resolve(args.resolveDir, 'src/lib', `${relativePath}.ts`),
          resolve(args.resolveDir, 'src/lib', `${relativePath}.js`),
          resolve(args.resolveDir, 'src/lib', relativePath, '+server.ts'),
          resolve(args.resolveDir, 'src/lib', relativePath, 'index.ts'),
        ];

        for (const path of possiblePaths) {
          try {
            await fs.access(path);
            return {
              path,
              namespace: 'triggerkit-lib'
            };
          } catch { }
        }

        return {
          errors: [{
            text: `Could not resolve $lib import: ${args.path}. Tried paths: ${possiblePaths.join(', ')}`
          }]
        };
      });

      // Handle processing of files
      build.onLoad({ filter: /\.[jt]s$/, namespace: 'triggerkit-lib' }, async (args) => {
        try {
          const source = await fs.readFile(args.path, 'utf8');

          // Transform env imports to process.env
          const transformed = transformEnvImports(source);

          return {
            contents: transformed,
            loader: args.path.endsWith('.ts') ? 'ts' : 'js'
          };
        } catch (error) {
          return {
            errors: [{
              text: `Failed to load ${args.path}: ${error.message}`
            }]
          };
        }
      });

      // Handle +server.ts files
      build.onLoad({ filter: /\+server\.ts$/ }, async (args) => {
        try {
          const source = await fs.readFile(args.path, 'utf8');
          const transformed = transformEnvImports(source);

          return {
            contents: transformed,
            loader: 'ts'
          };
        } catch (error) {
          return {
            errors: [{
              text: `Failed to load server route ${args.path}: ${error.message}`
            }]
          };
        }
      });
    }
  };

  return esbuildPlugin(esbuildConfig, { placement, target });
}