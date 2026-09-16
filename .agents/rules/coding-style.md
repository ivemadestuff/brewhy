# Coding Style

Rules for AI agents writing code and terminal output.

## Code

- Keep each module focused on one responsibility.
- Separate data loading, analysis and rendering; keep I/O out of analysis and rendering.
- Pass external dependencies explicitly; avoid hidden global state.
- Use the same name for the same concept throughout the codebase.
- Validate external data before it enters application logic.
- Handle expected errors explicitly; preserve cause and context when execution cannot continue.
- Write comments about intent and constraints; omit comments that restate the code.

## Tests

- Test observable behavior, including failures and boundary conditions.
- Use fixed fixtures and isolate external dependencies.
- Review snapshot changes as changes to user-facing output.

## Terminal Output

- Use simple, short English; preserve proper names and code identifiers.
- Keep labels and help descriptions brief; avoid repeating the app name.
- Use title case for headings; sentence case for help descriptions.
- End complete sentences with a period; omit periods from headings, labels and short descriptions.
- Write results to `stdout` and warnings and errors to `stderr`.
- Apply color and decoration only when writing to a terminal.
- Keep redirected application-generated output free of ANSI codes.
- Report any omissions when summarizing redirected output.
