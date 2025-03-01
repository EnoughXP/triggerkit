/**
 * Plugin options for controlling which files to scan
 */
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

/**
 * Options for the triggerkit extension
 */
export interface TriggerkitOptions extends PluginOptions {
  /**
   * Where to place the plugin in the build chain
   */
  placement?: 'last' | 'first';

  /**
   * Which build target to apply the plugin to
   */
  target?: 'deploy' | 'dev';
}

/**
 * Information about a function parameter
 */
export interface ParameterInfo {
  name: string;
  type?: string;
  optional: boolean;
}

/**
 * Metadata about a function
 */
export interface FunctionMetadata {
  isAsync: boolean;
  parameters: ParameterInfo[];
  returnType?: string;
  docstring?: string;
}

/**
 * Information about an exported function
 */
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

/**
 * Result of parsing a file
 */
export interface ParseResult {
  /** The exported functions found in the file */
  exports: ExportedFunction[];
  /** Environment variables used in the file */
  envVars: string[];
  /** The transformed file content */
  transformedContent: string;
}

/**
 * Store for virtual modules
 */
export interface VirtualModuleStore {
  timestamp: number;
  modules: Record<string, string>;
}