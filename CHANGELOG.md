# Changelog

## 2.0.2

### Patch Changes

- c142ea0: Fix type definition generation to include exported classes

  Previously, the type definition file generator only included functions in the
  generated `virtual-triggerkit.d.ts` file. This caused TypeScript errors when
  importing exported classes like `AuthService` from `virtual:triggerkit`.

  This patch updates `generateFunctionTypeDeclarations` to use
  `extractExportedItems` instead of `extractFunctionSignatures`, ensuring that all
  exported items (functions, classes, and constants) are properly included in the
  generated type definitions with their full type information, including class
  methods and properties.

## 2.0.1

### Patch Changes

- Updates homepage URL in package.json

## 2.0.0

### Major Changes

- Changeset Summary: Major Feature Release v2.0.0

  🎉 Overview

  This release represents a major enhancement to Triggerkit with new features for
  **class support**, **flexible export organization**, **enhanced TypeScript
  support**, and **improved developer experience**.

  ***

  ✨ New Features

  🏗️ **Class Support**

  - **Added full TypeScript class support** with method and property detection
  - **Constructor parameter extraction** for proper type declarations
  - **Static method and property support**
  - **Inheritance and interface implementation detection**
  - **Generated TypeScript declarations** preserve class structure

  ```typescript
  // Now supported!
  export class UserService {
  	constructor(private apiKey: string) {}
  	async getUser(id: string): Promise<User> {
  		/* ... */
  	}
  	static validateEmail(email: string): boolean {
  		/* ... */
  	}
  }
  ```

  📁 **Flexible Export Organization**

  - **New export strategies**: `individual` (default), `grouped`, `mixed`
  - **Group by file, folder, or custom logic**
  - **Configurable group prefixes** for namespace organization
  - **Backwards compatibility** - individual exports always available

  ```typescript
  // Grouped exports
  import { api_auth, api_users } from 'virtual:triggerkit';
  api_auth.login(credentials);

  // Individual exports still work
  import { getUser, login } from 'virtual:triggerkit';
  ```

  🎛️ **Debug Levels**

  - **Three debug levels**: `minimal` (default), `verbose`, `off`
  - **Clean development experience** with minimal logging
  - **Detailed debugging** when needed
  - **Silent mode** for production builds

  🔍 **Enhanced TypeScript Support**

  - **Preserves generic types** and complex function signatures
  - **Method signature extraction** with full parameter and return types
  - **Enhanced type declarations** generated automatically
  - **Better IntelliSense** support in IDEs

  ⚙️ **Configurable Export Types**

  - **Control what gets exported**: functions, classes, constants, variables
  - **Fine-grained inclusion control**
  - **Performance optimization** by excluding unnecessary exports

  ***

  🛠️ **API Changes**

  **New Configuration Options**

  ```typescript
  interface PluginOptions {
  	// Existing options remain unchanged
  	includeDirs?: string[];
  	filePatterns?: string[];
  	exclude?: string[];

  	// NEW: Export organization
  	exportStrategy?: {
  		mode: 'individual' | 'grouped' | 'mixed';
  		groupBy?: 'file' | 'folder' | 'custom';
  		groupingFunction?: (filePath: string, exportName: string) => string;
  		groupPrefix?: string;
  	};

  	// NEW: Export type control
  	includeTypes?: {
  		functions?: boolean;
  		classes?: boolean;
  		constants?: boolean;
  		variables?: boolean;
  	};

  	// NEW: Debug control
  	debugLevel?: 'minimal' | 'verbose' | 'off';
  }
  ```

  **Enhanced Export Interface**

  ```typescript
  // NEW: Enhanced export item structure
  interface ExportedItem {
  	name: string;
  	type: 'function' | 'class' | 'const' | 'variable';
  	signature: string;
  	isAsync: boolean;
  	returnType: string;
  	params: string;
  	classInfo?: {
  		methods: Array<{ name: string; signature: string; isStatic: boolean }>;
  		properties: Array<{ name: string; type: string; isStatic: boolean }>;
  		constructor?: { params: string };
  	};
  }
  ```

  ***

  🔧 **Internal Improvements**

  **Code Architecture**

  - **Unified export detection** - single function handles all export types
  - **Modular generation** - separate functions for different export strategies
  - **Enhanced regex patterns** for better detection accuracy
  - **Improved error handling** with debug-level-aware logging

  **Performance Optimizations**

  - **Selective scanning** based on `includeTypes` configuration
  - **Efficient caching** with type-aware invalidation
  - **Reduced logging overhead** in production mode
  - **Optimized TypeScript declaration generation**

  **Type Safety**

  - **Fixed TypeScript errors** in class info initialization
  - **Stronger type definitions** throughout codebase
  - **Better generic type handling**
  - **Enhanced interface definitions**

  ***

  📝 **Generated Code Changes**

  **Virtual Module Output**

  ```typescript
  // NEW: Grouped exports (when enabled)
  export const api_auth = {
  	login,
  	logout,
  	validateToken
  };

  // NEW: Class exports with full typing
  export declare class UserService {
  	constructor(apiKey: string);
  	getUser(id: string): Promise<User>;
  	static validateEmail(email: string): boolean;
  }

  // ENHANCED: Better function type preservation
  export declare function processData<T extends DataType>(
  	data: T,
  	options: ProcessOptions
  ): Promise<ProcessedData<T>>;
  ```

  **TypeScript Declarations**

  - **Enhanced .d.ts generation** with class support
  - **Preserved generic constraints** and complex types
  - **Grouped export type definitions**
  - **Environment variable exports** with string typing

  ***

  🚀 **Migration Guide**

  **For Existing Users**

  - ✅ **Zero breaking changes** - all existing code continues to work
  - ✅ **Default behavior unchanged** - `individual` export mode by default
  - ✅ **Backwards compatible** - existing imports work as before
  - ✅ **Opt-in features** - new features require explicit configuration

  **Recommended Upgrades**

  ```typescript
  // Before (still works)
  triggerkit({
  	includeDirs: ['src/lib/server']
  });

  // After (enhanced)
  triggerkit({
  	includeDirs: ['src/lib/server'],
  	includeTypes: { functions: true, classes: true },
  	exportStrategy: { mode: 'grouped', groupBy: 'folder' },
  	debugLevel: 'minimal'
  });
  ```

  ***

  🐛 **Bug Fixes**

  - **Fixed TypeScript compilation errors** in class info initialization
  - **Improved function detection accuracy** with enhanced regex patterns
  - **Better error handling** for malformed export statements
  - **Resolved edge cases** in environment variable transformation
  - **Fixed duplicate export detection** in mixed scenarios

  ***

  📖 **Documentation Updates**

  - **Comprehensive README rewrite** with all new features
  - **Configuration examples** for different use cases
  - **Migration guide** for existing users
  - **TypeScript examples** showcasing enhanced support
  - **Debug level documentation** for different development phases

  ***

  🎯 **Developer Experience Improvements**

  **Better Logging**

  - **Contextual debug messages** based on selected level
  - **Clear progress indicators** during build process
  - **Detailed error reporting** when issues occur
  - **Performance metrics** in verbose mode

  **Enhanced IDE Support**

  - **Richer IntelliSense** with preserved type information
  - **Better autocomplete** for class methods and properties
  - **Accurate type checking** for complex generic functions
  - **Improved error messages** during development

  ***

  🧪 **Testing & Quality**

  **Enhanced Detection**

  - **Comprehensive export pattern testing** across different syntax styles
  - **Class hierarchy detection** with inheritance and interfaces
  - **Generic type preservation** validation
  - **Environment variable transformation** verification

  **Type Safety**

  - **Eliminated TypeScript compilation warnings**
  - **Stronger interface definitions**
  - **Better error type handling**
  - **Enhanced parameter validation**

  ***

  📊 **Impact Summary**

  | Category               | Changes                           |
  | ---------------------- | --------------------------------- |
  | **New Features**       | 5 major features added            |
  | **API Extensions**     | 3 new configuration sections      |
  | **TypeScript Support** | Significantly enhanced            |
  | **Breaking Changes**   | None - fully backwards compatible |
  | **Performance**        | Improved with selective scanning  |
  | **Documentation**      | Complete rewrite with examples    |

  ***

  🚀 **What's Next**

  This release establishes Triggerkit as a comprehensive SvelteKit-to-Trigger.dev
  integration solution. Future releases will focus on:

  - **Additional export strategies** based on user feedback
  - **Enhanced error reporting** and debugging tools
  - **Performance optimizations** for large codebases
  - **Extended IDE integration** features

  ***

  **Release Type**: Major (v2.0.0)\
  **Backwards Compatibility**: ✅ Full\
  **Migration Required**: ❌ None\
  **Recommended**: ✅ Highly recommended for all users

## 1.5.4

### Patch Changes

- Improve importing of environment variables

## 1.5.3

### Patch Changes

- update README

## 1.5.2

### Patch Changes

- Package builds and resolves with virtual modules

## 1.5.1

### Patch Changes

- remove export of virtual module type definition

## 1.5.0

### Minor Changes

- Restructured core plugin code

## 1.3.3

### Patch Changes

- consolidate functions to be shared in both ends of the plugin

## 1.3.2

### Patch Changes

- Relaxed peer deps, removed CLI functionality

## 1.3.1

### Patch Changes

- removed cli

## 1.3.0

### Minor Changes

- 4a3ad59: Add CLI to init triggerkit

### Patch Changes

- 4a3ad59: Add changeset to package
- 4885020: update scripts and include cli to vite.config

All notable changes to vite-plugin-triggerkit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2024-02-23

### Added

- Initial release of triggerkit
- Vite plugin for SvelteKit server function integration
- ESBuild plugin for Trigger.dev integration
- TypeScript type preservation
- Environment variable handling
- Function metadata support
- Hot Module Reloading support
- Function discovery from server directories
- JSDoc documentation preservation

### Features

- Multiple entry points support (Vite and ESBuild)
- Automatic environment variable transformation
- Path resolution for `$lib` imports
- Server function scanning with configuration options
- Type-safe function exports
- Development and production build modes

## [1.1.0] - 2024-02-12

### Changed

- **BREAKING**: Removed tsup build tooling dependency. Dependencies like `@typescript-eslint/typescript-estree` and `@typescript-eslint/types` are now required to be installed by the consuming project.

### Fixed

- Gracefully handle non-existent directories in `includeDirs` configuration instead of throwing ENOENT errors. The plugin will now skip missing directories and continue scanning available ones, with a warning message indicating which directories were skipped.

### Added

- Warning messages when configured directories in `includeDirs` do not exist, improving debugging experience.

### Dependencies

- Added `@typescript-eslint/typescript-estree` and `@typescript-eslint/types` as peer dependencies
- Removed build dependencies related to tsup

## [1.0.0] - 2024-01-28

### Added

- Initial release of vite-plugin-triggerkit
- Function scanning and discovery from SvelteKit projects
- TypeScript support with type preservation
- JSDoc documentation preservation
- Hot Module Reloading support
- Configurable directory scanning
- Function metadata access
- Virtual module generation for Trigger.dev integration

### Configuration Options

- `includeDirs` for specifying directories to scan
- `include` patterns for file matching
- `exclude` patterns for ignoring files
- `virtualModuleId` for customizing the virtual module name

## [0.9.0] - 2024-01-15

### Added

- Beta release for testing
- Basic function scanning
- Initial TypeScript support
- Simple virtual module generation

### Changed

- Improved error handling
- Enhanced documentation

### Fixed

- Issues with file path resolution
- Problems with TypeScript type extraction

## [0.8.0] - 2024-01-01

### Added

- Alpha release
- Proof of concept implementation
- Basic documentation

## Unreleased Changes

### Added

- Enhanced error messages for common configuration issues
- Improved TypeScript type inference
- Better handling of complex export scenarios

### Changed

- Optimized function scanning performance
- Improved virtual module generation

### Fixed

- Various bug fixes and improvements

## Upcoming Features

- Function validation before export
- Custom transformer support
- Integration with more Trigger.dev features
- Enhanced metadata extraction
- Function dependency tracking

Note: Dates in unreleased sections are tentative and subject to change.

For detailed migration guides and release notes, please see the [Releases](https://github.com/your-username/vite-plugin-triggerkit/releases) page.
