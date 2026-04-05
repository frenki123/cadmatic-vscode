#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo_step() {
    echo -e "\n==> $1"
}

echo_success() {
    echo -e "\033[0;32m✓ $1\033[0m"
}

echo_error() {
    echo -e "\033[0;31m✗ $1\033[0m"
}

detect_platform() {
    case "$(uname -s)" in
        Linux*)     echo "linux-x64" ;;
        MINGW*|MSYS*|CYGWIN*)  echo "win32-x64" ;;
        *)          echo_error "Unsupported platform: $(uname -s)"; exit 1 ;;
    esac
}

get_exe_name() {
    case "$1" in
        win32-x64)  echo "cadmatic-analyze.exe" ;;
        *)          echo "cadmatic-analyze" ;;
    esac
}

bundle_server() {
    local platform
    local exe_name
    local source_path
    local dest_dir
    local dest_path

    echo_step "Bundling CADMATIC LSP server..."
    
    platform=$(detect_platform)
    exe_name=$(get_exe_name "$platform")
    source_path="$PROJECT_DIR/../cadmatic-analyze/target/release/$exe_name"
    dest_dir="$PROJECT_DIR/bin/$platform"
    dest_path="$dest_dir/$exe_name"
    
    if [ ! -f "$source_path" ]; then
        echo_error "CADMATIC LSP binary not found at:"
        echo_error "  $source_path"
        echo ""
        echo "Please compile cadmatic-analyze first:"
        echo "  cd ../cadmatic-analyze && cargo build --release"
        exit 1
    fi
    
    mkdir -p "$dest_dir"
    cp "$source_path" "$dest_path"
    
    if [ "$platform" != "win32-x64" ]; then
        chmod +x "$dest_path"
    fi
    
    echo_success "Bundled server to bin/$platform/$exe_name"
}

bundle_server
