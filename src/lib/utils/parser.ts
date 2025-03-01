import ts from 'typescript';
import type { ExportedFunction, ParseResult, ParameterInfo } from '../types/index.js';


export function parseFile(fileContent: string, filePath: string): ParseResult {
  // Create default result
  const result: ParseResult = {
    exports: [],
    envVars: [],
    transformedContent: fileContent
  };

  try {
    // Parse with TypeScript
    const sourceFile = ts.createSourceFile(
      filePath,
      fileContent,
      ts.ScriptTarget.Latest,
      true
    );

    // Find exported functions
    result.exports = findExportedFunctions(sourceFile, filePath);

    // Find environment variables
    result.envVars = findEnvironmentVariables(sourceFile);

    // Transform SvelteKit environment imports
    result.transformedContent = transformSvelteKitEnvImports(fileContent, result.envVars);
  } catch (error) {
    console.error(`Error parsing file ${filePath}:`, error);
  }

  return result;
}
/**
 * Find exported functions in a TypeScript source file
 */
function findExportedFunctions(sourceFile: ts.SourceFile, filePath: string): ExportedFunction[] {
  const exportedFunctions: ExportedFunction[] = [];

  // Helper function to recursively visit nodes
  function visit(node: ts.Node) {
    // Check for function declarations with export keyword
    if (ts.isFunctionDeclaration(node) &&
      node.name &&
      node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {

      const functionName = node.name.text;
      const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) || false;

      // Get parameters
      const parameters: ParameterInfo[] = [];
      if (node.parameters) {
        for (const param of node.parameters) {
          if (ts.isIdentifier(param.name)) {
            parameters.push({
              name: param.name.text,
              type: param.type ? getTypeAsString(param.type) : undefined,
              optional: !!param.questionToken
            });
          }
        }
      }

      // Get return type
      let returnType: string | undefined;
      if (node.type) {
        returnType = getTypeAsString(node.type);
      }

      // Get docstring
      const docstring = getDocCommentForNode(node, sourceFile);

      exportedFunctions.push({
        name: functionName,
        path: filePath,
        exportName: functionName,
        metadata: {
          isAsync,
          parameters,
          returnType,
          docstring
        },
        envVars: [] // Will be populated later
      });
    }

    // Check for exported variable declarations that are functions
    if (ts.isVariableStatement(node) &&
      node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of node.declarationList.declarations) {
        if (declaration.name && ts.isIdentifier(declaration.name) &&
          declaration.initializer) {

          // Check if it's a function expression or arrow function
          if (ts.isFunctionExpression(declaration.initializer) ||
            ts.isArrowFunction(declaration.initializer)) {

            const functionName = declaration.name.text;
            const isAsync = declaration.initializer.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) || false;

            // Get parameters
            const parameters: ParameterInfo[] = [];
            if (declaration.initializer.parameters) {
              for (const param of declaration.initializer.parameters) {
                if (ts.isIdentifier(param.name)) {
                  parameters.push({
                    name: param.name.text,
                    type: param.type ? getTypeAsString(param.type) : undefined,
                    optional: !!param.questionToken
                  });
                }
              }
            }

            // Get return type
            let returnType: string | undefined;
            if (declaration.initializer.type) {
              returnType = getTypeAsString(declaration.initializer.type);
            }

            // Get docstring
            const docstring = getDocCommentForNode(declaration, sourceFile);

            exportedFunctions.push({
              name: functionName,
              path: filePath,
              exportName: functionName,
              metadata: {
                isAsync,
                parameters,
                returnType,
                docstring
              },
              envVars: [] // Will be populated later
            });
          }
        }
      }
    }

    // Continue visiting child nodes
    ts.forEachChild(node, visit);
  }

  // Start the visitor pattern
  visit(sourceFile);

  return exportedFunctions;
}

/**
 * Find environment variables in a TypeScript source file
 */
function findEnvironmentVariables(sourceFile: ts.SourceFile): string[] {
  const envVars: string[] = [];

  // Helper function to recursively visit nodes
  function visit(node: ts.Node) {
    // Look for imports from $env/static/public or $env/static/private
    if (ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)) {
      const modulePath = node.moduleSpecifier.text;

      if (modulePath === '$env/static/public' || modulePath === '$env/static/private') {
        const importClause = node.importClause;

        if (importClause && importClause.namedBindings &&
          ts.isNamedImports(importClause.namedBindings)) {
          // Process each named import
          for (const element of importClause.namedBindings.elements) {
            if (element.name && ts.isIdentifier(element.name)) {
              envVars.push(element.name.text);
            }
          }
        }
      }
    }

    // Continue visiting child nodes
    ts.forEachChild(node, visit);
  }

  // Start the visitor pattern
  visit(sourceFile);

  return envVars;
}

/**
 * Convert a TypeScript type node to a string representation
 */
function getTypeAsString(typeNode: ts.TypeNode): string {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printNode(ts.EmitHint.Unspecified, typeNode, typeNode.getSourceFile());
}

/**
 * Get the JSDoc comment for a node
 */
function getDocCommentForNode(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const nodePos = node.pos;

  // Get the full text of the file
  const fullText = sourceFile.getFullText();

  // Look for JSDoc comment before the node
  const commentRanges = ts.getLeadingCommentRanges(fullText, nodePos);

  if (commentRanges && commentRanges.length > 0) {
    // Get the last comment range (closest to the node)
    const commentRange = commentRanges[commentRanges.length - 1];

    // Extract the comment text
    const commentText = fullText.substring(commentRange.pos, commentRange.end);

    // Check if it's a JSDoc comment (starts with /**)
    if (commentText.startsWith('/**')) {
      return commentText;
    }
  }

  return undefined;
}

/**
 * Transform SvelteKit environment variable imports to use process.env
 */
function transformSvelteKitEnvImports(source: string, envVars: string[]): string {
  // Transform imports from $env/static/public or $env/static/private
  return source.replace(
    /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"](\$env\/static\/(?:public|private))['"]/g,
    (match: string, imports: string, modulePath: string) => {
      // Keep track of the original import for debugging
      const originalImport = match;

      // Parse the imported variables
      const variables = imports.split(',').map((v: string) => v.trim());

      // Determine if we're dealing with public or private env vars
      const isPublic = modulePath.endsWith('public');
      const envType = isPublic ? 'public' : 'private';

      // Add a comment with the original import for reference
      let result = `// Original: ${originalImport.trim()}\n`;
      result += `// Transformed $env/static/${envType} imports\n`;

      // Generate process.env assignments for each variable
      const processEnvAssignments = variables
        .map((varName: string) => `const ${varName} = process.env.${varName};`)
        .join('\n');

      return result + processEnvAssignments;
    }
  );
}



export default parseFile;