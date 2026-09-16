import type { PackageKind } from "./args.js";
import { resolveCaskID, resolveFormulaID } from "./brew/ids.js";
import { BrewhyError, usageError } from "./errors.js";
import type { Analysis, ExplainedPackage } from "./graph/types.js";

export function resolvePackage(
  analysis: Analysis,
  name: string,
  kind: PackageKind | null,
): ExplainedPackage {
  const { inventory } = analysis;
  const formulaNodeID = resolveFormulaID(inventory, name);
  const caskNodeID = resolveCaskID(inventory, name);
  const formula = formulaNodeID === undefined ? undefined : analysis.byID.get(formulaNodeID);
  const cask = caskNodeID === undefined ? undefined : analysis.caskByID.get(caskNodeID);

  if (kind === "formula") {
    if (formula) return formula;
    if (cask) throw caskNotFormula(name, cask.node.token);
    throw notInstalled(name);
  }
  if (kind === "cask") {
    if (cask) return cask;
    if (formula) throw formulaNotCask(name);
    throw notACask(name);
  }

  if (formula && cask) throw bothKinds(name);
  if (formula) return formula;
  if (cask) return cask;
  throw notInstalled(name);
}

function caskNotFormula(name: string, token: string): BrewhyError {
  const message =
    token === name
      ? `${name} is an installed cask, not a formula.`
      : `${name} is an installed cask, now ${token}, not a formula.`;
  return usageError(message, `Run \`brewhy ${name}\` or \`brewhy --cask ${name}\`.`);
}

function formulaNotCask(name: string): BrewhyError {
  return usageError(
    `${name} is an installed formula, not a cask.`,
    `Run \`brewhy ${name}\` or \`brewhy --formula ${name}\`.`,
  );
}

function notACask(name: string): BrewhyError {
  return usageError(
    `${name} is not an installed cask.`,
    "Run `brewhy` to see the installed inventory.",
  );
}

function bothKinds(name: string): BrewhyError {
  return usageError(
    `${name} is both an installed formula and an installed cask.`,
    `Run \`brewhy --formula ${name}\` or \`brewhy --cask ${name}\`.`,
  );
}

function notInstalled(name: string): BrewhyError {
  return usageError(`${name} is not installed.`, "Run `brewhy` to see the installed inventory.");
}
