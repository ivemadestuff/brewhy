export function helpText(isTTY: boolean): string {
  const name = isTTY ? "\x1b[1mbrewhy\x1b[0m" : "brewhy";
  return `${name} — A read-only CLI that explains why each formula is installed.

Usage:
  brewhy                   List requested formulae
  brewhy <name>            Explain a package
  brewhy --formula <name>  Explain a formula
  brewhy --cask <name>     Explain a cask

Options:
  --show-casks             Include the cask list
  --help                   Show help
  --version                Show version
`;
}
