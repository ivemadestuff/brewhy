# Contributing

- Use Node.js 22 (`nvm use`) and install dependencies with `npm ci`.
- Keep changes focused and preserve Brewhy’s read-only behavior.
- Before opening a pull request, run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` and `npm run build`.
- Test with data in `tests/fixtures/`, without querying a real Homebrew installation. For intentional output changes, run `npm run test:update` and review the snapshot diff.
- Use English [Conventional Commits](https://www.conventionalcommits.org) titles for commits and pull requests. Releases are automated from `master`.
