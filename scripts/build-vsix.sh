#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

SKIP_INSTALL=false
SKIP_LINT=false
SKIP_TESTS=false
BUNDLE_SERVER=true

show_help() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Build VSIX installation package for vscode-cadmatic extension.

OPTIONS:
    --skip-install        Skip npm install
    --skip-lint           Skip ESLint
    --skip-tests          Skip tests (tests run by default)
    --no-bundle-server    Skip bundling cadmatic-lsp binary
    --help                Show this help message

EXAMPLES:
    $(basename "$0")                  # Full build with tests and bundled server
    $(basename "$0") --skip-tests     # Build without tests
    $(basename "$0") --skip-lint      # Build without linting
    $(basename "$0") --no-bundle-server  # Build without bundling server
EOF
}

for arg in "$@"; do
    case $arg in
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --skip-lint)
            SKIP_LINT=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --no-bundle-server)
            BUNDLE_SERVER=false
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            show_help
            exit 1
            ;;
    esac
done

cd "$PROJECT_DIR"

echo_step() {
    echo -e "\n==> $1"
}

echo_success() {
    echo -e "\033[0;32m✓ $1\033[0m"
}

echo_error() {
    echo -e "\033[0;31m✗ $1\033[0m"
}

check_prerequisites() {
    echo_step "Checking prerequisites..."
    
    if ! command -v node &> /dev/null; then
        echo_error "Node.js is required but not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo_error "npm is required but not installed"
        exit 1
    fi
    
    if ! command -v npx &> /dev/null; then
        echo_error "npx is required but not installed"
        exit 1
    fi
    
    echo_success "Prerequisites OK"
}

install_dependencies() {
    echo_step "Installing dependencies..."
    npm install
    echo_success "Dependencies installed"
}

run_lint() {
    echo_step "Running ESLint..."
    npm run lint
    echo_success "Lint passed"
}

compile() {
    echo_step "Building extension with webpack..."
    npm run vscode:prepublish
    echo_success "Build successful"
}

run_tests() {
    echo_step "Running tests..."
    npm test
    echo_success "Tests passed"
}

bundle_server() {
    echo_step "Bundling cadmatic-lsp server..."
    bash "$SCRIPT_DIR/bundle-server.sh"
    echo_success "Server bundled"
}

package_extension() {
    echo_step "Packaging VSIX..."
    npx vsce package
    echo_success "VSIX package created"
}

main() {
    echo "========================================"
    echo " vscode-cadmatic Build Script"
    echo "========================================"
    
    check_prerequisites
    
    if [ "$SKIP_INSTALL" = false ]; then
        install_dependencies
    else
        echo_step "Skipping npm install"
    fi
    
    if [ "$SKIP_LINT" = false ]; then
        run_lint
    else
        echo_step "Skipping lint"
    fi
    
    compile
    
    if [ "$BUNDLE_SERVER" = true ]; then
        bundle_server
    else
        echo_step "Skipping server bundling"
    fi
    
    if [ "$SKIP_TESTS" = false ]; then
        run_tests
    else
        echo_step "Skipping tests"
    fi
    
    package_extension
    
    echo ""
    echo "========================================"
    echo " Build complete!"
    echo "========================================"
}

main
