import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/types';
import type { ExportedFunction, ParseResult, ParameterInfo } from '../types/index.js';

function isIdentifier(node: TSESTree.Parameter): node is TSESTree.Identifier & { typeAnnotation?: TSESTree.TSTypeAnnotation } {
  return node.type === 'Identifier';
}

function isNode(node: unknown): node is TSESTree.Node {
  return typeof node === 'object' && node !== null && 'type' in node;
}

function getDocstringsFromAST(ast: TSESTree.Program): Map<number, string> {
  const docstrings = new Map<number, string>();
  ast.comments?.forEach(comment => {
    if (comment.type === 'Block') {
      docstrings.set(comment.range[1], comment.value.trim());
    }
  });
  return docstrings;
}

function extractEnvironmentVars(ast: TSESTree.Program): string[] {
  const envVars: Set<string> = new Set();

  // Scan for environment variables from $env imports
  ast.body.forEach(node => {
    if (
      node.type === 'ImportDeclaration' &&
      (node.source.value === '$env/static/private' ||
        node.source.value === '$env/static/public')
    ) {
      node.specifiers
        .filter((spec): spec is TSESTree.ImportSpecifier =>
          spec.type === 'ImportSpecifier')
        .forEach(spec => envVars.add(spec.local.name));
    }
  });

  // Also scan for process.env usage
  function visitForEnvVars(node: TSESTree.Node) {
    if (
      node.type === 'MemberExpression' &&
      node.object.type === 'MemberExpression' &&
      node.object.object.type === 'Identifier' &&
      node.object.object.name === 'process' &&
      node.object.property.type === 'Identifier' &&
      node.object.property.name === 'env' &&
      node.property.type === 'Identifier'
    ) {
      envVars.add(node.property.name);
    }

    Object.entries(node).forEach(([, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (isNode(item)) visitForEnvVars(item);
        });
      } else if (isNode(value)) {
        visitForEnvVars(value);
      }
    });
  }

  ast.body.forEach(node => visitForEnvVars(node));

  return Array.from(envVars);
}

function extractParameterInfo(params: TSESTree.Parameter[], content: string): ParameterInfo[] {
  return params.map(param => {
    if (isIdentifier(param)) {
      return {
        name: param.name,
        type: param.typeAnnotation
          ? content.slice(param.typeAnnotation.range[0], param.typeAnnotation.range[1]).replace(/^:\s*/, '')
          : undefined,
        optional: !!param.optional
      };
    }
    return {
      name: 'unknown',
      type: undefined,
      optional: false
    };
  });
}

function transformEnvImports(code: string): string {
  return code.replace(
    /import\s*{\s*([^}]+)\s*}\s*from\s*['"](\$env\/static\/(?:private|public))['"];?/g,
    (_, imports) => {
      const vars = imports
        .split(',')
        .map((v: string) => v.trim())
        .filter(Boolean);
      return `const { ${vars.join(', ')} } = process.env;`;
    }
  );
}

function extractExportedFunctions(
  ast: TSESTree.Program,
  filePath: string,
  content: string,
  docstrings: Map<number, string>,
  envVars: string[]
): ExportedFunction[] {
  const exports: ExportedFunction[] = [];

  function getDocstring(node: TSESTree.Node): string | undefined {
    return docstrings.get(node.range[0] - 1);
  }

  function visit(node: TSESTree.Node) {
    // Export named function declarations
    if (node.type === 'ExportNamedDeclaration') {
      // Handle function declarations
      if (node.declaration?.type === 'FunctionDeclaration') {
        const func = node.declaration;
        if (func.id) {
          exports.push({
            name: func.id.name,
            path: filePath,
            exportName: func.id.name,
            metadata: {
              isAsync: !!func.async,
              parameters: extractParameterInfo(func.params, content),
              returnType: func.returnType
                ? content.slice(func.returnType.range[0], func.returnType.range[1]).replace(/^:\s*/, '')
                : undefined,
              docstring: getDocstring(node)
            },
            envVars: envVars.length > 0 ? envVars : undefined
          });
        }
      }

      // Handle variable declarations (const, let, var)
      else if (node.declaration?.type === 'VariableDeclaration') {
        node.declaration.declarations.forEach(decl => {
          if (
            decl.id.type === 'Identifier' &&
            decl.init &&
            (
              decl.init.type === 'ArrowFunctionExpression' ||
              decl.init.type === 'FunctionExpression'
            )
          ) {
            const funcExpr = decl.init;
            exports.push({
              name: decl.id.name,
              path: filePath,
              exportName: decl.id.name,
              metadata: {
                isAsync: !!funcExpr.async,
                parameters: extractParameterInfo(funcExpr.params, content),
                returnType: funcExpr.returnType
                  ? content.slice(funcExpr.returnType.range[0], funcExpr.returnType.range[1]).replace(/^:\s*/, '')
                  : undefined,
                docstring: getDocstring(node)
              },
              envVars: envVars.length > 0 ? envVars : undefined
            });
          }
        });
      }

      // Handle named exports (export { func1, func2 })
      else if (node.specifiers.length > 0) {
        // We'll need to find the original declarations for these
        node.specifiers.forEach(specifier => {
          if (specifier.type === 'ExportSpecifier') {
            // We'll collect these names and try to find their declarations later
            // This is more complex and would require tracking declarations in the module
            // For now, we'll just add them as simple exports without detailed metadata
            exports.push({
              name: specifier.exported.name,
              path: filePath,
              exportName: specifier.local.name,
              metadata: {
                isAsync: false, // We don't know without tracking
                parameters: [],
                returnType: undefined,
                docstring: undefined
              },
              envVars: envVars.length > 0 ? envVars : undefined
            });
          }
        });
      }
    }

    // Handle default exports
    else if (node.type === 'ExportDefaultDeclaration') {
      if (node.declaration.type === 'FunctionDeclaration') {
        const func = node.declaration;
        const name = func.id ? func.id.name : 'default';
        exports.push({
          name,
          path: filePath,
          exportName: 'default',
          metadata: {
            isAsync: !!func.async,
            parameters: extractParameterInfo(func.params, content),
            returnType: func.returnType
              ? content.slice(func.returnType.range[0], func.returnType.range[1]).replace(/^:\s*/, '')
              : undefined,
            docstring: getDocstring(node)
          },
          envVars: envVars.length > 0 ? envVars : undefined
        });
      }
      // Handle arrow functions or function expressions in default exports
      else if (
        node.declaration.type === 'ArrowFunctionExpression' ||
        node.declaration.type === 'FunctionExpression'
      ) {
        const funcExpr = node.declaration;
        exports.push({
          name: 'default',
          path: filePath,
          exportName: 'default',
          metadata: {
            isAsync: !!funcExpr.async,
            parameters: extractParameterInfo(funcExpr.params, content),
            returnType: funcExpr.returnType
              ? content.slice(funcExpr.returnType.range[0], funcExpr.returnType.range[1]).replace(/^:\s*/, '')
              : undefined,
            docstring: getDocstring(node)
          },
          envVars: envVars.length > 0 ? envVars : undefined
        });
      }
    }

    // Continue traversing the AST
    Object.entries(node).forEach(([, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (isNode(item)) visit(item);
        });
      } else if (isNode(value)) {
        visit(value);
      }
    });
  }

  visit(ast);
  return exports;
}

export function parseFile(content: string, filePath: string): ParseResult {
  try {
    const ast = parse(content, {
      range: true,
      loc: true,
      comment: true,
    });

    const docstrings = getDocstringsFromAST(ast);
    const envVars = extractEnvironmentVars(ast);
    const exports = extractExportedFunctions(ast, filePath, content, docstrings, envVars);

    // Use the shared transform function
    const transformedContent = transformEnvImports(content);

    return {
      exports,
      envVars,
      transformedContent
    };
  } catch (error) {
    console.error(`[triggerkit] Error parsing file ${filePath}:`, error);
    return {
      exports: [],
      envVars: [],
      transformedContent: content
    };
  }
}

export default parseFile;