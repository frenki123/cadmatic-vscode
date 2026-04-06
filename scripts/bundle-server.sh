#!/usr/bin/env bash

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

echo_warning() {
    echo -e "\033[0;33m⚠ $1\033[0m"
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
    local source_size
    local dest_size

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
    
    echo "  Source: $source_path"
    source_size=$(stat -c%s "$source_path" 2>/dev/null || stat -f%z "$source_path" 2>/dev/null)
    echo "  Source size: $source_size bytes"
    
    mkdir -p "$dest_dir"
    
    if [ -f "$dest_path" ]; then
        echo "  Removing existing binary..."
        rm -f "$dest_path" || echo_warning "  Could not remove existing binary (may be in use)"
    fi
    
    cp "$source_path" "$dest_path" || {
        echo_warning "  Copy failed - binary may be in use by VS Code"
        echo_warning "  The bundled binary will be updated when VS Code is restarted"
    }
    
    if [ "$platform" != "win32-x64" ]; then
        chmod +x "$dest_path" 2>/dev/null || true
    fi
    
    if [ -f "$dest_path" ]; then
        dest_size=$(stat -c%s "$dest_path" 2>/dev/null || stat -f%z "$dest_path" 2>/dev/null)
        echo "  Bundled size: $dest_size bytes"
        
        if [ "$source_size" = "$dest_size" ]; then
            echo_success "Bundled server to bin/$platform/$exe_name"
        else
            echo_warning "Size mismatch - binary may not be fully copied"
            echo_warning "  Expected: $source_size bytes, Got: $dest_size bytes"
        fi
    else
        echo_error "Bundling failed - binary not created"
        exit 1
    fi
}

bundle_server
