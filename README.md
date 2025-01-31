# vite-plugin-triggerkit

A Vite plugin that enables seamless integration between SvelteKit and Trigger.dev by allowing you to use your SvelteKit functions directly in your Trigger.dev projects.

[![npm version](https://badge.fury.io/js/@sveltrigger%2Fvite.svg)](https://badge.fury.io/js/@sveltrigger%2Fvite)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🔄 Use SvelteKit functions directly in Trigger.dev jobs
- 📦 Automatic function discovery and export
- 🔍 TypeScript support with type preservation
- 📝 Preserves JSDoc documentation
- 🔥 Hot Module Reloading support
- 🎯 Configurable directory scanning

## Installation

```bash
npm install -D vite-plugin-triggerkit
```

## Quick Start

1. Add the plugin to your `vite.config.ts`:

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { triggerkit } from 'vite-plugin-triggerkit';

export default defineConfig({
  plugins: [
    sveltekit(),
    triggerkit({
      includeDirs: ['src/lib', 'src/routes/api']
    })
  ]
});
```

2. Write your functions in SvelteKit:

```typescript
// src/lib/email.ts
/**
 * Sends a welcome email to a new user
 */
export async function sendWelcomeEmail(userId: string) {
  // Your email sending logic
  return { success: true };
}
```

3. Use them in your Trigger.dev project:

```typescript
import { sendWelcomeEmail } from 'virtual:sveltekit-functions';

export const welcomeEmailJob = trigger.job({
  id: "welcome-email",
  run: async (payload) => {
    await sendWelcomeEmail(payload.userId);
  }
});
```

## Configuration

The plugin accepts the following options:

```typescript
interface PluginOptions {
  // Directories to scan for exportable functions
  includeDirs?: string[];  // default: ['src/lib', 'src/routes/api']
  
  // File patterns to scan
  include?: string[];      // default: ['**/*.ts', '**/*.js', '**/+server.ts']
  
  // Patterns to exclude
  exclude?: string[];      // default: ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts']
  
  // Virtual module ID for accessing functions
  virtualModuleId?: string; // default: 'virtual:sveltekit-functions'
}
```

## Function Metadata

You can access metadata about your functions using the exported `functions` object:

```typescript
import { functions } from 'virtual:sveltekit-functions';

console.log(functions.sendWelcomeEmail.metadata);
// Output:
// {
//   isAsync: true,
//   parameters: [
//     { name: 'userId', type: 'string', optional: false }
//   ],
//   returnType: 'Promise<{ success: boolean }>',
//   docstring: 'Sends a welcome email to a new user'
// }
```

## Best Practices

1. **Function Organization**: Keep trigger-related functions in dedicated directories for better organization:
   ```
   src/lib/triggers/
   ├── email.ts
   ├── notifications.ts
   └── users.ts
   ```

2. **Type Safety**: Always define types for function parameters and return values:
   ```typescript
   export async function createUser(data: UserData): Promise<User> {
     // Implementation
   }
   ```

3. **Documentation**: Add JSDoc comments to your functions for better developer experience:
   ```typescript
   /**
    * Creates a new user in the database
    * @param data - User creation data
    * @returns Newly created user
    */
   export async function createUser(data: UserData): Promise<User> {
     // Implementation
   }
   ```

## Examples

### Basic Usage
```typescript
// src/lib/auth.ts
export async function verifyUser(token: string): Promise<boolean> {
  // Verification logic
}

// trigger/auth.ts
import { verifyUser } from 'virtual:sveltekit-functions';

export const userVerificationJob = trigger.job({
  id: "verify-user",
  run: async (payload) => {
    const isValid = await verifyUser(payload.token);
    if (!isValid) {
      throw new Error('Invalid user token');
    }
  }
});
```

### With Function Metadata
```typescript
import { functions } from 'virtual:sveltekit-functions';

// Get all available functions
const availableFunctions = Object.keys(functions);

// Check function parameters
const params = functions.verifyUser.metadata.parameters;
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
