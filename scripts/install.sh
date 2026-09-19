#!/bin/bash
set -euo pipefail

work_dir=""
install_stage=""
lock_dir=""

fail() {
  printf 'brewhy: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  [[ -z "$work_dir" ]] || rm -rf -- "$work_dir"
  [[ -z "$install_stage" ]] || rm -rf -- "$install_stage"
  [[ -z "$lock_dir" ]] || rmdir -- "$lock_dir"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

download() {
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --fail --silent --show-error --location --retry 2 \
    --connect-timeout 15 --max-time 300 --output "$2" "$1"
}

configure_path() {
  local shell_name="${SHELL:-}" config="" candidate="" path_line='export PATH="$HOME/.local/bin:$PATH"'
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) return ;;
  esac
  case "${shell_name##*/}" in
    zsh) config="${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash)
      config="$HOME/.bash_profile"
      for candidate in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
        if [[ -f "$candidate" ]]; then
          config="$candidate"
          break
        fi
      done
      ;;
  esac
  if [[ -n "$config" ]]; then
    if [[ -f "$config" ]] && grep -Fqx "$path_line" "$config"; then
      printf 'Open a new terminal to use brewhy.\n'
      return
    fi
    if (printf '\n%s\n' "$path_line" >> "$config"); then
      printf 'Added ~/.local/bin to PATH in %s. Open a new terminal to use brewhy.\n' "$config"
      return
    fi
  fi
  printf 'Add ~/.local/bin to your shell configuration for PATH. You can also run %s/.local/bin/brewhy directly.\n' "$HOME"
}

uninstall() {
  local root="$HOME/.local/share/brewhy" bin="$HOME/.local/bin/brewhy"
  if [[ -e "$root" || -L "$root" ]]; then
    [[ -d "$root" && ! -L "$root" && -f "$root/.installer-managed" && ! -L "$root/.installer-managed" ]] \
      || fail "Refusing to remove an unmanaged directory: $root"
    if ! mkdir "$root/.install-lock" 2>/dev/null; then
      fail "Another installation may be running. If it was interrupted, remove $root/.install-lock and retry."
    fi
    lock_dir="$root/.install-lock"
  fi

  if [[ -L "$bin" && "$(readlink "$bin")" == "$root/current/dist/cli.js" ]]; then
    rm -- "$bin"
  elif [[ -e "$bin" || -L "$bin" ]]; then
    printf 'Preserved unrelated command: %s\n' "$bin"
  fi
  if [[ -n "$lock_dir" ]]; then
    rm -rf -- "$root"
    lock_dir=""
  fi
  printf 'Brewhy installer files removed. Shared ~/.local/bin and shell configuration were preserved.\n'
}

main() {
  [[ $# -le 1 ]] || fail 'Expected at most one option. Use --help for usage.'
  case "${1:-}" in
    --help|-h)
      printf 'Usage: install.sh [--uninstall | --help]\n\nWithout options, install or update to the latest release.\n--uninstall  Remove installer-managed Brewhy files; preserve shared PATH configuration.\n'
      return
      ;;
    ''|--uninstall) ;;
    *) fail "Unknown option: $1. Use --help for usage." ;;
  esac
  [[ "$(uname -s)" == Darwin ]] || fail 'This installer supports macOS only.'
  [[ "$HOME" == /* && "$HOME" != / ]] || fail 'HOME must be an absolute user directory.'
  [[ "$EUID" -ne 0 ]] || fail 'Run this installer as your user, without sudo.'
  if [[ "${1:-}" == --uninstall ]]; then
    uninstall
    return
  fi
  local command
  for command in node npm brew curl tar; do
    command -v "$command" >/dev/null 2>&1 || fail "Required command not found: $command. Install it first."
  done
  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit((major === 22 && minor >= 14) || (major === 24 && minor >= 10) || major > 24 ? 0 : 1);
  ' || fail 'Building requires Node.js 22.14+ (22.x) or 24.10+.'

  local root="$HOME/.local/share/brewhy" bin="$HOME/.local/bin/brewhy"
  if [[ -e "$root" || -L "$root" ]]; then
    [[ ! -L "$root" && -f "$root/.installer-managed" ]] || fail "Refusing to replace an unmanaged directory: $root"
  fi
  if [[ -e "$bin" || -L "$bin" ]]; then
    [[ -L "$bin" && "$(readlink "$bin")" == "$root/current/dist/cli.js" ]] || fail "Another brewhy command already exists at $bin. Move it before installing."
  fi
  if [[ -e "$root/current" || -L "$root/current" ]]; then
    [[ -L "$root/current" ]] || fail "Refusing to replace $root/current: expected an installer symlink."
  fi

  work_dir=$(mktemp -d "${TMPDIR:-/tmp}/brewhy.XXXXXX")
  download 'https://api.github.com/repos/ivemadestuff/brewhy/releases/latest' "$work_dir/release.json" \
    || fail 'Could not fetch the latest release. A published GitHub Release and an internet connection are required.'
  local tag version_dir
  tag=$(node -e '
    const release = require(process.argv[1]);
    if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) process.exit(1);
    process.stdout.write(release.tag_name);
  ' "$work_dir/release.json") || fail 'GitHub did not return a valid stable release.'
  version_dir="$root/$tag"

  mkdir -p "$root" "$HOME/.local/bin"
  if ! mkdir "$root/.install-lock" 2>/dev/null; then
    fail "Another installation may be running. If it was interrupted, remove $root/.install-lock and retry."
  fi
  lock_dir="$root/.install-lock"
  touch "$root/.installer-managed"
  install_stage=$(mktemp -d "$root/.staging.XXXXXX")

  if [[ ! -d "$version_dir" ]]; then
    printf 'Downloading and building Brewhy %s...\n' "$tag"
    download "https://github.com/ivemadestuff/brewhy/archive/refs/tags/$tag.tar.gz" "$work_dir/source.tar.gz"
    mkdir "$work_dir/source"
    tar -xzf "$work_dir/source.tar.gz" -C "$work_dir/source" --strip-components=1
    node -e '
      const pkg = require(process.argv[1]);
      if (pkg.name !== "brewhy" || pkg.version !== process.argv[2]) process.exit(1);
    ' "$work_dir/source/package.json" "${tag#v}" || fail 'Release archive does not match its version tag.'
    (
      cd "$work_dir/source"
      npm ci --include=dev --ignore-scripts --no-audit --no-fund </dev/null
      npm run build --ignore-scripts </dev/null
    )
    mkdir "$install_stage/package"
    cp -R "$work_dir/source/dist" "$install_stage/package/dist"
    cp "$work_dir/source/package.json" "$work_dir/source/LICENSE" "$install_stage/package/"
    chmod +x "$install_stage/package/dist/cli.js"
    [[ "$(node "$install_stage/package/dist/cli.js" --version)" == "${tag#v}" ]] || fail 'Built CLI failed version verification.'
    mv "$install_stage/package" "$version_dir"
  fi
  [[ "$(node "$version_dir/dist/cli.js" --version)" == "${tag#v}" ]] || fail "Installed release is damaged: $version_dir"
  node -e '
    const fs = require("node:fs");
    fs.symlinkSync(process.argv[1], process.argv[2]);
    fs.renameSync(process.argv[2], process.argv[3]);
  ' "$version_dir" "$install_stage/current" "$root/current"
  if [[ ! -L "$bin" ]]; then
    ln -s "$root/current/dist/cli.js" "$bin"
  fi

  printf 'Installed Brewhy %s.\n' "$tag"
  configure_path
  printf 'Run: brewhy --help\n'
}

main "$@"
