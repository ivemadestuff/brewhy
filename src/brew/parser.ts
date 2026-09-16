import { linkCaskEdges, readCasks } from "./casks.js";
import { linkFormulaEdges, readFormulae } from "./formulae.js";
import { type Resolver, caskID, formulaID, resolverFor } from "./ids.js";
import type { FormulaNode, Inventory, RawBrewInfo } from "./types.js";

export function parseInventory(payload: RawBrewInfo, requestedNames: string[] | null): Inventory {
  const warnings: string[] = [];
  const rawFormulae = Array.isArray(payload.formulae) ? payload.formulae : [];
  const rawCasks = Array.isArray(payload.casks) ? payload.casks : [];

  const { formulae, formulaAliases, kegs } = readFormulae(rawFormulae, warnings);
  const resolveFormula = resolverFor(formulae, formulaAliases, formulaID);
  linkFormulaEdges({ rawFormulae, formulae, kegs, resolveFormula, warnings });

  const { casks, caskAliases } = readCasks(rawCasks, warnings);
  const resolveCask = resolverFor(casks, caskAliases, caskID);
  linkCaskEdges({ rawCasks, casks, resolveFormula, resolveCask });

  applyRequestedList(formulae, resolveFormula, requestedNames, warnings);

  return { formulae, casks, formulaAliases, caskAliases, warnings };
}

function applyRequestedList(
  formulae: Map<string, FormulaNode>,
  resolveFormula: Resolver,
  requestedNames: string[] | null,
  warnings: string[],
): void {
  if (requestedNames === null) {
    warnings.push(
      "Could not read `brew list --formula --installed-on-request`; falling back to the intent recorded in `brew info` output.",
    );
    return;
  }

  const requestedIDs = new Set<string>();
  for (const name of requestedNames) {
    const ID = resolveFormula(name);
    if (ID) {
      requestedIDs.add(ID);
    } else {
      warnings.push(
        `Homebrew reported ${name} as installed on request, but it is not in the installed inventory.`,
      );
    }
  }

  for (const node of formulae.values()) {
    node.intent = requestedIDs.has(node.ID) ? "requested" : "automatic";
  }
}
