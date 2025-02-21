import { normalizePath } from 'vite';
import type { Plugin, HmrContext } from 'vite';
import { resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import parseFile from './utils/parser.js';
import type { ExportedFunction, FunctionMap, PluginOptions } from './types.js';


export function triggerkit(options: PluginOptions = {}): Plugin {
  const defaultOptions: Required<PluginOptions> = {
    includeDirs: ['src/lib', 'src/routes/api'],
    include: ['**/*.ts', '**/*.js', '**/+server.ts'],
    exclude: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts'],
    virtualModuleId: 'virtual:sveltekit-functions',
    env: { variables: [] }
  };

  const resolvedOptions = { ...defaultOptions, ...options };
  const { includeDirs, include, exclude, virtualModuleId, env } = resolvedOptions;
  const resolvedVirtualModuleId = '\0' + virtualModuleId;
  let exportedFunctions: ExportedFunction[] = [];
  let resolvedIncludeDirs: string[] = [];

  function generateEnvImports(variables: string[]): string {
    const uniqueVars = [...new Set(variables)].filter(Boolean);

    if (!uniqueVars.length) return '';

    return `const { ${uniqueVars.join(', ')} } = process.env;\n\n`;
  }
  function generateFunctionsModule(functions: ExportedFunction[]): string {
    const imports = functions
      .map((func) =>
        `import { ${func.exportName} } from '${func.path}';`
      )
      .join('\n');

    const exports_ = functions
      .map((func) =>
        `export const ${func.name} = ${func.exportName};`
      )
      .join('\n');

    const functionMap = functions.reduce<FunctionMap>((acc, func) => {
      const isAsyncFunc = func.metadata.isAsync ||
        func.metadata.returnType?.includes('Promise') ||
        func.metadata.returnType?.startsWith('Promise<');

      acc[func.exportName] = {
        metadata: {
          isAsync: isAsyncFunc,
          parameters: func.metadata.parameters.map(param => ({
            name: param.name,
            type: param.type,
            optional: param.optional || false
          })),
          returnType: func.metadata.returnType,
          docstring: func.metadata.docstring
        },
        path: func.path
      };
      return acc;
    }, {});

    return `
    ${imports}
    ${exports_}
    export const functions = ${JSON.stringify(functionMap, null, 2)};
    export function getFunction(name: string) {
      return functions[name];
    }
    export function listFunctions(): string[] {
      return Object.keys(functions);
    }`;
  }

  async function scanDirectory(dir: string): Promise<string[]> {
    const files: string[] = [];

    // Check if directory exists first
    try {
      await fs.access(dir);
    } catch (error) {
      console.warn(`Directory ${dir} does not exist, skipping...`);
      return files;
    }

    async function scan(currentDir: string) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = resolve(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (!exclude.includes(entry.name)) {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          const relativePath = normalizePath(fullPath);
          if (include.some(pattern => fullPath.endsWith(pattern.replace('*', '')))) {
            files.push(relativePath);
          }
        }
      }
    }

    await scan(dir);
    return files;
  }

  async function updateExportedFunctions() {
    const cwd = process.cwd();

    const allFiles = await Promise.all(
      resolvedIncludeDirs.map(dir => scanDirectory(dir))
    );

    const flatFiles = allFiles.flat();

    exportedFunctions = (await Promise.all(
      flatFiles.map(async file => {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const relativePath = normalizePath(file).replace(normalizePath(cwd) + '/', '');
          return parseFile(content, relativePath);
        } catch (error) {
          console.warn(`Error reading file ${file}:`, error);
          return [];
        }
      })
    )).flat();
  }

  return {
    name: 'vite-plugin-triggerkit',

    configResolved() {
      const cwd = process.cwd();
      resolvedIncludeDirs = includeDirs.map(dir =>
        normalizePath(resolve(cwd, dir))
      );
      updateExportedFunctions();
    },

    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },

    async load(id) {
      if (id === resolvedVirtualModuleId) {
        await updateExportedFunctions();

        const envImports = generateEnvImports(env.variables);
        const baseModule = generateFunctionsModule(exportedFunctions);

        return envImports + baseModule;
      }
    },

    async handleHotUpdate(ctx: HmrContext) {
      const { file, server } = ctx;
      const normalizedFile = normalizePath(file);

      const isWatchedFile = resolvedIncludeDirs.some(dir => {
        const normalizedDir = normalizePath(dir);
        return normalizedFile.startsWith(normalizedDir);
      });

      if (isWatchedFile) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const cwd = process.cwd();
          const relativePath = normalizePath(file).replace(normalizePath(cwd) + '/', '');
          const newFunctions = parseFile(content, relativePath);

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