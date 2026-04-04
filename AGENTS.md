# Agent Guide (vscode-cadmatic)

## Project Overview

VSCode extension for CADMATIC language server and syntax highlighting.

- **Language**: TypeScript (strict mode)
- **Syntax Highlighting**: Tree-sitter (NOT TextMate)
- **LSP Integration**: Communicates with `../cadmatic-lsp` via stdio
- **Grammar**: `../tree-sitter-cadmatic` (tree-sitter queries already exist)
- **Source of Truth**: `LSP.md` for language semantics and editor behavior

## Related Projects

- LSP implementation: `../cadmatic-lsp`
- Tree-sitter grammar: `../tree-sitter-cadmatic`

## Build and Test Commands

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Build extension package (.vsix)
vsce package

# Run linter
npm run lint

# Run tests
npm test

# Run single test (use --grep for specific test name)
npm test -- --grep "completion"

# Development - press F5 to debug extension in new window
```

## VSCode Extension Development

- Use `F5` to launch extension in debug mode
- Check `package.json` for contributed commands, languages, and activation events
- Extension entry point: `src/extension.ts`
- Use `vscode.TreeSitter` API for syntax highlighting (VSCode 1.77+)

## Code Style (TypeScript)

### General Principles

- Prefer idiomatic TypeScript: functional patterns, `map`, `filter`, `reduce`
- Keep code simple; avoid over-abstraction
- Use `const` by default, `let` only when reassignment needed
- Avoid `any` - use proper types or `unknown`
- Keep imports minimal and organized (see below)

### Imports Organization

Order import groups with blank lines: (1) Node.js built-ins, (2) External packages, (3) Local relative imports.

### Error Handling

- Use try/catch with typed errors
- Avoid bare `unwrap()` in runtime paths
- `expect()` only for programmer errors with clear messages
- Log errors with context before rethrowing

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Types/Interfaces | PascalCase | `CadmaticSymbol`, `CompletionItem` |
| Functions/Variables | camelCase | `resolveSymbol`, `getCompletions` |
| Constants | UPPER_SNAKE_CASE | `MAX_LINE_LENGTH`, `DEFAULT_TIMEOUT` |
| Files | kebab-case | `cadmatic-config.ts`, `language-client.ts` |
| Enums | PascalCase | `SymbolKind`, `DiagnosticSeverity` |
| Enum Values | PascalCase | `SymbolKind.Function` |

## TypeScript Configuration

Ensure `tsconfig.json` uses strict mode:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

## Tree-sitter Integration

- Highlight queries: `../tree-sitter-cadmatic/queries/highlights.scm`
- Use `vscode.TreeSitter` API (VSCode 1.77+)

## LSP Communication

Communicate with `../cadmatic-lsp` via stdio subprocess:

```typescript
const serverOptions: ServerOptions = () => {
    const process = spawn('cadmatic-lsp', ['--stdio'], {
        env: { ...process.env, PMS_RUNDIR: workspacePath }
    });
    return { process, reader: process.stdout, writer: process.stdin };
};
```

## Quality Control

Run before submitting changes:

```bash
# Lint
npm run lint

# Type check
npm run compile

# Tests
npm test
```

## Testing Expectations

- Every feature change should include/update tests
- Use VSCode test runner pattern in `src/test/`
- Prefer unit tests for logic, integration tests for LSP communication
- Test file naming: `*.test.ts` or `*.spec.ts`

## Language Semantics Reference

See `LSP.md` for authoritative behavior:

- Symbol name case-sensitivity
- Local declaration scoping (function-scoped, not block-scoped)
- Conflict detection (extern, function, #define, global, local)
- Include resolution order (PMS_RUNDIR, PMS_HOME, absolute)
- Completion/hover/definition behavior

## Logging

- Keep logs concise and useful for debugging
- Use structured logging with appropriate log levels
- Avoid console.log in production code - use extension's logger

## Review Expectations

- Assume reviewer may not be familiar with LSP protocol internals
- Write clear, explainable code
- Include comments for complex logic or non-obvious decisions
