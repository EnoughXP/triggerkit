import type { TSESTree } from '@typescript-eslint/types';

export interface PluginOptions {
  /**
   * Directories to scan for exportable functions
   * Default ['src/lib', 'src/routes/api']
   */
  includeDirs?: string[];

  /**
   * File patterns to scan
   * Default: ['**\/*.ts', '**\/*.js', '**\/+server.ts']
   */
  include?: string[];

  /**
   * Patterns to exclude
   * Default: ['**\/node_modules/**', '**\/*.test.ts', '**\/*.spec.ts']
   */
  exclude?: string[];

  /**
   * Virtual module ID for accessing functions
   * @default 'virtual:sveltekit-functions'
   */
  virtualModuleId?: string;

  /**
     * Environment variables to import from '$env/static/private'
     * These variables will be available in the generated module
     * @example { variables: ['DATABASE_URL', 'API_KEY'] }
     * @default { variables: [] }
     */
  env?: {
    /**
     * Array of environment variable names to import
     */
    variables: string[];
  };
}

export interface VirtualModuleExports {
  functions: Record<string, ExportedFunction>;
  invoke: <T = any>(functionName: string, ...args: any[]) => Promise<T>;
}

export interface FunctionMetadata {
  isAsync: boolean;
  parameters: ParameterInfo[];
  returnType?: string;
  docstring?: string;
}

export interface ExportedFunction {
  name: string;
  path: string;
  exportName: string;
  metadata: FunctionMetadata;
}

export interface ParameterInfo {
  name: string;
  type?: string;
  optional: boolean;
}

export interface ParsedFunction {
  declaration: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression;
  name: string;
  docstring?: string;
}