# triggerkit

A Vite plugin that enables seamless integration between SvelteKit and Trigger.dev by allowing you to use your SvelteKit functions directly in your Trigger.dev projects.

[![npm version](https://badge.fury.io/js/vite-plugin-triggerkit2Fvite.svg)](https://badge.fury.io/js/@sveltrigger%2Ftriggerkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🔄 Use SvelteKit functions directly in Trigger.dev jobs
- 📦 Automatic function discovery and export
- 🔍 TypeScript support with type preservation
- 🔥 Hot Module Reloading support
- 🎯 Configurable directory scanning

## Installation

```bash
npm add -D triggerkit
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

2. Configure Trigger.dev to use the plugin:

```typescript
// trigger.config.ts
import { defineConfig } from "@trigger.dev/sdk/v3";
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
});
```

3. Write your server functions in SvelteKit:

```typescript
// src/lib/server/email.ts
import { EMAIL_API_KEY } from '$env/static/private';

/**
 * Sends a welcome email to a new user
 */
export async function sendWelcomeEmail(userId: string) {
  // Your email sending logic using EMAIL_API_KEY
  return { success: true, userId };
}
```

4. Use them in your Trigger.dev project:

```typescript
import { sendWelcomeEmail } from "virtual:triggerkit";
import { task } from "@trigger.dev/sdk/v3";

export const welcomeEmailTask = task({
  id: "welcome-email",
  run: async (payload: { userId: string }) => {
    const result = await sendWelcomeEmail(payload.userId);
    return result;
  },
});
```

## Configuration

```typescript
interface PluginOptions {
  /**
   * Directories to scan for exportable functions.
   * @default ['src/lib', 'src/lib/server']
   */
  includeDirs?: string[];

  /**
   * File patterns to scan. Use forward slashes even on Windows.
   * @default ['**/*.ts', '**/*.js', '**/+server.ts']
   */
  include?: string[];

  /**
   * Patterns to exclude from scanning. Use forward slashes even on Windows.
   * @default ['**/node_modules/**', '**/*.test.ts', '**/*.spec.ts']
   */
  exclude?: string[];
}
```

## Function Metadata

The plugin preserves TypeScript types and JSDoc documentation. You can access function metadata through the exported `functions` object:

```typescript
import { functions } from 'virtual:triggerkit';

console.log(functions.sendWelcomeEmail.metadata);
// {
//   isAsync: true,
//   parameters: [
//     { name: 'userId', type: 'string', optional: false }
//   ],
//   returnType: 'Promise<{ success: boolean, userId: string }>',
//   docstring: 'Sends a welcome email to a new user'
// }
```

## Environment Variables

The plugin automatically handles environment variables imported from `$env/static/private` or `$env/static/public`, making them available in your Trigger.dev tasks through `process.env`.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
