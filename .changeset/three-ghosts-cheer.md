---
'triggerkit': patch
---

Fix type definition generation to include exported classes

Previously, the type definition file generator only included functions in the
generated `virtual-triggerkit.d.ts` file. This caused TypeScript errors when
importing exported classes like `AuthService` from `virtual:triggerkit`.

This patch updates `generateFunctionTypeDeclarations` to use
`extractExportedItems` instead of `extractFunctionSignatures`, ensuring that all
exported items (functions, classes, and constants) are properly included in the
generated type definitions with their full type information, including class
methods and properties.
