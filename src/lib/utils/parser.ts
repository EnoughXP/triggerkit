import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/types';
import type { ExportedFunction, ParseResult, ParameterInfo } from '../types';
import { transformEnvImports } from './transforms';

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
    if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
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
}

export default parseFile;