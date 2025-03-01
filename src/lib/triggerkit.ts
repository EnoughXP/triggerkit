import type { BuildExtension } from "@trigger.dev/build/extensions";
import { dirname, resolve } from 'node:path';
import type { ExportedFunction, PluginOptions, TriggerkitOptions, VirtualModuleStore } from './types/index.js';
import {
  generateTypeDeclaration,
  generateVirtualModule,
  NAMESPACE,
  scanDirectories,
  VIRTUAL_MODULE_ID,
} from './utils/index.js';


export function triggerkit(options: TriggerkitOptions = {}): BuildExtension {
  const defaultOptions: Required<PluginOptions> = {
    includeDirs: ['src/lib', 'src/lib/server'],
    include: ['**/*.ts', '**/*.js', '**/*+server.ts'],
    exclude: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts'],
  };

  const resolvedOptions: Required<TriggerkitOptions> = {
    ...defaultOptions,
    ...options,
    placement: options.placement || 'last',
    target: options.target || 'deploy',
  };

  // Virtual module cache
  const virtualModuleStore: VirtualModuleStore = {
    timestamp: 0,
    modules: {}
  };

  return {
    name: "triggerkit-extension",

    onBuildStart: async (context) => {
      context.logger.log("Triggerkit extension starting!");

      // Create and register an esbuild plugin
      const triggerkitPlugin = {
        name: 'triggerkit-plugin',
        setup(build) {
          // Resolve the virtual module
          build.onResolve({ filter: new RegExp(`^${VIRTUAL_MODULE_ID}$`) }, (args: { path: string; resolveDir: string }) => {
            context.logger.log(`Resolving virtual module: ${args.path}`);
            return {
              path: args.path,
              namespace: NAMESPACE
            };
          });

          // Also resolve for the alias pattern
          build.onResolve({ filter: /^triggerkit-virtual:/ }, (args: { path: string; resolveDir: string }) => {
            context.logger.log(`Resolving triggerkit alias: ${args.path}`);
            return {
              path: VIRTUAL_MODULE_ID,
              namespace: NAMESPACE,
            };
          });

          // Load the virtual module
          build.onLoad({ filter: /.*/, namespace: NAMESPACE }, async () => {
            const currentTime = Date.now();

            // Rescan if needed (either first time or stale cache)
            if (virtualModuleStore.timestamp === 0 || currentTime - virtualModuleStore.timestamp > 2000) {
              context.logger.log('Scanning for exportable functions...');

              try {
                // Scan for functions
                const parseResults = await scanDirectories(
                  resolvedOptions.includeDirs.map(dir => resolve(process.cwd(), dir)),
                  resolvedOptions.include,
                  resolvedOptions.exclude,
                  context
                );

                // Collect all exported functions and environment variables
                const allExports: ExportedFunction[] = [];
                const allEnvVars: Set<string> = new Set();

                for (const result of parseResults) {
                  allExports.push(...result.exports);
                  result.envVars.forEach(env => allEnvVars.add(env));
                }

                // Generate the virtual module content
                const moduleContent = generateVirtualModule(allExports, Array.from(allEnvVars));

                // Update the store
                virtualModuleStore.modules[VIRTUAL_MODULE_ID] = moduleContent;
                virtualModuleStore.timestamp = currentTime;

                // Generate type declaration file
                generateTypeDeclaration(allExports, context);

                context.logger.log(`Found ${allExports.length} exportable functions and ${allEnvVars.size} environment variables`);
              } catch (error) {
                context.logger.warn("Error scanning for functions:", error);
                virtualModuleStore.modules[VIRTUAL_MODULE_ID] = `
                  // triggerkit error: ${error instanceof Error ? error.message : 'Unknown error'}
                  console.error("[triggerkit] Error generating module: ", ${JSON.stringify(String(error))});
                  export const functions = {}; 
                `;
                virtualModuleStore.timestamp = currentTime;
              }
            }

            return {
              contents: virtualModuleStore.modules[VIRTUAL_MODULE_ID],
              loader: 'ts',
            };
          });

          // Handle direct imports from lib files
          build.onResolve({ filter: /^\.\.\/lib\// }, (args: { path: string; resolveDir: string, importer: string }) => {
            // Convert the relative import path to an absolute path
            const targetPath = resolve(dirname(args.importer), args.path);

            return {
              path: targetPath,
              external: false,
            };
          });
        }
      };

      // Register the plugin
      context.registerPlugin(triggerkitPlugin, {
        placement: resolvedOptions.placement,
        target: resolvedOptions.target,
      });
    }
  };
}