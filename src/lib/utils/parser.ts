import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/types';
import type { ExportedFunction, ParseResult } from '../types';

function isIdentifier(node: TSESTree.Parameter): node is TSESTree.Identifier & { typeAnnotation?: TSESTree.TSTypeAnnotation } {
  return node.type === 'Identifier';
}

function isNode(node: unknown): node is TSESTree.Node {
  return typeof node === 'object' && node !== null && 'type' in node;
}

function parseFile(content: string, filePath: string): ParseResult {
  const ast = parse(content, {
    range: true,
    loc: true,
    comment: true,
  });

  const exports: ExportedFunction[] = [];
  const docstrings = new Map<number, string>();
  const envVars: string[] = [];
  const replacements: Array<{ start: number; end: number; value: string }> = [];

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

  ast.body.forEach(node => {
    if (
      node.type === 'ImportDeclaration' &&
      (node.source.value === '$env/static/private' ||
        node.source.value === '$env/static/public')
    ) {
      // Collect imported variable names
      const importedVars = node.specifiers
        .filter((spec): spec is TSESTree.ImportSpecifier =>
          spec.type === 'ImportSpecifier')
        .map(spec => spec.local.name);

      envVars.push(...importedVars);

      // Mark this import for removal
      replacements.push({
        start: node.range[0],
        end: node.range[1],
        value: ''
      });
    }
  });

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

  // Sort replacements in reverse order (to not affect earlier offsets)
  replacements.sort((a, b) => b.start - a.start);

  // Apply replacements to create new code
  let transformedContent = content;
  for (const { start, end, value } of replacements) {
    transformedContent = transformedContent.slice(0, start) + value + transformedContent.slice(end);
  }

  // Add process.env destructuring at the top if we found any env vars
  if (envVars.length > 0) {
    const envDestructuring = `const { ${envVars.join(', ')} } = process.env;\n\n`;
    transformedContent = envDestructuring + transformedContent;
  }

  return {
    exports,
    envVars,
    transformedContent
  };
}

export default parseFile;