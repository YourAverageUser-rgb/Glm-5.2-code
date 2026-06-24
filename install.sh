#!/usr/bin/env bash
# Installs the `ucode` CLI globally on PATH.
# Usage: clone this repo, then from inside it run: ./install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MIN_NODE_MAJOR=18
MIN_NODE_MINOR=17

color() { # color <text> <code>
  if [ -t 1 ]; then printf '\033[%sm%s\033[0m' "$2" "$1"; else printf '%s' "$1"; fi
}
info()  { echo "$(color "$1" 36)"; }
ok()    { echo "$(color "$1" 32)"; }
warn()  { echo "$(color "$1" 33)"; }
err()   { echo "$(color "$1" 31)" >&2; }

if ! command -v node >/dev/null 2>&1; then
  err "Node.js was not found on PATH. Install Node.js >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0 first: https://nodejs.org/"
  exit 1
fi

NODE_VERSION="$(node -v | sed 's/^v//')"
NODE_MAJOR="${NODE_VERSION%%.*}"
NODE_MINOR="$(echo "$NODE_VERSION" | cut -d. -f2)"
if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ] || { [ "$NODE_MAJOR" -eq "$MIN_NODE_MAJOR" ] && [ "$NODE_MINOR" -lt "$MIN_NODE_MINOR" ]; }; then
  err "Node.js ${NODE_VERSION} found, but >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0 is required."
  exit 1
fi
info "Node.js ${NODE_VERSION} OK."

info "Installing dependencies..."
npm install --no-fund --no-audit

LINKED=0
info "Linking the 'ucode' command globally (npm link)..."
if npm link --silent >/tmp/ucode-install-npm-link.log 2>&1; then
  LINKED=1
  ok "Linked via npm link."
else
  warn "npm link failed (likely no permission to write to npm's global prefix):"
  warn "$(tail -n 5 /tmp/ucode-install-npm-link.log || true)"
fi
rm -f /tmp/ucode-install-npm-link.log

if [ "$LINKED" -ne 1 ]; then
  info "Falling back to a user-local install at ~/.local/bin/ucode ..."
  mkdir -p "$HOME/.local/bin"
  ln -sf "$SCRIPT_DIR/bin/ucode.js" "$HOME/.local/bin/ucode"
  chmod +x "$SCRIPT_DIR/bin/ucode.js"
  ok "Linked ~/.local/bin/ucode -> $SCRIPT_DIR/bin/ucode.js"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *)
      warn "~/.local/bin is not on your PATH. Add this to your shell profile (~/.bashrc / ~/.zshrc):"
      warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
      ;;
  esac
fi

if command -v ucode >/dev/null 2>&1; then
  ok "Installed. Try: ucode --help"
else
  warn "Installed, but 'ucode' isn't on PATH yet in this shell. Open a new shell, or run: $SCRIPT_DIR/bin/ucode.js --help"
fi

echo
info "Next: set an API key for your provider, e.g.:"
echo "  export GLM_API_KEY=..."
echo "See .env.example for the full list, or run: ucode providers"
