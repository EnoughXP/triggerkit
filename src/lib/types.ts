import type { TSESTree } from '@typescript-eslint/types';

export interface PluginOptions {
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

export interface TriggerkitOptions extends PluginOptions {
  placement?: 'last' | 'first';
  target?: 'deploy' | 'dev';
}

export interface ParameterInfo {
  name: string;
  type?: string;
  optional: boolean;
}

export interface FunctionMetadata {
  isAsync: boolean;
  parameters: ParameterInfo[];
  returnType?: string;
  docstring?: string;
}

export interface ExportedFunction {
  /** The function name */
  name: string;
  /** The path to the file containing the function */
  path: string;
  /** The exported name of the function */
  exportName: string;
  /** Metadata about the function */
  metadata: FunctionMetadata;
  /** Environment variables used by the function */
  envVars?: string[];
}

export interface ParsedFunction {
  /** The AST node for the function declaration */
  declaration: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression;
  /** The function name */
  name: string;
  /** The function's JSDoc comment, if any */
  docstring?: string;
}

export interface ParseResult {
  /** The exported functions found in the file */
  exports: ExportedFunction[];
  /** Environment variables used in the file */
  envVars: string[];
  /** The transformed file content */
  transformedContent: string;
}
