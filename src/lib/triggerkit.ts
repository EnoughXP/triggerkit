import type { Plugin } from 'vite';
import * as fs from 'node:fs';
import { resolve, relative } from 'node:path';
import { globSync } from 'glob';
import { parseFile } from './utils/parser';
import type { ExportedFunction, PluginOptions } from './types';
import { generateFunctionsModule } from './utils/generator';

const defaultOptions: Required<PluginOptions> = {
  includeDirs: ['src/lib', 'src/routes/api'],
  include: ['**/*.ts', '**/*.js', '**/+server.ts'],
  exclude: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts'],
  virtualModuleId: 'virtual:sveltekit-functions'
};

export function triggerkit(options: PluginOptions = {}): Plugin {
  const resolvedOptions = { ...defaultOptions, ...options };
  const { includeDirs, include, exclude, virtualModuleId } = resolvedOptions;
  const resolvedVirtualModuleId = '\0' + virtualModuleId;
  let exportedFunctions: ExportedFunction[] = [];

  return {
    name: 'vite-plugin-triggerkit',

    configResolved() {
      const cwd = process.cwd();
      exportedFunctions = includeDirs.flatMap(dir => {
        const dirPath = resolve(cwd, dir);
        if (!fs.existsSync(dirPath)) {
          console.warn(`Directory ${dirPath} does not exist`);
          return [];
        }

        const files = globSync(include, {
          cwd: dirPath,
          ignore: exclude,
          absolute: true
        }) || [];

        return files.flatMap(file => {
          try {
            const content = fs.readFileSync(file, 'utf-8');
            return parseFile(content, relative(cwd, file));
          } catch (error) {
            console.warn(`Error reading file ${file}:`, error);
            return [];
          }
        });
      });
    },

    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },

    load(id) {
      if (id === resolvedVirtualModuleId) {
        return generateFunctionsModule(exportedFunctions);
      }
    },

    handleHotUpdate({ file, server }) {
      const isWatchedFile = includeDirs.some(dir => file.includes(dir));
      if (isWatchedFile) {
        const mod = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
          return [mod];
        }
      }
    }
  };
}