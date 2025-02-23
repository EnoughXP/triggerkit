import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerkit } from '../triggerkit';
import type { Plugin, HmrContext } from 'vite';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { normalizePath } from 'vite';

// Mock fs promises
vi.mock('node:fs', () => ({
  promises: {
    readdir: vi.fn(),
    readFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock file system structure
const mockFiles = {
  // Server functions with env variables
  'src/lib/server/auth.ts': `
    import { JWT_SECRET } from '$env/static/private';
    
    export function calculateYearlyPrice(monthlyPrice: number): number {
      return monthlyPrice * 12;
    }

    export function getYearlyPriceLabel(monthlyPrice: number): string {
      return \`$\${calculateYearlyPrice(monthlyPrice)}/year\`;
    }
  `,

  'src/lib/server/stripe.ts': `
    import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';
    
    export async function createCustomer(email: string) {
      return { id: 'cus_123', email };
    }

    export async function createSubscription(customerId: string, priceId: string) {
      return { id: 'sub_123', customer: customerId, price: priceId };
    }
  `,

  'src/lib/server/database.ts': `
    import { DATABASE_URL } from '$env/static/private';
    
    export async function getUser(id: string) {
      return { id, name: 'Test User' };
    }

    /** 
     * Creates a new user in the database
     * @param data User data to insert
     */
    export async function createUser(data: { email: string; name: string }) {
      return { id: '123', ...data };
    }
  `,

  // Server functions without env variables
  'src/lib/server/utils.ts': `
    export function formatCurrency(amount: number, currency: string = 'USD'): string {
      return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency 
      }).format(amount);
    }

    export async function sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  `,

  // Function with optional parameters
  'src/lib/server/config.ts': `
    export interface ConfigOptions {
      timeout?: number;
      retries?: number;
      environment?: 'development' | 'production';
    }

    export function configure(options?: ConfigOptions) {
      return {
        timeout: options?.timeout ?? 3000,
        retries: options?.retries ?? 3,
        environment: options?.environment ?? 'development'
      };
    }
  `
};

describe('Triggerkit Vite plugin', () => {
  let plugin: Plugin;

  beforeEach(() => {
    vi.clearAllMocks();

    const normalizeMockPath = (path: string) => {
      return normalizePath(resolve(process.cwd(), path));
    };

    // Setup fs mocks with proper path resolution
    (fs.readFile as any).mockImplementation((filePath) => {
      const normalizedPath = normalizePath(filePath);
      console.log('Reading file:', normalizedPath);

      for (const [mockPath, content] of Object.entries(mockFiles)) {
        const fullMockPath = normalizeMockPath(mockPath);
        if (normalizedPath.endsWith(mockPath) || normalizedPath === fullMockPath) {
          console.log('Found mock file:', mockPath);
          return Promise.resolve(content);
        }
      }
      console.log('File not found:', normalizedPath);
      return Promise.reject(new Error(`File not found: ${filePath}`));
    });

    // Important: Mock access to return success for our test directories
    (fs.access as any).mockImplementation((path) => {
      const normalizedPath = normalizePath(path);
      console.log('Checking access:', normalizedPath);

      // Always allow access to our test directories
      const allowedPaths = [
        'src/lib/server',
        'src/trigger/generated'
      ].map(normalizeMockPath);

      if (allowedPaths.some(allowed => normalizedPath.includes(allowed))) {
        return Promise.resolve();
      }

      return Promise.reject(new Error(`ENOENT: no such file or directory, access '${path}'`));
    });

    // Mock directory reads with proper path handling
    (fs.readdir as any).mockImplementation((dirPath, options) => {
      const normalizedPath = normalizePath(dirPath);
      console.log('Reading directory:', normalizedPath);

      if (normalizedPath.includes('src/lib/server')) {
        return Promise.resolve([
          {
            name: 'auth.ts',
            isFile: () => true,
            isDirectory: () => false
          },
          {
            name: 'stripe.ts',
            isFile: () => true,
            isDirectory: () => false
          },
          {
            name: 'database.ts',
            isFile: () => true,
            isDirectory: () => false
          }
        ]);
      }
      return Promise.resolve([]);
    });

    plugin = triggerkit({
      includeDirs: ['src/lib/server'],
      outputPath: 'src/trigger/generated/index.ts'
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
        outputPath: 'src/trigger/custom/index.ts'
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

  });

  describe('Module Generation', () => {
    it('should correctly scan server directory', async () => {
      // Trigger a scan
      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      // Check if readdir was called with the correct path
      expect(fs.readdir).toHaveBeenCalledWith(
        expect.stringContaining('src/lib/server'),
        expect.any(Object)
      );

      // Check if readFile was called for our mock files
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('auth.ts'),
        'utf-8'
      );
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('stripe.ts'),
        'utf-8'
      );
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('database.ts'),
        'utf-8'
      );
    });

    it('should generate module with correct imports and exports', async () => {
      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      // Get the write file calls
      const writeFileCalls = (fs.writeFile as any).mock.calls;
      console.log('Write file calls:', writeFileCalls.length);
      if (writeFileCalls.length > 0) {
        console.log('Written content:', writeFileCalls[0][1]);
      }

      const writeFileArgs = writeFileCalls[0];
      const [filePath, content] = writeFileArgs;

      // Log the actual content for debugging
      console.log('Generated file path:', filePath);
      console.log('Generated content:', content);

      // More specific checks
      expect(filePath).toContain('src/trigger/generated/index.ts');
      expect(content).toContain('const functions =');

      // Check for any functions in the metadata
      const functionMatch = content.match(/functions\s*=\s*({[^}]+})/);
      console.log('Functions match:', functionMatch);

      expect(content).toContain('calculateYearlyPrice');
      expect(content).toContain('$lib/server/auth');
    });

    it('should include function metadata in generated module', async () => {
      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      // Verify correct file path
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('src/trigger/generated/index.ts'),
        expect.any(String),
        'utf-8'
      );

      const writeFileArgs = (fs.writeFile as any).mock.calls[0];
      const content = writeFileArgs[1];

      // Check metadata
      expect(content).toContain('const functions = {');
      expect(content).toContain('"calculateYearlyPrice": {');
      expect(content).toMatch(/"metadata":\s*{/);
      expect(content).toMatch(/"isAsync":\s*false/);
      expect(content).toMatch(/"parameters":\s*\[/);
    });

    it('should handle functions with optional parameters', async () => {
      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      // Check if configure function with optional params is properly handled
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/configure.*optional.*timeout.*retries/s),
        'utf-8'
      );
    });
  });

  describe('Function Processing', () => {
    it('should parse async functions correctly', async () => {
      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/"isAsync":\s*true/),
        'utf-8'
      );
    });

    it('should handle functions with no parameters', async () => {
      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      // Check if noParams function is properly handled
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/"parameters":\s*\[\]/),
        'utf-8'
      );
    });
  });

  describe('HMR Support', () => {
    it('should handle updates to library files', async () => {
      const handleHotUpdate = plugin.handleHotUpdate as (ctx: HmrContext) => Promise<void>;
      await handleHotUpdate({
        file: 'src/lib/server/database.ts',
        timestamp: Date.now(),
        server: { moduleGraph: { invalidateModule: vi.fn() } } as any,
        modules: [],
        read: () => Promise.resolve('')
      });

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle file content changes', async () => {
      const newContent = `
        export async function newFunction() {
          return true;
        }
      `;

      (fs.readFile as any).mockResolvedValueOnce(newContent);

      const handleHotUpdate = plugin.handleHotUpdate as (ctx: HmrContext) => Promise<void>;
      await handleHotUpdate({
        file: 'src/lib/server/database.ts',
        timestamp: Date.now(),
        server: { moduleGraph: { invalidateModule: vi.fn() } } as any,
        modules: [],
        read: () => Promise.resolve(newContent)
      });

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('Environment Variables', () => {
    it('should extract env variables from imports', async () => {
      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      // Get the actual content passed to writeFile
      const writeFileArgs = (fs.writeFile as any).mock.calls[0];
      const content = writeFileArgs[1];

      // Verify DATABASE_URL from database.ts was extracted
      expect(content).toContain('const { DATABASE_URL } = process.env;');

      // Verify multiple env vars from stripe.ts were extracted
      expect(content).toContain('const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = process.env;');

      // Verify JWT_SECRET from auth.ts was extracted
      expect(content).toContain('const { JWT_SECRET } = process.env;');
    });

    it('should handle files with no env variables', async () => {
      // Override mock files to only include files without env vars
      (fs.readFile as any).mockImplementation((path) => {
        const normalizedPath = normalizePath(path);
        if (normalizedPath.endsWith('server/utils.ts')) {
          return mockFiles['src/lib/server/utils.ts'];
        }
        if (normalizedPath.endsWith('server/config.ts')) {
          return mockFiles['src/lib/server/config.ts'];
        }
        throw new Error(`File not found: ${path}`);
      });

      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      const writeFileArgs = (fs.writeFile as any).mock.calls[0];
      const content = writeFileArgs[1];

      // Verify no process.env destructuring is present
      expect(content).not.toContain('process.env');
    });

    it('should deduplicate env variables', async () => {
      // Add a mock file that imports the same env var multiple times
      const duplicateEnvFile = `
        import { DATABASE_URL } from '$env/static/private';
        import { DATABASE_URL as DB_URL } from '$env/static/private';
        
        export function getDatabaseUrl() {
          return DATABASE_URL;
        }
      `;

      (fs.readFile as any).mockImplementationOnce(() => duplicateEnvFile);

      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      const writeFileArgs = (fs.writeFile as any).mock.calls[0];
      const content = writeFileArgs[1];

      // DATABASE_URL should only appear once in the destructuring
      const matches = content.match(/DATABASE_URL/g) || [];
      expect(matches.length).toBe(1);
    });

    it('should handle multiple env imports in the same file', async () => {
      const multipleEnvFile = `
        import { JWT_SECRET } from '$env/static/private';
        import { PUBLIC_API_URL } from '$env/static/public';
        
        export function getConfig() {
          return { jwt: JWT_SECRET, api: PUBLIC_API_URL };
        }
      `;

      (fs.readFile as any).mockImplementationOnce(() => multipleEnvFile);

      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      const writeFileArgs = (fs.writeFile as any).mock.calls[0];
      const content = writeFileArgs[1];

      expect(content).toContain('const { JWT_SECRET, PUBLIC_API_URL } = process.env;');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing files', async () => {
      // Mock a file read error
      (fs.readFile as any).mockRejectedValueOnce(new Error('ENOENT'));
      // But ensure mkdir succeeds
      (fs.mkdir as any).mockResolvedValue(undefined);

      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      // Verify mkdir was called
      expect(fs.mkdir).toHaveBeenCalled();
      // Verify we still tried to write the file
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle directory creation errors', async () => {
      // Mock mkdir failure
      (fs.mkdir as any).mockRejectedValueOnce(new Error('EACCES'));

      const buildStart = plugin.buildStart as () => Promise<void>;
      await expect(buildStart()).rejects.toThrow('EACCES');
    });

    it('should handle file write errors', async () => {
      (fs.writeFile as any).mockRejectedValueOnce(new Error('EACCES'));

      const buildStart = plugin.buildStart as () => Promise<void>;
      await expect(buildStart()).rejects.toThrow('EACCES');
    });

    it('should handle parse errors gracefully', async () => {
      (fs.readFile as any).mockResolvedValueOnce('invalid typescript syntax');
      (fs.mkdir as any).mockResolvedValue(undefined);

      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      // Should still try to write even if parsing fails
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle malformed exports', async () => {
      const malformedFile = `
        export const = function() {};
      `;
      (fs.readFile as any).mockResolvedValueOnce(malformedFile);
      (fs.mkdir as any).mockResolvedValue(undefined);

      const buildStart = plugin.buildStart as () => Promise<void>;
      await buildStart();

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});