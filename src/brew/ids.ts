import type { Inventory } from "./types.js";

export function formulaID(fullName: string): string {
  return `formula:${fullName}`;
}

export function caskID(fullToken: string): string {
  return `cask:${fullToken}`;
}

export function splitID(ID: string): { type: "formula" | "cask"; name: string } {
  const index = ID.indexOf(":");
  const type = ID.slice(0, index) === "cask" ? "cask" : "formula";
  return { type, name: ID.slice(index + 1) };
}

export type Resolver = (name: string) => string | undefined;

export function resolverFor<T>(
  nodes: ReadonlyMap<string, T>,
  aliases: ReadonlyMap<string, string>,
  idOf: (name: string) => string,
): Resolver {
  return (name) => {
    const direct = idOf(name);
    return nodes.has(direct) ? direct : aliases.get(name);
  };
}

export function resolveFormulaID(inventory: Inventory, name: string): string | undefined {
  return resolverFor(inventory.formulae, inventory.formulaAliases, formulaID)(name);
}

export function resolveCaskID(inventory: Inventory, token: string): string | undefined {
  return resolverFor(inventory.casks, inventory.caskAliases, caskID)(token);
}
