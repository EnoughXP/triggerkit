import type { ExportedFunction, FunctionMetadata } from "../types";
interface FunctionMap {
  [key: string]: {
    metadata: FunctionMetadata;
    path: string;
  };
}

export function generateFunctionsModule(functions: ExportedFunction[]): string {
  const imports = functions
    .map((func) =>
      `import { ${func.exportName} } from '${func.path}';`
    )
    .join('\n');

  const exports = functions
    .map((func) =>
      `export const ${func.name} = ${func.exportName};`
    )
    .join('\n');

  const functionMap = functions.reduce<FunctionMap>((acc, func) => {
    acc[func.name] = {
      metadata: func.metadata,
      path: func.path
    };
    return acc;
  }, {});

  return `
  ${imports}
  
  ${exports}
  
  export const functions = ${JSON.stringify(functionMap, null, 2)};
  
  export function getFunction(name: string) {
    return functions[name];
  }
`;
}