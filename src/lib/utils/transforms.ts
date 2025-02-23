export function transformEnvImports(code: string): string {
  return code.replace(
    /import\s*{\s*([^}]+)\s*}\s*from\s*['"](\$env\/static\/(?:private|public))['"];?/g,
    (_, imports) => {
      const vars = imports
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      return `const { ${vars.join(', ')} } = process.env;`;
    }
  );
}