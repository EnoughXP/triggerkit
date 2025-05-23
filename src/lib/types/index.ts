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

  /**
   * Export organization strategy
   * @default "individual"
   */
  exportStrategy?: {
    mode: "individual" | "grouped" | "mixed";

    /**
     * When mode is "grouped", group functions by:
     * - "file": group by source file
     * - "folder": group by source folder
     */
    groupBy?: "file" | "folder";

    /**
     * Namespace prefix for groups (e.g., "auth", "user", "api")
     */
    groupPrefix?: string;
  };

  /**
   * What types of exports to include
   * @default { functions: true, classes: true, constants: false }
   */
  includeTypes?: {
    functions?: boolean;
    classes?: boolean;
    constants?: boolean;
    variables?: boolean;
  };
}

export interface CachedFile {
  path: string;
  lastModified: number;
  content: string | null;
}

export interface ExportedItem {
  name: string;
  type: 'function' | 'class' | 'const' | 'variable';
  signature: string;
  isAsync: boolean;
  returnType: string;
  params: string;
  classInfo?: {
    methods: Array<{ name: string; signature: string; isStatic: boolean }>;
    properties: Array<{ name: string; type: string; isStatic: boolean }>;
    constructor?: { params: string };
  };
}

export interface FileWithExports {
  path: string;
  relPath: string;
  exportedItems: ExportedItem[];
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