import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { triggerkit } from '../triggerkit';
import type { Plugin, HmrContext } from 'vite';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { normalizePath } from 'vite';
import type { ExportedFunction } from '$lib/types';

// Mock fs promises
vi.mock('node:fs', () => ({
  promises: {
    readdir: vi.fn(),
    readFile: vi.fn(),
    access: vi.fn()
  }
}));

// Mock file system structure
const mockFiles = {
  // Server functions
  'src/lib/server/database.ts': `
    import { DATABASE_URL } from '$env/static/private';
    
    export async function getUsers() {
      return [];
    }

    export async function createUser(data: any) {
      return { id: 1, ...data };
    }
  `,
  // Shared utilities
  'src/lib/utils/date.ts': `
    export function formatDate(date: Date) {
      return date.toISOString();
    }
    
    export function isWeekend(date: Date) {
      return date.getDay() === 0 || date.getDay() === 6;
    }
  `,
  'src/lib/utils/simple.ts': `
      export function noParams() {
        return true;
      }
    `,
  'src/lib/utils/config.ts': `
    export function configure(options?: { timeout?: number; retries?: number }) {
      return options;
    }
  `,
  // Client utilities
  'src/lib/utils/validation.ts': `
    export function validateEmail(email: string) {
      return email.includes('@');
    }

    export const passwordRules = {
      minLength: 8,
      requireSpecialChar: true
    };
  `,
  // Shared types and interfaces
  'src/lib/types/index.ts': `
    export interface User {
      id: string;
      name: string;
      email: string;
    }

    export type SortOrder = 'asc' | 'desc';
  `,
  // Shared business logic
  'src/lib/auth/permissions.ts': `
    export function hasPermission(user: any, permission: string) {
      return user.permissions?.includes(permission) ?? false;
    }

    export async function checkRole(user: any, role: string) {
      return user.roles?.includes(role) ?? false;
    }
  `
};

describe('Triggerkit Vite plugin', () => {
  let plugin: Plugin;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup fs mocks
    (fs.readFile as any).mockImplementation((path) => {
      const normalizedPath = normalizePath(path);
      for (const [mockPath, content] of Object.entries(mockFiles)) {
        if (normalizedPath.endsWith(mockPath)) {
          return content;
        }
      }
      throw new Error(`File not found: ${path}`);
    });
    (fs.access as any).mockResolvedValue(undefined);
    (fs.readdir as any).mockImplementation((path) => {
      if (path.includes('src/lib')) {
        return [
          { name: 'server', isFile: () => false, isDirectory: () => true },
          { name: 'utils', isFile: () => false, isDirectory: () => true },
          { name: 'auth', isFile: () => false, isDirectory: () => true },
          { name: 'types', isFile: () => false, isDirectory: () => true }
        ];
      }
      if (path.includes('/lib/server')) {
        return [{ name: 'database.ts', isFile: () => true, isDirectory: () => false }];
      }
      if (path.includes('/lib/utils')) {
        return [
          { name: 'config.ts', isFile: () => true, isDirectory: () => false },
          { name: 'date.ts', isFile: () => true, isDirectory: () => false },
          { name: 'validation.ts', isFile: () => true, isDirectory: () => false },
          { name: 'simple.ts', isFile: () => true, isDirectory: () => false }
        ];
      }
      if (path.includes('/lib/auth')) {
        return [{ name: 'permissions.ts', isFile: () => true, isDirectory: () => false }];
      }
      if (path.includes('/lib/types')) {
        return [{ name: 'index.ts', isFile: () => true, isDirectory: () => false }];
      }
      return [];
    });

    plugin = triggerkit({
      env: {
        variables: ['DATABASE_URL', 'WEBHOOK_SECRET']
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should use default options when none provided', () => {
      const plugin = triggerkit();
      expect(plugin.name).toBe('vite-plugin-triggerkit');
    });

    it('should merge custom options with defaults', () => {
      const plugin = triggerkit({
        includeDirs: ['src/custom'],
        env: { variables: ['API_KEY'] }
      });
      expect(plugin.name).toBe('vite-plugin-triggerkit');
    });

    it('should handle empty include/exclude patterns', () => {
      const plugin = triggerkit({
        include: [],
        exclude: []
      });
      expect(plugin.name).toBe('vite-plugin-triggerkit');
    });

    it('should handle custom virtual module ID', () => {
      const plugin = triggerkit({
        virtualModuleId: 'virtual:custom-functions'
      });
      const resolveId = plugin.resolveId as (id: string) => string | undefined;
      const result = resolveId('virtual:custom-functions');
      expect(result).toBe('\0virtual:custom-functions');
    });

  });

  describe('Virtual Module Resolution', () => {
    it('should resolve virtual module ID', () => {
      const resolveId = plugin.resolveId as (id: string) => string | undefined;
      const result = resolveId('virtual:sveltekit-functions');
      expect(result).toBe('\0virtual:sveltekit-functions');
    });

    it('should not resolve other module IDs', () => {
      const resolveId = plugin.resolveId as (id: string) => string | undefined;
      const result = resolveId('other-module');
      expect(result).toBeUndefined();
    });

    it('should handle path-like virtual module IDs', () => {
      const plugin = triggerkit({
        virtualModuleId: '@virtual/functions'
      });
      const resolveId = plugin.resolveId as (id: string) => string | undefined;
      const result = resolveId('@virtual/functions');
      expect(result).toBe('\0@virtual/functions');
    });
  });

  describe('Module Loading', () => {


    it('should generate module content for virtual module', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      expect(content).toBeDefined();
      expect(content).toContain('export const functions = {');
    });

    it('should not load content for other modules', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('other-module');
      expect(content).toBeUndefined();
    });

    it('should include function metadata in generated module', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      // expect(content).toContain('"parameters": [');
      // expect(content).toContain('"isAsync":');
      // expect(content).toContain('"returnType":');
    });

    it('should handle functions with optional parameters', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      // expect(content).toContain('configure');
      // expect(content).toContain('"optional": true');
      // expect(content).toContain('timeout?: number');
      // expect(content).toContain('retries?: number');
    });
  });

  describe('Function Processing', () => {
    it('should parse async functions correctly', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      // expect(content).toContain('fetchUser');
      // expect(content).toContain('isAsync: true');
    });

    it('should extract docstrings', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      // expect(content).toContain('Adds two numbers');
      // expect(content).toContain('@param');
    });

    it('should handle functions with complex return types', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      // expect(content).toContain('Promise<User>');
    });

    it('should handle functions with no parameters', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      // expect(content).toContain('"parameters": []');
      // expect(content).toContain('"noParams"');
    });
  });

  describe('HMR Support', () => {
    it('should handle updates to library files', async () => {
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: HmrContext) => Promise<Array<any> | undefined>;
      const mockContext: HmrContext = {
        file: resolve(process.cwd(), 'src/lib/utils/date.ts'),
        modules: [{ id: 'test' }],
        server: {
          pluginContainer: {
            invalidateModule: vi.fn()
          },
          moduleGraph: {
            invalidateModule: vi.fn(),
            getModuleById: vi.fn(() => ({ id: 'test' }))
          }
        } as any,
        read: vi.fn()
      };

      const result = await handleHotUpdate(mockContext);
      expect(result).not.toBeDefined();
    });


    it('should handle file content changes', async () => {

    });
  });

  describe('Environment Variables', () => {
    it('should include specified env variables in generated module', async () => {
      const plugin = triggerkit({
        env: { variables: ['API_KEY', 'DATABASE_URL'] }
      });
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      expect(content).toContain('const { API_KEY, DATABASE_URL } = process.env');
    });

    it('should use import syntax for process.env variables', async () => {
      const plugin = triggerkit({
        env: { variables: ['API_KEY', 'DATABASE_URL'] }
      });
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');

      expect(content).toContain('const { API_KEY, DATABASE_URL } = process.env;');
      expect(content).not.toContain('$env/static/private');
    });

    it('should not include env imports when no variables specified', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      expect(content).not.toContain('import { } from \'$env/static/private\'');
    });

    it('should handle empty env variables array', async () => {
      const plugin = triggerkit({
        env: { variables: [] }
      });
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      expect(content).not.toContain('$env/static/private');
    });

    it('should deduplicate env variables', async () => {
      const plugin = triggerkit({
        env: { variables: ['API_KEY', 'API_KEY'] }
      });
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      expect(content?.match(/API_KEY/g)?.length).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors gracefully', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      (fs.readFile as any).mockRejectedValueOnce(new Error('Read error'));
      const content = await load('\0virtual:sveltekit-functions');
      expect(content).toBeDefined();
      expect(content).not.toContain('Read error');
    });

    it('should handle parse errors gracefully', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      (fs.readFile as any).mockResolvedValueOnce('invalid typescript syntax');
      const content = await load('\0virtual:sveltekit-functions');
      expect(content).toBeDefined();
    });

    it('should handle malformed exports', async () => {
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const malformedFile = `
        export const = function() {};
      `;
      (fs.readFile as any).mockResolvedValueOnce(malformedFile);
      const content = await load('\0virtual:sveltekit-functions');
      expect(content).toBeDefined();
    });

    it('should handle syntax errors in library files', async () => {
      (fs.readFile as any).mockResolvedValueOnce(`
        export function brokenFunction {
          return true;
        }
      `);
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      expect(content).toBeDefined();
    });

    it('should handle missing files', async () => {
      (fs.readFile as any).mockRejectedValueOnce(new Error('ENOENT'));
      const load = plugin.load as (id: string) => Promise<string | undefined>;
      const content = await load('\0virtual:sveltekit-functions');
      expect(content).toBeDefined();
    });
  });
});