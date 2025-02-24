import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { parse, print } from 'recast';
import * as parser from '@typescript-eslint/parser';

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

function addTriggerkitToViteConfig(source: string): string {
  const ast = parse(source, {
    parser: {
      parse: (source: string) => parser.parse(source, {
        sourceType: 'module',
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true }
      })
    }
  });

  // Find the plugins array
  let pluginsNode = null;
  recast.visit(ast, {
    visitObjectExpression(path) {
      path.node.properties.forEach((prop) => {
        if (prop.key.name === 'plugins' && Array.isArray(prop.value.elements)) {
          pluginsNode = prop.value;
        }
      });
      return false;
    }
  });

  // Add triggerkit import if not present
  const hasTriggerkitImport = ast.program.body.some(node =>
    node.type === 'ImportDeclaration' &&
    node.source.value === 'triggerkit'
  );

  if (!hasTriggerkitImport) {
    ast.program.body.unshift(
      parse("import { triggerkit } from 'triggerkit';").program.body[0]
    );
  }

  // Add triggerkit to plugins if not present
  if (pluginsNode) {
    const hasTriggerkitPlugin = pluginsNode.elements.some(element =>
      element.type === 'CallExpression' &&
      element.callee.name === 'triggerkit'
    );

    if (!hasTriggerkitPlugin) {
      pluginsNode.elements.unshift(
        parse("triggerkit({ includeDirs: ['src/lib/server'] })").program.body[0].expression
      );
    }
  }

  return print(ast).code;
}

function addTriggerkitToTriggerConfig(source: string): string {
  const ast = parse(source, {
    parser: {
      parse: (source: string) => parser.parse(source, {
        sourceType: 'module',
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true }
      })
    }
  });

  // Add triggerkit import if not present
  const hasTriggerkitImport = ast.program.body.some(node =>
    node.type === 'ImportDeclaration' &&
    node.source.value === 'triggerkit/trigger'
  );

  if (!hasTriggerkitImport) {
    ast.program.body.unshift(
      parse("import { triggerkit } from 'triggerkit/trigger';").program.body[0]
    );
  }

  // Add build.extensions configuration if not present
  recast.visit(ast, {
    visitCallExpression(path) {
      if (path.node.callee.name === 'defineConfig') {
        const configObject = path.node.arguments[0];
        let buildProp = configObject.properties.find(p => p.key.name === 'build');

        if (!buildProp) {
          buildProp = parse(`({
            build: {
              extensions: [
                triggerkit({
                  includeDirs: ['src/lib/server']
                })
              ]
            }
          })`).program.body[0].expression.properties[0];
          configObject.properties.push(buildProp);
        } else if (!buildProp.value.properties.find(p => p.key.name === 'extensions')) {
          buildProp.value.properties.push(
            parse(`({
              extensions: [
                triggerkit({
                  includeDirs: ['src/lib/server']
                })
              ]
            })`).program.body[0].expression.properties[0]
          );
        }
      }
      return false;
    }
  });

  return print(ast).code;
}

const defaultViteConfig = `import { defineConfig } from 'vite';
import { triggerkit } from 'triggerkit';

export default defineConfig({
  plugins: [
    triggerkit({
      includeDirs: ['src/lib/server']
    })
  ]
});`;

const defaultTriggerConfig = `import { defineConfig } from "@trigger.dev/sdk/v3";
import { triggerkit } from "triggerkit/trigger";

export default defineConfig({
  project: "your-project-id",
  build: {
    extensions: [
      triggerkit({
        includeDirs: ['src/lib/server']
      })
    ]
  }
});`;

async function init() {
  const cwd = process.cwd();
  const viteConfigPath = resolve(cwd, 'vite.config.ts');
  const triggerConfigPath = resolve(cwd, 'trigger.config.ts');

  // Handle vite.config.ts
  const existingViteConfig = await readFileIfExists(viteConfigPath);
  const newViteConfig = existingViteConfig
    ? addTriggerkitToViteConfig(existingViteConfig)
    : defaultViteConfig;
  await fs.writeFile(viteConfigPath, newViteConfig);

  // Handle trigger.config.ts
  const existingTriggerConfig = await readFileIfExists(triggerConfigPath);
  const newTriggerConfig = existingTriggerConfig
    ? addTriggerkitToTriggerConfig(existingTriggerConfig)
    : defaultTriggerConfig;
  await fs.writeFile(triggerConfigPath, newTriggerConfig);

  console.log('✨ Triggerkit has been initialized!');
  console.log('📝 Modified/created:');
  console.log('  - vite.config.ts');
  console.log('  - trigger.config.ts');

  if (!existingTriggerConfig) {
    console.log('\n⚠️  Remember to set your project ID in trigger.config.ts');
  }
}

export default init;