# CADMATIC Language Support

VSCode extension for CADMATIC language server with syntax highlighting and semantic tokens.

## Features

- **Syntax Highlighting**: Tree-sitter based highlighting with Catppuccin themes
- **Language Server**: LSP integration with full CADMATIC support
- **Project Management**: Global and local project profiles with environment variables
- **4 Color Themes**: Catppuccin Mocha, Macchiato, Frappé, and Latte

## Installation

Install from VSIX:
```bash
code --install-extension vscode-cadmatic-0.0.1.vsix
```

## Commands

| Command | Description |
|---------|-------------|
| `CADMATIC: Add Project` | Add new project profile |
| `CADMATIC: Delete Project` | Delete a project profile |
| `CADMATIC: List Projects` | List all configured projects |
| `CADMATIC: Switch Project` | Switch between projects |
| `CADMATIC: Add Environment Variable` | Add custom env var to active project |
| `CADMATIC: Delete Environment Variable` | Remove env var from active project |
| `CADMATIC: Restart LSP` | Restart language server |

## Project Configuration

Projects can be stored globally (shared across workspaces) or locally (per workspace).

### Add Project Flow

1. Run `CADMATIC: Add Project`
2. Enter project name
3. Enter PMS_RUNDIR, PMS_HOME, PMS_CONFDIR, PMS_LANG (optional)
4. Choose Global or Local storage

### Environment Variables

Add custom environment variables to projects:
- Run `CADMATIC: Add Environment Variable`
- Enter variable name and value

## Color Themes

Choose from 4 Catppuccin themes:
- Cadmatic Catppuccin Mocha (default, dark)
- Cadmatic Catppuccin Macchiato (dark)
- Cadmatic Catppuccin Frappé (dark)
- Cadmatic Catppuccin Latte (light)

## Requirements

- VSCode 1.77.0 or higher
- CADMATIC LSP binary (bundled with extension)

## Build

```bash
# Build VSIX
./scripts/build-vsix.sh

# Or with PowerShell
.\scripts\build-vsix.ps1
```