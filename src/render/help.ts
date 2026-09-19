export function helpText(isTTY: boolean): string {
  const name = isTTY ? "\x1b[1mbrewhy\x1b[0m" : "brewhy";
  return `${name} — explain why each formula and cask on your machine is installed.

Usage:
  brewhy                    List each requested formula and installed cask
  brewhy <name>             Explain one installed formula or cask
  brewhy --formula <name>   Explain an installed formula
  brewhy --cask <name>      Explain an installed cask

Options:
  --hide-casks              Hide the cask list; keep summary counts
  --help                    Show usage
  --version                 Show Brewhy version
`;
}
