# Triggerkit

A powerful Trigger.dev extension that enables seamless integration between
SvelteKit and Trigger.dev by allowing you to use your SvelteKit functions,
classes, and exports directly in your Trigger.dev projects with zero code
changes.

[![npm version](https://badge.fury.io/js/triggerkit.svg)](https://badge.fury.io/js/triggerkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨Features

- 🔄 Zero-config integration - Use SvelteKit functions directly in Trigger.dev
  jobs
- 📦 Smart discovery - Automatic function, class, and export detection
- 🏗️ Class support - Import and use your SvelteKit classes with full TypeScript
  support
- 📁 Flexible organization - Group exports by file, folder, or custom logic
- 🔍 Rich TypeScript support - Preserves generics, complex types, and method
  signatures
- 🌐 Environment variables - Automatic SvelteKit env handling ($env/static/*)
- 🎯 Configurable scanning - Control what gets exported and how
- 🚀 Works with Trigger.dev V3
- 🔧 Debug levels - Control logging verbosity for clean development

## 📦Installation

```bash
npm add -D triggerkit
```

## 🚀Quick Start

1. Configure Trigger.dev

```typescript
// trigger.config.ts
import { defineConfig } from "@trigger.dev/sdk/v3";
import { triggerkit } from "triggerkit";

export default defineConfig({
  project: "your-project-id",
  runtime: "node",
  build: {
    extensions: [
      triggerkit(), // Zero config - just works!
    ],
  },
});
```

2. Write your SvelteKit Code (No Changes Needed1)

```typescript
// src/lib/server/email.ts
import { EMAIL_API_KEY } from "$env/static/private";
import { PUBLIC_APP_URL } from "$env/static/public";

export async function sendWelcomeEmail(userId: string, email: string) {
  // Your existing SvelteKit function - no changes needed!
  const response = await fetch(`${PUBLIC_APP_URL}/api/email`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${EMAIL_API_KEY}` },
    body: JSON.stringify({ userId, email, type: "welcome" }),
  });

  return { success: response.ok, userId };
}

// Classes work too!
export class UserService {
  constructor(private apiKey: string) {}

  async getUser(id: string): Promise<User> {
    // Your service logic
  }

  static validateEmail(email: string): boolean {
    return /\S+@\S+\.\S+/.test(email);
  }
}
```

3. Use in Trigger.dev (With Full Typescript Support!)

```typescript
// src/trigger/welcome.ts
import { sendWelcomeEmail, UserService } from "virtual:triggerkit";
import { task } from "@trigger.dev/sdk/v3";

export const welcomeEmailTask = task({
  id: "welcome-email",
  run: async (payload: { userId: string; email: string }) => {
    // Full IntelliSense and type checking!
    const userService = new UserService(process.env.USER_API_KEY);
    const user = await userService.getUser(payload.userId);

    const result = await sendWelcomeEmail(payload.userId, payload.email);
    return { result, user };
  },
});
```

## ⚙️Configuration Options

```typescript
interface PluginOptions {
  /**
   * Directories to scan for exportable items
   * @default ["src/lib"]
   */
  includeDirs?: string[];

  /**
   * File extensions to look for
   * @default [".ts", ".js"]
   */
  filePatterns?: string[];

  /**
   * Patterns to exclude from scanning
   * @default ["test.", "spec.", ".d.ts"]
   */
  exclude?: string[];

  /**
   * Export organization strategy
   * @default { mode: "individual" }
   */
  exportStrategy?: {
    mode: "individual" | "grouped" | "mixed";
    groupBy?: "file" | "folder";
    groupPrefix?: string;
  };

  /**
   * What types of exports to include
   * @default { functions: true, classes: true, constants: false }
   */
  includeTypes?: {
    functions?: boolean;
    classes?: boolean;
    constants?: boolean;
    variables?: boolean;
  };

  /**
   * Debug logging level
   * @default "minimal"
   */
  debugLevel?: "minimal" | "verbose" | "off";
}
```

## 🎛️ Export Strategies

#### Individual Exports (Default)

```typescript
// Simple imports
import { getTimestamp, sendEmail, UserService } from "virtual:triggerkit";
```

#### Grouped Exports

```typescript
triggerkit({
  exportStrategy: {
    mode: "grouped",
    groupBy: "folder", // or "file" or "custom"
    groupPrefix: "api",
  },
});

// Organized imports
import { api_auth, api_email, api_users } from "virtual:triggerkit";
api_auth.login(credentials);
api_users.getUser(id);
api_email.sendWelcome(email);
```

#### Mixed Mode

```typescript
// Both individual AND grouped exports available
import {
  api_auth, // Grouped
  sendEmail, // Individual
  UserService, // Individual class
} from "virtual:triggerkit";
```

## 🔧 Debug Levels

Control how much information Triggerkit logs

```typescript
triggerkit({
  debugLevel: "minimal", // Default - clean output
  // debugLevel: "verbose"  // Detailed debugging info
  // debugLevel: "off"      // Silent (production)
});
```

## 🎯 Advanced Usage

#### Functions Object

You can access all discovered functions through the functions object:

```typescript
import { functions } from "virtual:triggerkit";
// Call a discovered function
await functions.sendWelcomeEmail(userId);
```

#### Class Support

```typescript
// src/lib/server/services.ts
export class PaymentService {
  constructor(private apiKey: string) {}

  async processPayment<T extends PaymentData>(
    data: T,
  ): Promise<PaymentResult<T>> {
    // Your payment logic
  }

  static validateCard(cardNumber: string): boolean {
    // Validation logic
  }
}

// In Trigger.dev - full type support!
import { PaymentService } from "virtual:triggerkit";

const service = new PaymentService(process.env.STRIPE_KEY);
const result = await service.processPayment({ amount: 100, currency: "USD" });
```

#### Environment Variables

Triggerkit automatically handles SvelteKit environment variables:

```typescript
// SvelteKit code
import { DATABASE_URL } from "$env/static/private";
import { PUBLIC_API_URL } from "$env/static/public";

export async function connectDB() {
  // Uses DATABASE_URL automatically
}

// In Trigger.dev - works seamlessly!
import { connectDB } from "virtual:triggerkit";
await connectDB(); // DATABASE_URL is available via process.env
```

## 🎨 Type-Safe Development

#### Triggerkit generates complete TypeScript declarations:

```typescript
// Generated types preserve everything:
export declare function processUser<T extends User>(
  user: T,
  options: ProcessOptions,
): Promise<ProcessedUser<T>>;

export declare class UserService {
  constructor(apiKey: string);
  getUser(id: string): Promise<User>;
  static validateEmail(email: string): boolean;
}
```

### 🏗️ How It Works

1. **Scans** your SvelteKit project for exported functions and classes
2. **Transforms** SvelteKit environment imports to work with Trigger.dev
3. **Generates** a virtual module with all your exports
4. **Creates** TypeScript declarations for full IDE support
5. **Loads** environment variables automatically during build

### 🚀 Migration Guide

Already have SvelteKit functions? No changes needed! Just:

1. Install Triggerkit
2. Add to your trigger.config.ts
3. Import and use - that's it!

Your existing SvelteKit code works as-is in Trigger.dev.

### 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](Contributing.md)
for details on our code of conduct and the process for submitting pull requests.

### 📄 License

This project is licensed under the MIT License - see the [LICENSE](License.md)
file for details.

**Made with ❤️ for the SvelteKit and Trigger.dev communities**
