/**
 * Plugin options for controlling which files to scan
 */
export interface PluginOptions {
  /**
   * Directories * Folders to scan for function files
   * @default ["src/lib"]
   */
  includeDirs?: string[];

  /**
   * File extensions to look for
   * @default [".ts", ".js"]
   */
  filePatterns?: string[];

  /**
   * Patterns to exclude from scanning
   * @default ["test.", "spec.", ".d.ts"]
   */
  exclude?: string[];
}

export interface CachedFile {
  path: string;
  lastModified: number;
  content: string | null;
}

export interface FileWithFunctions {
  path: string;
  relPath: string;
  functionNames: string[];
}

/**
 * Information about a function parameter
 */
export interface ParameterInfo {
  name: string;
  type?: string;
  optional: boolean;
}