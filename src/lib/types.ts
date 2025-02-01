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
}

export interface ExportedFunction {
  name: string;
  path: string;
  exportName: string;
  metadata: FunctionMetadata;
}

export interface FunctionMetadata {
  isAsync: boolean;
  parameters: ParameterInfo[];
  returnType?: string;
  docstring?: string;
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