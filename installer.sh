#!/usr/bin/env bash
set -euo pipefail

# ────────────────────────────────────────────────────────────────
# HexDTL Installer — installs hexdtl CLI as the `hdt` command
# Supports Termux (Android) and standard Linux/macOS environments
# ────────────────────────────────────────────────────────────────

INSTALL_DIR="${INSTALL_DIR:-$HOME/.hexdtl}"
BIN_NAME="hdt"

# ── helpers ────────────────────────────────────────────────────

info()  { printf "\033[36m · \033[0m%s\n" "$*"; }
ok()    { printf "\033[32m ✓ \033[0m%s\n" "$*"; }
warn()  { printf "\033[33m ! \033[0m%s\n" "$*" >&2; }
fail()  { printf "\033[31m ✗ \033[0m%s\n" "$*" >&2; exit 1; }

detect_os() {
  if [[ -n "${TERMUX_VERSION-}" || "$(uname -o 2>/dev/null)" == "Android" ]]; then
    echo "termux"
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    echo "macos"
  elif [[ "$(uname -s)" == "Linux" ]]; then
    echo "linux"
  else
    echo "unknown"
  fi
}

install_node() {
  local os=$1
  if command -v node &>/dev/null; then
    local ver
    ver=$(node -v | sed 's/v//;s/\..*//')
    if [[ "$ver" -ge 18 ]]; then
      ok "Node.js $(node -v) detected"
      return 0
    fi
    warn "Node.js $(node -v) is too old, need >= 18"
  fi

  info "Installing Node.js..."
  case "$os" in
    termux)
      pkg update -y && pkg install -y nodejs
      ;;
    linux)
      if command -v apt &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt install -y nodejs
      elif command -v dnf &>/dev/null; then
        dnf install -y nodejs
      elif command -v pacman &>/dev/null; then
        pacman -S --noconfirm nodejs npm
      else
        fail "No known package manager found. Install Node.js >= 18 manually."
      fi
      ;;
    macos)
      if command -v brew &>/dev/null; then
        brew install node
      else
        fail "Homebrew not found. Install Node.js >= 18 manually from https://nodejs.org"
      fi
      ;;
    *)
      fail "Unsupported OS: $os"
      ;;
  esac
  command -v node &>/dev/null || fail "Node.js installation failed"
  ok "Node.js $(node -v) installed"
}

install_hexdtl() {
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  local src_dir
  src_dir="$(cd "$(dirname "$0")" && pwd)"

  info "Copying HexDTL from $src_dir to $INSTALL_DIR..."
  cp -a "$src_dir/." "$INSTALL_DIR/"
  chmod -R u+w "$INSTALL_DIR"

  # Drop explicit @rolldown/binding-* deps from the root package.json —
  # rolldown itself declares these as optionalDependencies and npm will
  # install whichever binding matches the host CPU/OS. The explicit dep
  # in our package.json pins a single platform (x64-gnu) and blocks
  # install on ARM, Termux, musl, etc.
  if [[ "$(uname -m)" != "x86_64" ]]; then
    info "Removing platform-specific rolldown binding (not needed on $(uname -m))..."
    local pkg="$INSTALL_DIR/package.json"
    sed -i '/"@rolldown\/binding-/d' "$pkg"
  fi

  info "Installing npm dependencies..."
  cd "$INSTALL_DIR"
  npm install 2>&1 | tail -5
  ok "Dependencies installed"
}

install_bin() {
  local os=$1
  local bin_path

  case "$os" in
    termux)
      bin_path="$PREFIX/bin/$BIN_NAME"
      rm -f "$bin_path"
      cat > "$bin_path" <<-WRAPPER
#!/data/data/com.termux/files/usr/bin/env bash
exec node "$INSTALL_DIR/packages/cli/bin/hexdtl.js" "\$@"
WRAPPER
      chmod +x "$bin_path"
      ok "Installed to $bin_path"
      ;;
    *)
      if [[ -d /usr/local/bin && -w /usr/local/bin ]]; then
        bin_path="/usr/local/bin/$BIN_NAME"
        rm -f "$bin_path"
        ln -sf "$INSTALL_DIR/packages/cli/bin/hexdtl.js" "$bin_path"
        ok "Symlinked to $bin_path"
      else
        mkdir -p "$HOME/.local/bin"
        bin_path="$HOME/.local/bin/$BIN_NAME"
        cat > "$bin_path" <<-WRAPPER
#!/usr/bin/env bash
exec node "$INSTALL_DIR/packages/cli/bin/hexdtl.js" "\$@"
WRAPPER
        chmod +x "$bin_path"
        ok "Installed to $bin_path"
        if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
          warn "\$HOME/.local/bin is not in PATH. Add this to your ~/.bashrc / ~/.zshrc:"
          echo '  export PATH="$HOME/.local/bin:$PATH"'
        fi
      fi
      ;;
  esac
}

bin_is_in_path() {
  command -v "$BIN_NAME" &>/dev/null
}

# ── main ───────────────────────────────────────────────────────

printf "\n\033[1m  HexDTL Installer\033[0m\n\n"

OS=$(detect_os)
info "Detected OS: $OS"

# pre-flight
case "$OS" in
  termux)
    info "Termux detected — using local install strategy"
    if [[ ! -d "$PREFIX/bin" ]]; then
      fail "\$PREFIX/bin not found. Is this really Termux?"
    fi
    ;;
  macos|linux) ;;
  *)
    warn "Unknown OS — proceeding with standard Linux install"
    ;;
esac

# 1. Node.js
install_node "$OS"

# 2. Copy the repo to install dir
install_hexdtl

# 3. Install the hdt bin
install_bin "$OS"

# 4. Verify
if bin_is_in_path; then
  printf "\n\033[32m  ✔ Installation complete.\033[0m\n"
  printf "    Run \033[1m%s\033[0m anywhere:\n" "$BIN_NAME"
  printf "      \033[1m%s inspect my-script.js\033[0m\n" "$BIN_NAME"
  printf "      \033[1m%s beautify minified.js -o readable.js\033[0m\n" "$BIN_NAME"
  printf "      \033[1m%s decrypt encrypted.js\033[0m\n" "$BIN_NAME"
  printf "      \033[1m%s --help\033[0m\n" "$BIN_NAME"
else
  warn "'$BIN_NAME' not found in PATH. Restart your terminal or source your shell rc file."
  printf "  Then run: \033[1m%s --help\033[0m\n" "$BIN_NAME"
fi
echo
