# Development

Built with `TypeScript` and `Node.js` — see [`package.json`](../../package.json) for the full list of dependencies.

## Prerequisites

- `Git` and `Node.js 22.14+ (22.x)` with `npm`.
- `macOS` with `Homebrew` to run the CLI against your installed packages.

## Local Development

```bash
git clone https://github.com/ivemadestuff/brewhy.git && cd brewhy
```

If you use `nvm`, run `nvm install` and `nvm use` after cloning to select the version in [`.nvmrc`](../../.nvmrc).

Build and run locally; rebuild after changing code.

The local build reads your Homebrew installation and does not add a global `brewhy` command.

```bash
# Install Dependencies
npm ci

# Build
npm run build

# Run Locally
node dist/cli.js
```

## Checks

Run these checks before opening a pull request.

CI runs lint, formatting checks, typecheck, tests and build using the Node.js version in `.nvmrc`; check other supported Node.js versions locally when changing runtime compatibility.

```bash
# Lint
npm run lint

# Format
npm run format

# Check Formatting
npm run format:check

# Typecheck
npm run typecheck

# Test
npm test
```

Tests use `tests/fixtures/` instead of querying a real Homebrew installation; for intentional output changes, run `npm run test:update` and review the snapshot diff.

## Installer

The installer is separate from the local development setup: [`scripts/install.sh`](../../scripts/install.sh) downloads and builds the latest stable release without `sudo`.

- Release files are stored in `~/.local/share/brewhy`.
- The `brewhy` command is linked in `~/.local/bin`.
- For `zsh` and `bash`, the installer adds that directory to `PATH` if needed; other shells need manual setup.

## Further Reading

See [Contributing](../CONTRIBUTING.md) for contribution guidelines and [Security Policy](../SECURITY.md) for reporting vulnerabilities.
