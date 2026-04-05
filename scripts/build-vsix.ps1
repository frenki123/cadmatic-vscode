#!/usr/bin/env pwsh
param(
    [switch]$SkipInstall,
    [switch]$SkipLint,
    [switch]$SkipTests,
    [switch]$NoBundleServer,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

function Show-Help {
    @"
Usage: .\build-vsix.ps1 [OPTIONS]

Build VSIX installation package for vscode-cadmatic extension.

OPTIONS:
    -SkipInstall       Skip npm install
    -SkipLint         Skip ESLint
    -SkipTests        Skip tests (tests run by default)
    -NoBundleServer   Skip bundling cadmatic-lsp binary
    -Help             Show this help message

EXAMPLES:
    .\build-vsix.ps1                  Full build with tests and bundled server
    .\build-vsix.ps1 -SkipTests        Build without tests
    .\build-vsix.ps1 -SkipLint        Build without linting
    .\build-vsix.ps1 -NoBundleServer  Build without bundling server
"@
}

if ($Help) {
    Show-Help
    exit 0
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message"
}

function Write-Success {
    param([string]$Message)
    Write-Host -ForegroundColor Green "OK $Message"
}

function Write-Error-Message {
    param([string]$Message)
    Write-Host -ForegroundColor Red "FAIL $Message"
}

function Test-Prerequisites {
    Write-Step "Checking prerequisites..."
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error-Message "Node.js is required but not installed"
        exit 1
    }
    
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Error-Message "npm is required but not installed"
        exit 1
    }
    
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        Write-Error-Message "npx is required but not installed"
        exit 1
    }
    
    Write-Success "Prerequisites OK"
}

function Install-Dependencies {
    Write-Step "Installing dependencies..."
    npm install
    Write-Success "Dependencies installed"
}

function Invoke-Lint {
    Write-Step "Running ESLint..."
    npm run lint
    Write-Success "Lint passed"
}

function Invoke-Compile {
    Write-Step "Compiling TypeScript..."
    npm run compile
    Write-Success "Compilation successful"
}

function Invoke-Tests {
    Write-Step "Running tests..."
    npm test
    Write-Success "Tests passed"
}

function Invoke-BundleServer {
    Write-Step "Bundling cadmatic-lsp server..."
    & "$ScriptDir\bundle-server.sh"
    Write-Success "Server bundled"
}

function New-VsixPackage {
    Write-Step "Packaging VSIX..."
    npx vsce package
    Write-Success "VSIX package created"
}

function Main {
    Write-Host "========================================"
    Write-Host " vscode-cadmatic Build Script"
    Write-Host "========================================"
    
    Push-Location $ProjectDir
    
    try {
        Test-Prerequisites
        
        if (-not $SkipInstall) {
            Install-Dependencies
        } else {
            Write-Step "Skipping npm install"
        }
        
        if (-not $SkipLint) {
            Invoke-Lint
        } else {
            Write-Step "Skipping lint"
        }
        
        Invoke-Compile
        
        if (-not $NoBundleServer) {
            Invoke-BundleServer
        } else {
            Write-Step "Skipping server bundling"
        }
        
        if (-not $SkipTests) {
            Invoke-Tests
        } else {
            Write-Step "Skipping tests"
        }
        
        New-VsixPackage
        
        Write-Host ""
        Write-Host "========================================"
        Write-Host " Build complete!"
        Write-Host "========================================"
    }
    finally {
        Pop-Location
    }
}

Main
