# CADMATIC LSP Specification

This document defines end-user editor behavior for CADMATIC LSP.

`metadata` in this document means symbol/keyword entries loaded from `keywords.json` (not parsed declarations from currently opened or included source files).

## Language Semantics (User-visible)

- Symbol names are case-sensitive for semantic features.
- Local declarations are function-scoped (inner blocks do not create separate declaration scopes).
- A conflict means the same-case identifier is declared in incompatible categories (`extern` function, function, `#define`, global variable, local declaration), regardless of whether declarations come from local file or included files.
- Shared namespace is strict: `extern` function names, function names, `#define` names, global variable names, and local declaration names conflict on same name.
- `local declaration` includes function parameters and local variable declarations.
- Same local/parameter names in different functions are allowed.
- Shadowing is not allowed within a function scope or across shared-namespace declarations.
- Assignment to an already-declared global variable is valid usage.
- Assignments to identifiers declared as `extern` function, function, or `#define` are invalid.

## Signature Help

- Trigger automatically on `(`.
- Retrigger and update active parameter on `,`.
- Nested calls are supported; innermost call context wins.
- Manual trigger is supported (for example `Ctrl+Shift+Space`).

## Completion

- Completion search is case-insensitive.
- Suggestions are deterministic and alphabetically ordered.
- Conflicted names are suppressed and not shown (they do not appear with a warning marker in completion entries).
- Entries may include origins such as parsed symbol (from source/include declarations) or global callable (from metadata).
- Parsed symbols come from parsed source/include declarations.
- Metadata (`keywords.json`) is used only for hover documentation and is not a source for completion candidates.
- Filtering/ranking behavior after candidates are returned is client-dependent.

## Hover

- Hover shows symbol information including kind and origin (local/include/metadata when applicable).
- Keyword metadata hover is rendered as Markdown and can include description, syntax, parameters, return type, and return values.
- Conflicted names return no hover result.

## Definition, References, and Rename

- Semantic matching is case-sensitive.
- Include-origin symbols resolve to declaration targets in included files when valid.
- Conflicted names are suppressed for symbol features:
  - definition returns no target
  - references return no ranges
  - `prepareRename` returns no range
  - rename returns no edits
- Invalid assignment LHS occurrences are suppressed for symbol features at that exact cursor occurrence only (not globally for all usages of the same symbol).
- When `prepareRename` returns no range, client behavior is editor-dependent (typically "rename unavailable" for that symbol).

## Include Resolution

- Include resolution order is strict:
  1. `PMS_RUNDIR/<path>`
  2. `PMS_HOME/<path>`
  3. absolute `<path>`
- If `PMS_RUNDIR` or `PMS_HOME` is unset or invalid, that lookup step is skipped.
- If the same literal is resolvable from both `PMS_RUNDIR` and `PMS_HOME`, first match wins (`PMS_RUNDIR`), with no extra conflict diagnostic.
- No fallback to current file directory or include roots.
- Include expansion is direct-only (depth-1) in current behavior.
- In depth-1 mode, includes inside included files are ignored (no extra transitive-include diagnostic is emitted for that alone).
- Self-include has no dedicated diagnostic; depth-1 behavior prevents recursive include expansion.
- Include literal parsing accepts both quoted and unquoted forms.
- Include path separators are normalized (`\` and `/` are both accepted forms).
- `PMS_RUNDIR`/`PMS_HOME` are treated as fixed for the CAD runtime context used in a session.
- LSP captures include env configuration at session initialization; CLI captures it at command start.

## Diagnostics

- Syntax diagnostics are reported from parser errors.
- Semantic diagnostics are reported after symbol/include analysis of current document state.
- Unresolved includes produce diagnostics.
- Duplicate/conflicting declarations produce error diagnostics.
- Invalid assignment targets (assigning to extern/function/define) produce diagnostics.
- Use-before-set diagnostics are enabled by default.
- Conflict diagnostics can be disabled by setting `CADMATIC_LSP_NO_STRICT_DIAGNOSTICS=1` (also accepts `true` or `on`).
- Semantic diagnostics are best-effort and continue even when syntax diagnostics are present.
- There is no dedicated unused-include diagnostic in current behavior.

## Troubleshooting

- Confirm editor language mode is CADMATIC.
- Check parser diagnostics first.
- Verify include paths resolve under current environment/options.
- Verify the symbol is available in active scope.
- If symbol features return nothing, check for conflict diagnostics on that name.

## Code References

- Include resolution: `cadmatic-core/src/include.rs`
- Symbol indexing/conflicts: `cadmatic-core/src/index.rs`
- Semantic analysis: `cadmatic-core/src/analyze.rs`
- Diagnostics mapping: `cadmatic-core/src/diagnose.rs`
- Metadata/keywords.json: `cadmatic-core/src/metadata.rs`
- Tree-sitter utilities: `cadmatic-core/src/ts_utils.rs`
- LSP request handling/session: `cadmatic-lsp/src/lib.rs`
- CLI check/lsp commands: `cadmatic-cli/src/main.rs`
