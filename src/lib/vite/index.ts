import { normalizePath } from 'vite';
import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import type { PluginOptions } from '../types';
import { generateEntryModule, scanForFunctions, VIRTUAL_MODULE_ID, VIRTUAL_MODULES_RESOLVED_ID } from '../utils';

export function triggerkit(options: PluginOptions = {}): Plugin {
  const defaultOptions: Required<PluginOptions> = {
    includeDirs: ['src/lib'],
    include: ['**/*.{ts,js}', '**/*.svelte.{ts,js}'],
    exclude: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts'],
  };

  const resolvedOptions = { ...defaultOptions, ...options };
  const { includeDirs, include, exclude } = resolvedOptions;
  let resolvedIncludeDirs: string[] = [];
  const virtualModules = new Map<string, string>();

  function getVirtualId(path: string): string {
    return path.startsWith('/')
      ? `${VIRTUAL_MODULES_RESOLVED_ID}${path.slice(1)}`
      : `${VIRTUAL_MODULES_RESOLVED_ID}${path}`;
  }

  return {
    name: 'vite-plugin-triggerkit',
    enforce: 'pre',
    configResolved() {
      const cwd = process.cwd();
      resolvedIncludeDirs = includeDirs.map(dir =>
        normalizePath(resolve(cwd, dir))
      );
    },

    async buildStart() {
      const { exportedFunctions, discoveredEnvVars } = await scanForFunctions(
        resolvedIncludeDirs,
        include,
        exclude
      );

      const entryModule = generateEntryModule(exportedFunctions, discoveredEnvVars);
      virtualModules.set(getVirtualId('entry'), entryModule);
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return VIRTUAL_MODULES_RESOLVED_ID;
      }
      return null;
    },

    load(id) {
      if (id === VIRTUAL_MODULES_RESOLVED_ID) {
        return virtualModules.get(getVirtualId('entry'));
      }
      return null;
    }
  };
}