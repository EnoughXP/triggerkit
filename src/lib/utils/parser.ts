import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/types';
import type { ExportedFunction } from '$lib/types';

function isIdentifier(node: TSESTree.Parameter): node is TSESTree.Identifier & { typeAnnotation?: TSESTree.TSTypeAnnotation } {
  return node.type === 'Identifier';
}

function isNode(node: unknown): node is TSESTree.Node {
  return typeof node === 'object' && node !== null && 'type' in node;
}

export function parseFile(content: string, filePath: string) {
  const ast = parse(content, {
    range: true,
    loc: true,
    comment: true,
  });

  const exports: ExportedFunction[] = [];
  const docstrings = new Map<number, string>();

  // Collect docstrings
  ast.comments?.forEach(comment => {
    if (comment.type === 'Block') {
      docstrings.set(comment.range[1], comment.value.trim());
    }
  });

  function getDocstring(node: TSESTree.Node): string | undefined {
    return docstrings.get(node.range[0] - 1);
  }

  function extractParameterInfo(params: TSESTree.Parameter[]): Array<{
    name: string;
    type?: string;
    optional: boolean;
  }> {
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
      // Handle other parameter types (rest parameters, array patterns, etc.)
      return {
        name: 'unknown',
        type: undefined,
        optional: false
      };
    });
  }

  function visit(node: TSESTree.Node) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration?.type === 'FunctionDeclaration') {
        const func = node.declaration;
        // Only add named functions
        if (func.id) {
          exports.push({
            name: func.id.name,
            path: filePath,
            exportName: func.id.name,
            metadata: {
              isAsync: !!func.async,
              parameters: extractParameterInfo(func.params),
              returnType: func.returnType
                ? content.slice(func.returnType.range[0], func.returnType.range[1]).replace(/^:\s*/, '')
                : undefined,
              docstring: getDocstring(node)
            }
          });
        }
      }
    }

    // Handle child nodes
    Object.entries(node).forEach(([, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (isNode(item)) {
            visit(item);
          }
        });
      } else if (isNode(value)) {
        visit(value);
      }
    });
  }

  visit(ast);
  return exports;
}