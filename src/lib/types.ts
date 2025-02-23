import type { TSESTree } from '@typescript-eslint/types';

export interface PluginOptions {
  /**
   * Path to output env-transformed functions
   * @default 'src/trigger/generated/index.ts'
  */
  outputPath?: string;

  /**
   * Directories to scan for exportable functions.
   * 
   * @default ['src/lib', 'src/lib/server']
   * @example ['src/lib/triggers']
   */
  includeDirs?: string[];

  /**
   * File patterns to scan. Use forward slashes even on Windows.
   * 
   * @default ['**\/*.ts', '**\/*.js', '**\/+server.ts']
   * @example ['**\/*.trigger.ts']
   */
  include?: string[];

  /**
   * Patterns to exclude from scanning. Use forward slashes even on Windows.
   * 
   * @default ['**\/node_modules/**', '**\/*.test.ts', '**\/*.spec.ts']
   * @example ['**\/*.d.ts']
   */
  exclude?: string[];
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

export interface ParseResult {
  exports: ExportedFunction[];
  envVars: string[];
  transformedContent: string;
}

export interface FunctionMap {
  [key: string]: {
    metadata: {
      isAsync: boolean | undefined;
      parameters: Array<{
        name: string;
        type?: string;
        optional: boolean;
      }>;
      returnType?: string;
      docstring?: string;
    };
    path: string;
  };
}