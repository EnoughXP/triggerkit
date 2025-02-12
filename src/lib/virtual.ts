declare module 'virtual:sveltekit-functions' {
  interface ParameterInfo {
    name: string;
    type?: string;
    optional: boolean;
  }

  interface FunctionMetadata {
    isAsync: boolean;
    parameters: ParameterInfo[];
    returnType?: string;
    docstring?: string;
  }

  interface ExportedFunction {
    name: string;
    path: string;
    exportName: string;
    metadata: FunctionMetadata;
  }

  export interface VirtualModuleExports {
    functions: Record<string, ExportedFunction>;
    invoke: <T = any>(functionName: string, ...args: any[]) => Promise<T>;
  }

  const module: VirtualModuleExports;
  export default module;
}