import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { triggerkit } from '../triggerkit';
import type { Plugin } from 'vite';
import { globSync } from 'glob';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('glob', () => ({
  globSync: vi.fn()
}));

function executeConfigHook(hook: Plugin['configResolved'], config: any) {
  if (typeof hook === 'function') {
    return hook(config);
  }
  if (typeof hook === 'object' && hook.handler) {
    return hook.handler(config);
  }
}

describe('triggerkit', () => {
  let plugin: Plugin;
  const mockFs = vi.mocked(fs);
  const mockGlobSync = vi.mocked(globSync);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(`
      export function testFunction(param: string): string {
        return param;
      }
    `);
    mockGlobSync.mockReturnValue(['test.ts']);
    plugin = triggerkit();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create a plugin with default options', () => {
    expect(plugin.name).toBe('vite-plugin-triggerkit');
    expect(plugin.resolveId).toBeDefined();
    expect(plugin.load).toBeDefined();
    expect(plugin.handleHotUpdate).toBeDefined();
  });

  describe('configResolved', () => {
    const mockConfig = {
      root: process.cwd(),
      base: '/',
      mode: 'development',
    } as any;

    it('should scan directories and find exported functions', () => {
      if (plugin.configResolved) {
        executeConfigHook(plugin.configResolved, mockConfig);
      }

      expect(mockFs.existsSync).toHaveBeenCalled();
      expect(mockGlobSync).toHaveBeenCalled();
      expect(mockFs.readFileSync).toHaveBeenCalled();
    });

    it('should handle non-existent directories', () => {
      mockFs.existsSync.mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

      if (plugin.configResolved) {
        executeConfigHook(plugin.configResolved, mockConfig);
      }

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle glob errors', () => {
      mockGlobSync.mockReturnValue(undefined as any);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

      if (plugin.configResolved) {
        executeConfigHook(plugin.configResolved, mockConfig);
      }

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(() => {
        if (plugin.configResolved) {
          executeConfigHook(plugin.configResolved, mockConfig);
        }
      }).not.toThrow();
      consoleSpy.mockRestore();
    });
  });

  // ... rest of the test file remains the same ...

  describe('Custom options', () => {
    const mockConfig = { root: process.cwd() } as any;

    it('should respect custom includeDirs', () => {
      const customPlugin = triggerkit({
        includeDirs: ['custom/dir']
      });

      if (customPlugin.configResolved) {
        executeConfigHook(customPlugin.configResolved, mockConfig);
      }

      expect(mockFs.existsSync).toHaveBeenCalledWith(expect.stringContaining('custom/dir'));
    });

    it('should respect custom include patterns', () => {
      mockGlobSync.mockReturnValue(['test.custom.ts']);
      const customPlugin = triggerkit({
        include: ['**/*.custom.ts']
      });

      if (customPlugin.configResolved) {
        executeConfigHook(customPlugin.configResolved, mockConfig);
      }

      expect(mockGlobSync).toHaveBeenCalledWith(
        ['**/*.custom.ts'],
        expect.any(Object)
      );
    });

    it('should respect custom virtualModuleId', () => {
      const customPlugin = triggerkit({
        virtualModuleId: 'virtual:custom'
      });

      const result = customPlugin.resolveId?.('virtual:custom', undefined, undefined);
      expect(result).toBe('\0virtual:custom');
    });
  });
});