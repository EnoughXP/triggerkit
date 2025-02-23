import { normalizePath } from 'vite';
import type { Plugin, HmrContext } from 'vite';
import { dirname, resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import parseFile from './utils/parser.js';
import type { ExportedFunction, FunctionMap, PluginOptions } from './types.js';

export function triggerkit(options: PluginOptions = {}): Plugin {
  const defaultOptions: Required<PluginOptions> = {
    outputPath: 'src/trigger/generated/index.ts',
    includeDirs: ['src/lib', 'src/routes/api'],
    include: ['**/*.ts', '**/*.js', '**/+server.ts'],
    exclude: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts'],
  };

  const resolvedOptions = { ...defaultOptions, ...options };
  const { includeDirs, include, exclude, outputPath } = resolvedOptions;
  let resolvedIncludeDirs: string[] = [];
  let exportedFunctions: ExportedFunction[] = [];
  let discoveredEnvVars = new Set<string>();

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
        const relativePath = normalizePath(fullPath);

        if (entry.isDirectory()) {
          if (!exclude.some(pattern => relativePath.includes(pattern.replace('*', '')))) {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          if (include.some(pattern =>
            new RegExp(pattern.replace(/\*/g, '.*')).test(relativePath)
          )) {
            files.push(relativePath);
          }
        }
      }
    }

    await scan(dir);
    return files;
  }

  async function scanForFunctions() {
    const cwd = process.cwd();
    const allFiles = await Promise.all(
      resolvedIncludeDirs.map(dir => scanDirectory(dir))
    );

    const flatFiles = allFiles.flat();
    exportedFunctions = [];
    discoveredEnvVars.clear();

    for (const file of flatFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const relativePath = normalizePath(file).replace(normalizePath(cwd) + '/', '');

        const { exports, envVars } = parseFile(content, relativePath);
        envVars.forEach(v => discoveredEnvVars.add(v));
        exportedFunctions.push(...exports);
      } catch (error) {
        console.warn(`Error processing file ${file}: `, error);
      }
    }
  }

  async function generateFunctionsModule(functions: ExportedFunction[]) {
    // Group functions by their source file
    const groupedFunctions = functions.reduce<Record<string, ExportedFunction[]>>((acc, func) => {
      if (!acc[func.path]) {
        acc[func.path] = [];
      }
      acc[func.path].push(func);
      return acc;
    }, {});

    // Add env vars if present
    const envVars = [...discoveredEnvVars];
    const envImports = envVars.length > 0 ?
      `const { ${envVars.join(', ')} } = process.env;\n\n` : '';

    // Generate imports and exports grouped by file
    const imports: string[] = [];
    const exports: string[] = [];
    const functionMetadata: Record<string, {
      metadata: FunctionMetadata;
      path: string;
      envVars?: string[];
    }> = {};

    Object.entries(groupedFunctions).forEach(([path, funcs]) => {
      const exportNames = funcs.map(f => f.exportName).join(', ');
      imports.push(`import { ${exportNames} } from '$lib/${path}';`);

      funcs.forEach(func => {
        exports.push(`export const ${func.name} = ${func.exportName};`);
        functionMetadata[func.name] = {
          metadata: func.metadata,
          path: func.path,
          envVars: func.envVars
        };
      });
    });

    return `
    ${envImports}
    ${imports.join('\n')}

    ${exports.join('\n')}

    export const functions = ${JSON.stringify(functionMetadata, null, 2)} as const;
    
    export function getFunction(name: string) {
      return functions[name];
    }
    
    export function listFunctions(): string[] {
      return Object.keys(functions);
    }`;
  }


  return {
    name: 'vite-plugin-triggerkit',

    configResolved() {
      const cwd = process.cwd();
      resolvedIncludeDirs = includeDirs.map(dir =>
        normalizePath(resolve(cwd, dir))
      );
    },

    async buildStart() {
      await scanForFunctions();
      await fs.mkdir(dirname(outputPath), { recursive: true });
      const content = await generateFunctionsModule(exportedFunctions);
      await fs.writeFile(outputPath, content, 'utf-8');
    },

    async handleHotUpdate(ctx: HmrContext) {
      const { file } = ctx;
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

          const { exports, envVars } = parseFile(content, relativePath);
          envVars.forEach(v => discoveredEnvVars.add(v));

          exportedFunctions = exportedFunctions.filter(fn => fn.path !== relativePath);
          exportedFunctions.push(...exports);

          const moduleContent = await generateFunctionsModule(exportedFunctions);
          await fs.writeFile(outputPath, moduleContent, 'utf-8');
        } catch (error) {
          console.warn(`Error updating file ${file}:`, error);
        }
      }

      return [];
    }
  };
}