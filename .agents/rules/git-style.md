# Git Style

Rules for AI agents handling branches, commits and pull requests.

## Branching Model

Follow the project's documented branching model; use **GitHub Flow** when none is specified.

- Identify the default branch from repository settings or the remote's `HEAD`; never assume its name.
- Never commit directly to the default branch.
- Branch off the latest default branch and open a pull request (PR) back into it.
- One branch per task, kept short-lived.
- Never reuse a merged branch; create a new one.
- Name branches `<type>/<short-kebab>` in lowercase English, using the commit types below.

Examples:

```
feat/add-login-screen
fix/null-token-crash
docs/update-readme
perf/cache-user-queries
```

## Branching Scope

- Keep one task per branch: code, tests, docs and config for the current task all go on the same branch.
- Do not open extra branches by yourself; if unrelated work appears, ask first and suggest a name like `fix/<short-kebab>`.

## Commits

- Stage files or create commits only on an explicit execution request; a commit-message request does not authorize either.

Use **Conventional Commits**:

```
<type>: <lowercase description>
```

- **No scope**: never write `feat(auth): ...`.
- **Lowercase English** for ordinary prose; preserve the original case of proper names, acronyms and code identifiers.
- **Backticks for important keywords**, e.g. `` fix: handle `null` token in `AuthService` ``.
- **No body** unless it truly needs clarification.
- Title at most 64 characters.
- Separate body from subject with one blank line.

Allowed types:

| Type       | Use for                         |
| ---------- | ------------------------------- |
| `feat`     | a new feature                   |
| `fix`      | a bug fix                       |
| `docs`     | documentation only              |
| `style`    | formatting, no behavior change  |
| `refactor` | code change, no fix or feature  |
| `perf`     | performance improvement         |
| `test`     | adding or fixing tests          |
| `build`    | build system or dependencies    |
| `ci`       | CI configuration                |
| `chore`    | maintenance, no src/test change |
| `revert`   | undo a previous commit          |

Examples:

```
feat: add `Apple` sign-in button
fix: reset `isLoading` after `fetch` fails
docs: explain `GitHub Flow` in contributing guide
perf: memoize `sortedRows` in list view
refactor: extract `parseDate` helper
chore: bump `eslint` to v9
```

Never do these:

```
feat(Auth): Add Apple Sign-In          # scope + uppercase
Fix: crash                             # wrong case, vague
feat: added login                      # past tense
feat: add login\n\nCo-Authored-By: ... # forbidden footer
```

## Pull Requests

- Target the default branch from the task branch.
- PR title follows the commit rules, at most 64 characters.
- Description covers what changed and why, with no tool or agent attribution.
- Update the task branch from the default branch using the project's documented policy.
- Follow the project's merge policy; use squash merging when none is specified.

## Agent Checklist

Before finishing any git task, verify:

1. [ ] Branch is based on the default branch and named `<type>/<short-kebab>`.
2. [ ] No direct commits to the default branch.
3. [ ] Commit subject uses lowercase prose, preserves proper names and identifiers, has no scope and is ≤ 64 characters.
4. [ ] Important keywords in backticks.
5. [ ] Body only when clarification is needed; no footer, co-author or attribution.
6. [ ] PR targets the default branch with a conventional title.
