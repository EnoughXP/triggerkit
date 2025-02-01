import type { Plugin, HmrContext, ModuleNode } from 'vite';
import * as fs from 'node:fs';
import { resolve, relative, sep } from 'node:path';
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
  let resolvedIncludeDirs: string[] = [];

  function updateExportedFunctions() {
    const cwd = process.cwd();
    exportedFunctions = resolvedIncludeDirs.flatMap(dirPath => {
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
  }

  return {
    name: 'vite-plugin-triggerkit',

    configResolved() {
      const cwd = process.cwd();
      resolvedIncludeDirs = includeDirs.map(dir => resolve(cwd, dir));
      updateExportedFunctions();
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

    handleHotUpdate(ctx: HmrContext) {
      const { file, server } = ctx;
      const isWatchedFile = resolvedIncludeDirs.some(dir => {
        const relativePath = relative(dir, file);
        return relativePath && !relativePath.startsWith('..') && !relativePath.startsWith(sep);
      });

      if (isWatchedFile) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const cwd = process.cwd();
          const relativePath = relative(cwd, file);
          const newFunctions = parseFile(content, relativePath);

          // Update the functions from this file
          exportedFunctions = exportedFunctions.filter(fn => fn.path !== relativePath);
          exportedFunctions.push(...newFunctions);

          const mod = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
            return [mod];
          }
        } catch (error) {
          console.warn(`Error updating file ${file}:`, error);
        }
      }
      return undefined;
    }
  };
}