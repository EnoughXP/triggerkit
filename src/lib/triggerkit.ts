import fs from "node:fs"
import path from 'node:path';
import type { BuildExtension } from "@trigger.dev/build/extensions";
import type { Plugin, OnLoadResult } from "esbuild";
import type { CachedFile, ExportedItem, FileWithExports, FileWithFunctions, PluginOptions } from './types/index.js';

const VIRTUAL_MODULE_ID = 'virtual:triggerkit';
const NAMESPACE = 'triggerkit-namespace';

function triggerkit(options?: PluginOptions): BuildExtension {
  const resolvedOptions: Required<PluginOptions> = {
    includeDirs: options?.includeDirs || ["src/lib"],
    filePatterns: options?.filePatterns || [".ts", ".js"],
    exclude: options?.exclude || ["test.", "spec.", ".d.ts"],
    exportStrategy: {
      mode: "individual",
      groupBy: "folder",
      ...options?.exportStrategy
    },
    includeTypes: {
      functions: true,
      classes: true,
      constants: false,
      variables: false,
      ...options?.includeTypes
    },
    debugLevel: options?.debugLevel || "minimal"
  }

  // Keep track of file states for rebuilding
  const fileCache: Map<string, CachedFile> = new Map();
  const envVars = new Set<string>();

  return {
    name: "triggerkit",

    onBuildStart: async (context) => {
      if (resolvedOptions.debugLevel !== "off") {
        context.logger.log("🚀 Triggerkit extension starting!");
      }

      if (resolvedOptions.debugLevel === "verbose") {
        context.logger.log("📋 Export strategy:", resolvedOptions.exportStrategy.mode);
        context.logger.log("🎯 Include types:", Object.entries(resolvedOptions.includeTypes).filter(([_, v]) => v).map(([k, _]) => k).join(', '));
      }
      // Load environment variables from SvelteKit's .env files
      await loadSvelteKitEnvironment(context, resolvedOptions.debugLevel);

      // Clear the file cache to start fresh
      fileCache.clear();
      envVars.clear();

      // Scan each folder for function files
      for (const includeDir of resolvedOptions.includeDirs) {
        const dirPath = path.resolve(context.workingDir, includeDir);

        // Check if the folder exists
        if (!fs.existsSync(dirPath)) {
          if (resolvedOptions.debugLevel !== "off") {
            context.logger.warn(`⚠️  Directory ${includeDir} does not exist, skipping`);
          }
          continue;
        }
        await scanFolderForEnvVars(
          dirPath,
          resolvedOptions.filePatterns,
          resolvedOptions.exclude,
          envVars,
          context,
          resolvedOptions.debugLevel
        );

        // Scan the folder recursively
        await scanFolderForExports(
          dirPath,
          resolvedOptions.filePatterns,
          resolvedOptions.exclude,
          fileCache,
          context,
          resolvedOptions.includeTypes
        );
      }

      // Debug: Log all cached files
      if (resolvedOptions.debugLevel === "verbose") {
        context.logger.log("📝 Files in cache:");
        for (const [filePath, cachedFile] of fileCache.entries()) {
          const exportedItems = extractExportedItems(cachedFile.content || '', resolvedOptions.includeTypes);
          const exportNames = exportedItems.map(item => `${item.name}(${item.type})`);
          context.logger.log(`  - ${filePath}: [${exportNames.join(', ')}]`);
        }
      }

      // Only proceed if we have files to process
      if (fileCache.size === 0) {
        if (resolvedOptions.debugLevel !== "off") {
          context.logger.warn("❌ No export files found, triggerkit will not be active");
        }
        return;
      }

      if (resolvedOptions.debugLevel !== "off") {
        context.logger.log(`✅ Found ${fileCache.size} export files`);
      }

      // Create and register an esbuild plugin
      const triggerKitPlugin: Plugin = {
        name: 'virtual-triggerkit-module',
        setup(build) {
          if (resolvedOptions.debugLevel === "verbose") {
            context.logger.log("🔧 Setting up esbuild plugin");
          }

          // Enhance module resolution
          build.onResolve({ filter: /^src\// }, (args) => {
            // Resolve paths relative to the working directory
            let resolvedPath = path.resolve(context.workingDir, args.path);
            const extensions = ['.ts', '.js'];
            if (!fs.existsSync(resolvedPath)) {
              for (const ext of extensions) {
                const pathWithExt = resolvedPath + ext;
                if (fs.existsSync(pathWithExt)) {
                  resolvedPath = pathWithExt;
                  break;
                }
              }
            }
            return { path: resolvedPath };
          });

          // Handle requests for our virtual module
          build.onResolve({ filter: /^virtual:triggerkit$/ }, (args) => {
            if (resolvedOptions.debugLevel === "verbose") {
              context.logger.log("🎯 VIRTUAL MODULE REQUESTED!", args);
            }
            if (fileCache.size === 0) {
              if (resolvedOptions.debugLevel !== "off") {
                context.logger.warn("❌ No export files found when resolving virtual module");
              }
              return { errors: [{ text: 'No export files found' }] };
            }

            if (resolvedOptions.debugLevel === "verbose") {
              context.logger.log("✅ Resolving virtual:triggerkit module");
            }
            return {
              path: VIRTUAL_MODULE_ID,
              namespace: NAMESPACE
            };
          });

          // Handle SvelteKit env imports
          build.onResolve({ filter: /^\$env\/static\/(public|private)$/ }, () => {
            return {
              path: VIRTUAL_MODULE_ID,
              namespace: NAMESPACE
            };
          });

          // Handle loading the virtual module
          build.onLoad({ filter: /.*/, namespace: NAMESPACE }, async () => {
            if (resolvedOptions.debugLevel === "verbose") {
              context.logger.log("📦 LOADING VIRTUAL MODULE CONTENT");
            }

            if (fileCache.size === 0) {
              if (resolvedOptions.debugLevel !== "off") {
                context.logger.warn("❌ No export files found when loading virtual module");
              }
              return { errors: [{ text: 'No export files found' }] };
            }

            // Generate virtual module content based on export strategy
            const moduleContent = generateVirtualModuleContent(
              fileCache,
              envVars,
              resolvedOptions,
              context
            );

            if (resolvedOptions.debugLevel === "verbose") {
              context.logger.log("📝 Generated module content (first 500 chars):");
              context.logger.log(moduleContent.substring(0, 500));
            }

            return {
              contents: moduleContent,
              loader: 'ts',
            } as OnLoadResult;
          });
        },
      };

      // Register the plugin
      context.registerPlugin(triggerKitPlugin);
      context.logger.log("✅ Plugin registered");

      // Generate type declarations
      generateFunctionTypeDeclarations(context, fileCache);

      // Add function files as a layer to ensure they're included in the build
      const layerFiles: Record<string, string> = {};
      for (const [filePath, _] of fileCache.entries()) {
        const relativePath = path.relative(context.workingDir, filePath);
        layerFiles[relativePath] = filePath;
      }

      context.addLayer({
        id: "triggerkit-layer",
        files: layerFiles
      });

      context.logger.log("🎉 Triggerkit setup complete!");
    }
  };
}

// Enhanced extraction to support classes
function extractExportedItems(
  content: string,
  includeTypes: Required<PluginOptions>['includeTypes']
): ExportedItem[] {
  const exportedItems: ExportedItem[] = [];

  // Function patterns
  if (includeTypes.functions) {
    const functionPatterns = [
      // export function name<T>(params): ReturnType or export async function name<T>(params): ReturnType
      /export\s+(async\s+)?function\s+([a-zA-Z0-9_$]+)(\s*<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^{;]+))?/g,

      // export const name = (params): ReturnType => or export const name = async (params): ReturnType =>
      /export\s+const\s+([a-zA-Z0-9_$]+)\s*=\s*(async\s+)?\(([^)]*)\)\s*:\s*([^=>{]+)\s*=>/g,

      // export const name: Type = function or export const name: Type = async function
      /export\s+const\s+([a-zA-Z0-9_$]+)\s*:\s*([^=]+)\s*=\s*(async\s+)?function/g,

      // export const name = async? function(params): ReturnType
      /export\s+const\s+([a-zA-Z0-9_$]+)\s*=\s*(async\s+)?function\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g,

      // export const name = async? (params) => (without explicit return type)
      /export\s+const\s+([a-zA-Z0-9_$]+)\s*=\s*(async\s+)?\(([^)]*)\)\s*=>/g,
    ];

    for (const pattern of functionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let name: string;
        let isAsync: boolean;
        let params: string;
        let returnType: string;
        let signature: string;

        // Handle different regex capture groups based on pattern
        if (pattern.source.includes('export\\s+(async\\s+)?function')) {
          // Pattern 1: export [async] function name<T>(params): ReturnType
          isAsync = !!match[1];
          name = match[2];
          const generics = match[3] || '';
          params = match[4] || '';
          returnType = match[5] ? match[5].trim() : 'any';

          signature = `function ${name}${generics}(${params})`;
          if (isAsync) {
            returnType = returnType === 'any' ? 'Promise<any>' : `Promise<${returnType}>`;
          }
          signature += `: ${returnType}`;

        } else if (pattern.source.includes('\\)\\s*:\\s*([^=>{]+)\\s*=>')) {
          // Pattern 2: export const name = async? (params): ReturnType =>
          name = match[1];
          isAsync = !!match[2];
          params = match[3] || '';
          returnType = match[4] ? match[4].trim() : 'any';

          signature = `const ${name}: (${params}) => ${returnType}`;

        } else if (pattern.source.includes(':\\s*([^=]+)\\s*=\\s*(async\\s+)?function')) {
          // Pattern 3: export const name: Type = async? function
          name = match[1];
          const typeAnnotation = match[2] ? match[2].trim() : '';
          isAsync = !!match[3];

          signature = `const ${name}: ${typeAnnotation}`;
          returnType = typeAnnotation;
          params = '';

        } else if (pattern.source.includes('function\\s*\\(([^)]*)\\)(?:\\s*:\\s*([^{]+))?')) {
          // Pattern 4: export const name = async? function(params): ReturnType
          name = match[1];
          isAsync = !!match[2];
          params = match[3] || '';
          returnType = match[4] ? match[4].trim() : 'any';

          signature = `const ${name}: (${params}) => ${isAsync ? `Promise<${returnType}>` : returnType}`;

        } else {
          // Pattern 5: export const name = async? (params) => (no explicit return type)
          name = match[1];
          isAsync = !!match[2];
          params = match[3] || '';
          returnType = isAsync ? 'Promise<any>' : 'any';

          signature = `const ${name}: (${params}) => ${returnType}`;
        }

        // Don't add duplicates
        if (!exportedItems.some(item => item.name === name)) {
          exportedItems.push({
            name,
            type: 'function',
            signature,
            isAsync,
            returnType,
            params
          });
        }
      }
    }
  }

  // Class patterns
  if (includeTypes.classes) {
    const classPattern = /export\s+(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)(\s*<[^>]*>)?(?:\s+extends\s+([^{]+?))?(?:\s+implements\s+([^{]+?))?/g;

    let match;
    while ((match = classPattern.exec(content)) !== null) {
      const className = match[1];
      const generics = match[2] || '';
      const extendsClause = match[3] ? match[3].trim() : '';
      const implementsClause = match[4] ? match[4].trim() : '';

      // Extract class body to find methods and properties
      const classBodyRegex = new RegExp(
        `export\\s+(?:abstract\\s+)?class\\s+${className}[^{]*\\{([^}]*)\\}`,
        's'
      );
      const classBodyMatch = classBodyRegex.exec(content);

      let classInfo: {
        methods: Array<{ name: string; signature: string; isStatic: boolean }>;
        properties: Array<{ name: string; type: string; isStatic: boolean }>;
        constructor?: { params: string };
      } = {
        methods: [],
        properties: [],
        constructor: undefined
      };

      if (classBodyMatch) {
        const classBody = classBodyMatch[1];

        // Extract constructor
        const constructorMatch = classBody.match(/constructor\s*\(([^)]*)\)/);
        if (constructorMatch) {
          classInfo.constructor = { params: constructorMatch[1] };
        }

        // Extract methods
        const methodRegex = /(static\s+)?(async\s+)?([a-zA-Z0-9_$]+)\s*(\<[^>]*\>)?\s*\(([^)]*)\)(?:\s*:\s*([^{;]+))?/g;
        let methodMatch;
        while ((methodMatch = methodRegex.exec(classBody)) !== null) {
          const isStatic = !!methodMatch[1];
          const isAsync = !!methodMatch[2];
          const methodName = methodMatch[3];
          const methodGenerics = methodMatch[4] || '';
          const methodParams = methodMatch[5] || '';
          const methodReturnType = methodMatch[6] ? methodMatch[6].trim() : 'any';

          // Skip constructor (already handled)
          if (methodName === 'constructor') continue;

          const methodSignature = `${isStatic ? 'static ' : ''}${isAsync ? 'async ' : ''}${methodName}${methodGenerics}(${methodParams}): ${methodReturnType}`;

          classInfo.methods.push({
            name: methodName,
            signature: methodSignature,
            isStatic
          });
        }

        // Extract properties
        const propertyRegex = /(static\s+)?(readonly\s+)?([a-zA-Z0-9_$]+)\s*:\s*([^;=]+)/g;
        let propertyMatch;
        while ((propertyMatch = propertyRegex.exec(classBody)) !== null) {
          const isStatic = !!propertyMatch[1];
          const isReadonly = !!propertyMatch[2];
          const propertyName = propertyMatch[3];
          const propertyType = propertyMatch[4].trim();

          classInfo.properties.push({
            name: propertyName,
            type: `${isReadonly ? 'readonly ' : ''}${propertyType}`,
            isStatic
          });
        }
      }

      // Build class signature
      let signature = `class ${className}${generics}`;
      if (extendsClause) signature += ` extends ${extendsClause}`;
      if (implementsClause) signature += ` implements ${implementsClause}`;

      exportedItems.push({
        name: className,
        type: 'class',
        signature,
        isAsync: false,
        returnType: className,
        params: classInfo.constructor?.params || '',
        classInfo
      });
    }
  }

  // Constants and variables
  if (includeTypes.constants || includeTypes.variables) {
    const constantPattern = /export\s+const\s+([a-zA-Z0-9_$]+)\s*:\s*([^=]+)\s*=/g;
    let match;
    while ((match = constantPattern.exec(content)) !== null) {
      const name = match[1];
      const type = match[2].trim();

      // Skip if it's already identified as a function
      if (!exportedItems.some(item => item.name === name)) {
        exportedItems.push({
          name,
          type: 'const',
          signature: `const ${name}: ${type}`,
          isAsync: false,
          returnType: type,
          params: ''
        });
      }
    }
  }

  // Handle export { ... } statements
  const exportStatements = content.match(/export\s*\{\s*([^}]+)\s*\}/g);
  if (exportStatements) {
    for (const statement of exportStatements) {
      const match = statement.match(/export\s*\{\s*([^}]+)\s*\}/);
      if (match) {
        const exports = match[1].split(',').map(item => {
          const cleaned = item.trim().split(/\s+as\s+/)[0];
          return cleaned.trim();
        });

        for (const exportName of exports) {
          if (!exportedItems.some(item => item.name === exportName)) {
            // Try to determine the type by looking for declarations
            if (includeTypes.classes && new RegExp(`(?:abstract\\s+)?class\\s+${exportName}\\s*[<{]`).test(content)) {
              exportedItems.push({
                name: exportName,
                type: 'class',
                signature: `class ${exportName}`,
                isAsync: false,
                returnType: exportName,
                params: '',
                classInfo: { methods: [], properties: [], constructor: undefined }
              });
            } else if (includeTypes.functions && new RegExp(`(?:function\\s+${exportName}|const\\s+${exportName}\\s*=\\s*(?:async\\s+)?(?:function|\\())`).test(content)) {
              exportedItems.push({
                name: exportName,
                type: 'function',
                signature: `function ${exportName}(...args: any[]): any`,
                isAsync: false,
                returnType: 'any',
                params: '...args: any[]'
              });
            }
          }
        }
      }
    }
  }
  return exportedItems;
}
// Helper function to load SvelteKit environment variables
async function loadSvelteKitEnvironment(context: any, debugLevel: Required<PluginOptions>['debugLevel']): Promise<void> {
  const envFiles = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local'
  ];

  let totalEnvVarsLoaded = 0;

  for (const envFile of envFiles) {
    const envPath = path.resolve(context.workingDir, envFile);
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const envVars = parseEnvFile(envContent);
        if (debugLevel === "verbose") {
          context.logger.log(`🔍 Found ${Object.keys(envVars).length} variables in ${envFile}:`);
        }
        // Set environment variables
        for (const [key, value] of Object.entries(envVars)) {
          if (!process.env[key]) {
            process.env[key] = value;
            context.logger.log(`  ✅ ${key} = ${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`);
            totalEnvVarsLoaded++;
          } else {
            context.logger.log(`  ⚠️  ${key} already set, skipping`);
          }
        }

        if (debugLevel !== "off") {
          context.logger.log(`🌍 Loaded ${Object.keys(envVars).length} environment variables from ${envFile}`);
        }
      } catch (error) {
        if (debugLevel !== "off") {
          context.logger.warn(`⚠️  Could not load ${envFile}:`, error);
        }
      }
    } else if (debugLevel === "verbose") {
      context.logger.log(`📝 ${envFile} not found`);
    }
  }

  // Debug: Show specific variables we care about
  if (debugLevel === "verbose") {
    const importantVars = ['PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
    context.logger.log(`🔍 Checking important environment variables:`);
    for (const varName of importantVars) {
      const value = process.env[varName];
      if (value) {
        context.logger.log(`  ✅ ${varName} = ${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`);
      } else {
        context.logger.log(`  ❌ ${varName} = undefined`);
      }
    }

    context.logger.log(`📊 Total environment variables loaded: ${totalEnvVarsLoaded}`);
  }
}
// Helper function to parse .env file content
function parseEnvFile(content: string): Record<string, string> {
  const envVars: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '');
      envVars[key] = cleanValue;
    }
  }

  return envVars;
}
// Helper function to scan a folder recursively for exports
async function scanFolderForExports(
  folderPath: string,
  filePatterns: string[],
  excludePatterns: string[],
  fileCache: Map<string, CachedFile>,
  context: any,
  includeTypes: Required<PluginOptions>['includeTypes']
) {
  try {
    const files = await fs.promises.readdir(folderPath, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(folderPath, file.name);

      // Skip entries that match exclude patterns
      if (excludePatterns.some(pattern => file.name.includes(pattern))) {
        continue;
      }

      if (file.isDirectory()) {
        // Recursively scan subdirectories
        await scanFolderForExports(fullPath, filePatterns, excludePatterns, fileCache, context, includeTypes);
      } else if (file.isFile()) {
        // Check if the file matches our patterns
        const hasMatchingExtension = filePatterns.some(ext => file.name.endsWith(ext));

        if (hasMatchingExtension) {
          // Get file stats to check modification time
          const fileStats = fs.statSync(fullPath);
          const currentLastModified = fileStats.mtimeMs;

          const existingCache = fileCache.get(fullPath);

          // Check if the file has been modified since last build
          if (!existingCache || currentLastModified !== existingCache.lastModified) {
            context.logger.log(`Found or updated export file: ${fullPath}`);

            try {
              const content = fs.readFileSync(fullPath, 'utf-8');

              // Transform SvelteKit environment imports
              const transformedContent = transformSvelteKitEnvImports(content);

              // Only cache if it has exports we care about
              const exportedItems = extractExportedItems(transformedContent, includeTypes);

              if (exportedItems.length > 0) {
                const exportTypes = exportedItems.map(item => item.type);
                const typeCounts = exportTypes.reduce((acc, type) => {
                  acc[type] = (acc[type] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                const typeCountStr = Object.entries(typeCounts)
                  .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
                  .join(', ');

                console.log(`✅ Found ${exportedItems.length} exports in ${file.name}: ${typeCountStr}`);

                fileCache.set(fullPath, {
                  path: fullPath,
                  lastModified: currentLastModified,
                  content: transformedContent
                });
              } else {
                console.log(`❌ No matching exports found in ${file.name}`);
              }
            } catch (error) {
              context.logger.warn(`Error reading file ${fullPath}:`, error);
            }
          } else {
            context.logger.log(`Using cached version of: ${fullPath}`);
          }
        }
      }
    }
  } catch (error) {
    context.logger.warn(`Error scanning folder ${folderPath}:`, error);
  }
}
// Helper function to scan a folder for environment variables
async function scanFolderForEnvVars(
  dirPath: string,
  filePatterns: string[],
  excludePatterns: string[],
  envVars: Set<string>,
  context: any,
  debugLevel: Required<PluginOptions>['debugLevel']
) {
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);

      // Skip excluded files
      if (excludePatterns.some(pattern => file.name.includes(pattern))) continue;

      if (file.isDirectory()) {
        // Recursively scan subdirectories
        await scanFolderForEnvVars(fullPath, filePatterns, excludePatterns, envVars, context, debugLevel);
      } else if (file.isFile() && filePatterns.some(ext => file.name.endsWith(ext))) {
        try {
          // Read file content
          const content = fs.readFileSync(fullPath, 'utf8');
          // Extract env vars
          extractEnvironmentVariables(content, envVars);
        } catch (error) {
          if (debugLevel !== "off") {
            context.logger.warn(`Error reading file: ${fullPath}`, error);
          }
        }
      }
    }
  } catch (error) {
    if (debugLevel !== "off") {
      context.logger.warn(`Error scanning dir for env vars: ${dirPath}`, error);
    }
  }
}
// Helper function to transform SvelteKit env imports to use process.env
function transformSvelteKitEnvImports(source: string): string {
  // Transform imports from $env/static/public or $env/static/private
  return source.replace(
    /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"](\$env\/static\/(?:public|private))['"]/g,
    (match: string, imports: string) => {
      // Parse the imported variables
      const variables = imports.split(',').map(v => v.trim());
      // Generate a destructuring assignment from process.env
      const result = `const { ${variables.join(', ')} } = process.env;\n`;
      return result;
    }
  );
}
// Enhanced function to extract function signatures with full type information
function extractFunctionSignatures(content: string): Array<{
  name: string;
  signature: string;
  isAsync: boolean;
  returnType: string;
  params: string;
}> {
  const functionSignatures: Array<{
    name: string;
    signature: string;
    isAsync: boolean;
    returnType: string;
    params: string;
  }> = [];

  // Enhanced regex patterns to capture full function signatures
  const patterns = [
    // export function name<T>(params): ReturnType or export async function name<T>(params): ReturnType
    /export\s+(async\s+)?function\s+([a-zA-Z0-9_$]+)(\s*<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^{;]+))?/g,

    // export const name = (params): ReturnType => or export const name = async (params): ReturnType =>
    /export\s+const\s+([a-zA-Z0-9_$]+)\s*=\s*(async\s+)?\(([^)]*)\)\s*:\s*([^=>{]+)\s*=>/g,

    // export const name: Type = function or export const name: Type = async function
    /export\s+const\s+([a-zA-Z0-9_$]+)\s*:\s*([^=]+)\s*=\s*(async\s+)?function/g,

    // export const name = async? function(params): ReturnType
    /export\s+const\s+([a-zA-Z0-9_$]+)\s*=\s*(async\s+)?function\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g,

    // export const name = async? (params) => (without explicit return type)
    /export\s+const\s+([a-zA-Z0-9_$]+)\s*=\s*(async\s+)?\(([^)]*)\)\s*=>/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      let name: string;
      let isAsync: boolean;
      let params: string;
      let returnType: string;
      let signature: string;

      // Handle different regex capture groups based on pattern
      if (pattern.source.includes('export\\s+(async\\s+)?function')) {
        // Pattern 1: export [async] function name<T>(params): ReturnType
        isAsync = !!match[1];
        name = match[2];
        const generics = match[3] || '';
        params = match[4] || '';
        returnType = match[5] ? match[5].trim() : 'any';

        signature = `function ${name}${generics}(${params})`;
        if (isAsync) {
          returnType = returnType === 'any' ? 'Promise<any>' : `Promise<${returnType}>`;
        }
        signature += `: ${returnType}`;

      } else if (pattern.source.includes('\\)\\s*:\\s*([^=>{]+)\\s*=>')) {
        // Pattern 2: export const name = async? (params): ReturnType =>
        name = match[1];
        isAsync = !!match[2];
        params = match[3] || '';
        returnType = match[4] ? match[4].trim() : 'any';

        signature = `const ${name}: (${params}) => ${returnType}`;

      } else if (pattern.source.includes(':\\s*([^=]+)\\s*=\\s*(async\\s+)?function')) {
        // Pattern 3: export const name: Type = async? function
        name = match[1];
        const typeAnnotation = match[2] ? match[2].trim() : '';
        isAsync = !!match[3];

        signature = `const ${name}: ${typeAnnotation}`;
        returnType = typeAnnotation;
        params = '';

      } else if (pattern.source.includes('function\\s*\\(([^)]*)\\)(?:\\s*:\\s*([^{]+))?')) {
        // Pattern 4: export const name = async? function(params): ReturnType
        name = match[1];
        isAsync = !!match[2];
        params = match[3] || '';
        returnType = match[4] ? match[4].trim() : 'any';

        signature = `const ${name}: (${params}) => ${isAsync ? `Promise<${returnType}>` : returnType}`;

      } else {
        // Pattern 5: export const name = async? (params) => (no explicit return type)
        name = match[1];
        isAsync = !!match[2];
        params = match[3] || '';
        returnType = isAsync ? 'Promise<any>' : 'any';

        signature = `const ${name}: (${params}) => ${returnType}`;
      }

      // Don't add duplicates
      if (!functionSignatures.some(f => f.name === name)) {
        functionSignatures.push({
          name,
          signature,
          isAsync,
          returnType,
          params
        });
      }
    }
  }

  // Handle export { ... } statements by looking for function declarations
  const exportStatements = content.match(/export\s*\{\s*([^}]+)\s*\}/g);
  if (exportStatements) {
    for (const statement of exportStatements) {
      const match = statement.match(/export\s*\{\s*([^}]+)\s*\}/);
      if (match) {
        const exports = match[1].split(',').map(item => {
          const cleaned = item.trim().split(/\s+as\s+/)[0];
          return cleaned.trim();
        });

        for (const exportName of exports) {
          // Look for the function declaration in the content
          const patterns = [
            new RegExp(`(async\\s+)?function\\s+${exportName}\\s*(\\<[^>]*\\>)?\\s*\\(([^)]*)\\)(?:\\s*:\\s*([^{;]+))?`, 'g'),
            new RegExp(`const\\s+${exportName}\\s*=\\s*(async\\s+)?\\(([^)]*)\\)\\s*:\\s*([^=>{]+)\\s*=>`, 'g'),
            new RegExp(`const\\s+${exportName}\\s*=\\s*(async\\s+)?\\(([^)]*)\\)\\s*=>`, 'g'),
            new RegExp(`const\\s+${exportName}\\s*:\\s*([^=]+)\\s*=`, 'g'),
          ];

          for (const funcPattern of patterns) {
            const funcMatch = funcPattern.exec(content);
            if (funcMatch && !functionSignatures.some(f => f.name === exportName)) {
              let isAsync: boolean;
              let params: string;
              let returnType: string;
              let signature: string;

              if (funcPattern.source.includes('function')) {
                isAsync = !!funcMatch[1];
                const generics = funcMatch[2] || '';
                params = funcMatch[3] || '';
                returnType = funcMatch[4] ? funcMatch[4].trim() : 'any';

                signature = `function ${exportName}${generics}(${params})`;
                if (isAsync) {
                  returnType = returnType === 'any' ? 'Promise<any>' : `Promise<${returnType}>`;
                }
                signature += `: ${returnType}`;

              } else if (funcPattern.source.includes('\\)\\s*:\\s*([^=>{]+)')) {
                isAsync = !!funcMatch[1];
                params = funcMatch[2] || '';
                returnType = funcMatch[3] ? funcMatch[3].trim() : 'any';

                signature = `const ${exportName}: (${params}) => ${returnType}`;

              } else if (funcPattern.source.includes('\\)\\s*=>')) {
                isAsync = !!funcMatch[1];
                params = funcMatch[2] || '';
                returnType = isAsync ? 'Promise<any>' : 'any';

                signature = `const ${exportName}: (${params}) => ${returnType}`;

              } else {
                const typeAnnotation = funcMatch[1] ? funcMatch[1].trim() : 'any';
                signature = `const ${exportName}: ${typeAnnotation}`;
                returnType = typeAnnotation;
                params = '';
                isAsync = typeAnnotation.includes('Promise');
              }

              functionSignatures.push({
                name: exportName,
                signature,
                isAsync,
                returnType,
                params
              });
              break;
            }
          }
        }
      }
    }
  }

  return functionSignatures;
}
// Helper function to extract environment variables from a file
function extractEnvironmentVariables(source: string, envVars: Set<string>): void {
  // Find all imports from $env/static/public or $env/static/private
  const envImportRegex = /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"](\$env\/static\/(?:public|private))['"]/g;
  let match;

  // Process all env imports (both public and private)
  while ((match = envImportRegex.exec(source)) !== null) {
    const variables = match[1].split(',').map(v => v.trim());
    for (const varName of variables) {
      envVars.add(varName);
    }
  }
}
// Generate virtual module content based on export strategy
function generateVirtualModuleContent(
  fileCache: Map<string, CachedFile>,
  envVars: Set<string>,
  options: Required<PluginOptions>,
  context: any
): string {
  let moduleContent = '// Generated by triggerkit\n\n';

  // Environment variables
  if (envVars.size > 0) {
    moduleContent += '// Environment variables\n';
    context.logger.log(`🌍 Generating exports for ${envVars.size} environment variables:`);

    for (const varName of envVars) {
      const envValue = process.env[varName];
      context.logger.log(`  📝 ${varName} = ${envValue ? envValue.substring(0, 20) + (envValue.length > 20 ? '...' : '') : 'undefined'}`);

      moduleContent += `export const ${varName} = process.env.${varName};\n`;
    }
    moduleContent += '\n';
  }

  // Organize files by folder and extract exports
  const filesByFolder: Record<string, Map<string, FileWithExports>> = {};

  for (const [filePath, cachedFile] of fileCache.entries()) {
    if (!cachedFile.content) continue;

    const exportedItems = extractExportedItems(cachedFile.content, options.includeTypes);
    if (exportedItems.length === 0) continue;

    const relPath = path.relative(context.workingDir, filePath);
    const dirName = path.dirname(relPath);

    if (!filesByFolder[dirName]) {
      filesByFolder[dirName] = new Map();
    }

    filesByFolder[dirName].set(filePath, {
      path: filePath,
      relPath,
      exportedItems
    });
  }

  const exportStrategy = options.exportStrategy;

  if (exportStrategy.mode === "individual") {
    return generateIndividualExports(filesByFolder, moduleContent);
  } else if (exportStrategy.mode === "grouped") {
    return generateGroupedExports(filesByFolder, moduleContent, exportStrategy);
  } else if (exportStrategy.mode === "mixed") {
    return generateMixedExports(filesByFolder, moduleContent, exportStrategy);
  }

  return moduleContent;
}
function generateGroupedExports(
  filesByFolder: Record<string, Map<string, FileWithExports>>,
  moduleContent: string,
  strategy: NonNullable<Required<PluginOptions>["exportStrategy"]>
): string {
  const groups: Record<string, string[]> = {};
  const imports: string[] = [];

  // Organize exports into groups
  for (const [folder, files] of Object.entries(filesByFolder)) {
    for (const [_, fileInfo] of files.entries()) {
      const importPath = fileInfo.relPath.replace(/\.(ts|js)$/, '');
      const importNames = fileInfo.exportedItems.map(item => item.name).join(', ');
      imports.push(`import { ${importNames} } from '${importPath}';`);

      for (const item of fileInfo.exportedItems) {
        let groupName: string;

        switch (strategy.groupBy) {
          case "file":
            const fileName = fileInfo.relPath.split('/').pop()?.replace(/\.(ts|js)$/, '') || 'default';
            groupName = strategy.groupPrefix ? `${strategy.groupPrefix}_${fileName}` : fileName;
            break;

          case "folder":
            const folderName = folder.replace(/[\/\\]/g, '_');
            groupName = strategy.groupPrefix ? `${strategy.groupPrefix}_${folderName}` : folderName;
            break;
          default:
            groupName = folder.replace(/[\/\\]/g, '_');
        }

        // Sanitize group name
        groupName = groupName.replace(/[^a-zA-Z0-9_]/g, '_');

        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        groups[groupName].push(item.name);
      }
    }
  }

  // Add imports
  moduleContent += '// Imports\n';
  moduleContent += imports.join('\n') + '\n\n';

  // Export groups
  moduleContent += '// Grouped exports\n';
  for (const [groupName, exportNames] of Object.entries(groups)) {
    moduleContent += `export const ${groupName} = {\n`;
    for (const exportName of exportNames) {
      moduleContent += `  ${exportName},\n`;
    }
    moduleContent += '};\n\n';
  }

  // Export individual items for backwards compatibility
  moduleContent += '// Individual exports (for backwards compatibility)\n';
  const allExports = Object.values(groups).flat();
  moduleContent += `export { ${allExports.join(', ')} };\n\n`;

  // Export functions object
  const allFunctions = allExports.filter(name => {
    // Find the item to check its type
    for (const files of Object.values(filesByFolder)) {
      for (const fileInfo of files.values()) {
        const item = fileInfo.exportedItems.find(item => item.name === name);
        if (item) return item.type === 'function';
      }
    }
    return false;
  });

  if (allFunctions.length > 0) {
    moduleContent += '// Functions object with all function exports\n';
    moduleContent += 'export const functions = {\n';
    for (const funcName of allFunctions) {
      moduleContent += `  ${funcName},\n`;
    }
    moduleContent += '};\n';
  }

  return moduleContent;
}
function generateMixedExports(
  filesByFolder: Record<string, Map<string, FileWithExports>>,
  moduleContent: string,
  strategy: NonNullable<Required<PluginOptions>["exportStrategy"]>
): string {
  // Generate both individual and grouped exports
  const individualContent = generateIndividualExports(filesByFolder, '');
  const groupedContent = generateGroupedExports(filesByFolder, '', strategy);

  return moduleContent + individualContent + '\n// Additional grouped exports\n' + groupedContent.split('// Imports\n')[1];
}
function generateIndividualExports(
  filesByFolder: Record<string, Map<string, FileWithExports>>,
  moduleContent: string
): string {
  // Import and export all items individually
  for (const [folder, files] of Object.entries(filesByFolder)) {
    moduleContent += `// Exports from ${folder}\n`;

    for (const [_, fileInfo] of files.entries()) {
      if (fileInfo.exportedItems.length === 0) continue;

      const importPath = fileInfo.relPath.replace(/\.(ts|js)$/, '');
      const importNames = fileInfo.exportedItems.map(item => item.name).join(', ');
      moduleContent += `import { ${importNames} } from '${importPath}';\n`;
    }

    const allExportsInFolder: string[] = [];
    for (const fileInfo of files.values()) {
      allExportsInFolder.push(...fileInfo.exportedItems.map(item => item.name));
    }

    if (allExportsInFolder.length > 0) {
      moduleContent += `export { ${allExportsInFolder.join(', ')} };\n\n`;
    }
  }

  // Add functions object
  const allFunctions: string[] = [];
  for (const files of Object.values(filesByFolder)) {
    for (const fileInfo of files.values()) {
      allFunctions.push(...fileInfo.exportedItems.filter(item => item.type === 'function').map(item => item.name));
    }
  }

  if (allFunctions.length > 0) {
    moduleContent += '// Functions object with all function exports\n';
    moduleContent += 'export const functions = {\n';
    for (const funcName of allFunctions) {
      moduleContent += `  ${funcName},\n`;
    }
    moduleContent += '};\n';
  }

  return moduleContent;
}
// Enhanced type declaration generation
function generateFunctionTypeDeclarations(
  context: any,
  fileCache: Map<string, CachedFile>
): void {
  try {
    // Build the declaration content
    let declarationContent = `// Generated by triggerkit - Enhanced with actual TypeScript types\n\n`;
    declarationContent += `declare module '${VIRTUAL_MODULE_ID}' {\n`;

    // Group files by folder for better organization
    const filesByFolder: Record<string, string[]> = {};

    // Organize files by folder
    for (const [filePath, cachedFile] of fileCache.entries()) {
      if (!cachedFile.content) continue;

      // Get the relative path from the working directory
      const relPath = path.relative(context.workingDir, filePath);
      // Get the directory for grouping
      const dirName = path.dirname(relPath);

      if (!filesByFolder[dirName]) {
        filesByFolder[dirName] = [];
      }

      filesByFolder[dirName].push(filePath);
    }

    // Track all function names for the functions object
    const allFunctionNames: string[] = [];

    // Process each folder
    for (const [folder, filePaths] of Object.entries(filesByFolder)) {
      declarationContent += `  // Functions from ${folder}\n`;

      // Process each file in the folder
      for (const filePath of filePaths) {
        const cachedFile = fileCache.get(filePath);
        if (!cachedFile || !cachedFile.content) continue;

        const content = cachedFile.content;
        const fileName = path.basename(filePath);

        // Extract function signatures with full type information
        const functionSignatures = extractFunctionSignatures(content);

        if (functionSignatures.length > 0) {
          declarationContent += `  // From ${fileName}\n`;

          for (const func of functionSignatures) {
            // Generate proper export declaration based on signature type
            if (func.signature.startsWith('function')) {
              declarationContent += `  export ${func.signature};\n`;
            } else if (func.signature.startsWith('const')) {
              // Convert const signature to export declaration
              const funcDeclaration = func.signature.replace(/^const\s+(\w+):\s*/, 'export declare const $1: ');
              declarationContent += `  ${funcDeclaration};\n`;
            } else {
              // Fallback to basic function declaration
              declarationContent += `  export declare function ${func.name}(${func.params}): ${func.returnType};\n`;
            }

            allFunctionNames.push(func.name);
          }

          declarationContent += '\n';
        }
      }
    }

    // Generate environment variables if any
    const envVars = new Set<string>();
    for (const [_, cachedFile] of fileCache.entries()) {
      if (cachedFile.content) {
        extractEnvironmentVariables(cachedFile.content, envVars);
      }
    }

    if (envVars.size > 0) {
      declarationContent += '  // Environment variables\n';
      for (const varName of envVars) {
        declarationContent += `  export declare const ${varName}: string;\n`;
      }
      declarationContent += '\n';
    }

    // Add the functions object with proper typing
    if (allFunctionNames.length > 0) {
      declarationContent += '  // Functions object with all exports\n';
      declarationContent += '  export declare const functions: {\n';

      for (const funcName of allFunctionNames) {
        declarationContent += `    ${funcName}: typeof ${funcName};\n`;
      }

      declarationContent += '  };\n';
    }

    // Close the module declaration
    declarationContent += `}\n`;

    // Write to the src directory
    try {
      const srcDeclPath = path.resolve(process.cwd(), `src/virtual-triggerkit.d.ts`);
      fs.writeFileSync(srcDeclPath, declarationContent);
      context.logger.log(`📝 Generated enhanced TypeScript declaration file at: ${srcDeclPath}`);
      context.logger.log(`🎯 Included ${allFunctionNames.length} functions with full type information`);
    } catch (error) {
      context.logger.warn(`Error writing declaration file:`, error);
    }
  } catch (error) {
    context.logger.warn(`Error generating TypeScript declaration file:`, error);
  }
}

export { triggerkit, VIRTUAL_MODULE_ID }