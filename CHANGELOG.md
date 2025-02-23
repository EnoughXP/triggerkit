# Changelog

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