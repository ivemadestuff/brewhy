import { usageError } from "./errors.js";

export type PackageKind = "formula" | "cask";

export interface ParsedArgs {
  name: string | null;
  kind: PackageKind | null;
  isCaskListHidden: boolean;
  help: boolean;
  version: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    name: null,
    kind: null,
    isCaskListHidden: false,
    help: false,
    version: false,
  };

  const positionals: string[] = [];
  let onlyPositionals = false;

  for (const argument of argv) {
    if (onlyPositionals) {
      positionals.push(argument);
      continue;
    }
    switch (argument) {
      case "--":
        onlyPositionals = true;
        break;
      case "--help":
        parsed.help = true;
        break;
      case "--version":
        parsed.version = true;
        break;
      case "--hide-casks":
        parsed.isCaskListHidden = true;
        break;
      case "--cask":
        setKind(parsed, "cask");
        break;
      case "--formula":
        setKind(parsed, "formula");
        break;
      default:
        if (argument.startsWith("-") && argument !== "-") {
          throw usageError(
            `Unknown option: ${argument}`,
            "Run `brewhy --help` to see the supported options.",
          );
        }
        positionals.push(argument);
    }
  }

  if (positionals.length > 1) {
    throw usageError(
      `Expected at most one package name, received ${positionals.length}: ${positionals.join(", ")}`,
      "Explain one package at a time, for example `brewhy openssl@3`.",
    );
  }
  if (parsed.kind !== null && positionals.length === 0) {
    const flag = parsed.kind === "cask" ? "--cask" : "--formula";
    const example = parsed.kind === "cask" ? "firefox" : "openssl@3";
    throw usageError(
      `${flag} explains one installed ${parsed.kind}, so it needs a name.`,
      `Run \`brewhy ${flag} ${example}\`, or \`brewhy\` to list the inventory.`,
    );
  }
  parsed.name = positionals[0] ?? null;

  return parsed;
}

function setKind(parsed: ParsedArgs, kind: PackageKind): void {
  if (parsed.kind !== null && parsed.kind !== kind) {
    throw usageError(
      "Cannot combine --cask and --formula.",
      "Use one lookup qualifier, for example `brewhy --cask firefox`.",
    );
  }
  parsed.kind = kind;
}
