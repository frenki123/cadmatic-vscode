#!/usr/bin/env pwsh
param(
    [switch]$SkipInstall,
    [switch]$SkipLint,
    [switch]$SkipTests,
    [switch]$NoBundleServer,
    [switch]$Help
)

$ScriptDir = Split-Path -Parent $PSCommandPath
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

function Write-Warning {
    param([string]$Message)
    Write-Host -ForegroundColor Yellow "WARN $Message"
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
    Write-Step "Building extension with webpack..."
    npm run vscode:prepublish
    Write-Success "Build successful"
}

function Invoke-Tests {
    Write-Step "Running tests..."
    npm test
    Write-Success "Tests passed"
}

function Get-Platform {
    if ($IsWindows) {
        $platform = "win32"
    } elseif ($IsMacOS) {
        $platform = "darwin"
    } else {
        $platform = "linux"
    }
    
    $arch = if ($IsArm) { "arm64" } else { "x64" }
    
    switch ($platform) {
        "win32" { return "win32-x64" }
        "darwin" { return if ($arch -eq "arm64") { "darwin-arm64" } else { "darwin-x64" } }
        default { return "linux-x64" }
    }
}

function Get-ExeName {
    param([string]$Platform)
    if ($Platform -eq "win32-x64") {
        return "cadmatic-analyze.exe"
    }
    return "cadmatic-analyze"
}

function Invoke-BundleServer {
    Write-Step "Bundling cadmatic-lsp server..."
    
    $platform = Get-Platform
    $exeName = Get-ExeName -Platform $platform
    $sourceDir = Join-Path (Split-Path -Parent $ProjectDir) "cadmatic-analyze" "target" "release"
    $sourcePath = Join-Path $sourceDir $exeName
    $destDir = Join-Path $ProjectDir "bin" $platform
    $destPath = Join-Path $destDir $exeName
    
    if (-not (Test-Path $sourcePath)) {
        Write-Error-Message "CADMATIC LSP binary not found at:"
        Write-Error-Message "  $sourcePath"
        Write-Host ""
        Write-Host "Please compile cadmatic-analyze first:"
        Write-Host "  cd ..\cadmatic-analyze; cargo build --release"
        exit 1
    }
    
    $sourceSize = (Get-Item $sourcePath).Length
    Write-Host "  Source: $sourcePath"
    Write-Host "  Source size: $sourceSize bytes"
    
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    
    if (Test-Path $destPath) {
        Write-Host "  Removing existing binary..."
        try {
            Remove-Item $destPath -Force -ErrorAction Stop
        } catch {
            Write-Warning "  Could not remove existing binary (may be in use)"
        }
    }
    
    try {
        Copy-Item $sourcePath -Destination $destPath -Force -ErrorAction Stop
    } catch {
        Write-Warning "  Copy failed - binary may be in use by VS Code"
        Write-Warning "  The bundled binary will be updated when VS Code is restarted"
    }
    
    if (Test-Path $destPath) {
        $destSize = (Get-Item $destPath).Length
        Write-Host "  Bundled size: $destSize bytes"
        
        if ($sourceSize -eq $destSize) {
            Write-Success "Bundled server to bin\$platform\$exeName"
        } else {
            Write-Warning "Size mismatch - binary may not be fully copied"
            Write-Warning "  Expected: $sourceSize bytes, Got: $destSize bytes"
        }
    } else {
        Write-Error-Message "Bundling failed - binary not created"
        exit 1
    }
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
