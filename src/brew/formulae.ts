import { type Resolver, formulaID } from "./ids.js";
import { isRecord, namesFrom, optionalText } from "./metadata.js";
import type { FormulaNode, Intent, RawFormula, RawInstalledKeg } from "./types.js";

function selectKeg(
  raw: RawFormula,
  fullName: string,
  warnings: string[],
): RawInstalledKeg | undefined {
  const installed = Array.isArray(raw.installed) ? raw.installed : [];
  const kegs = installed.filter(isRecord);
  if (kegs.length !== installed.length) {
    warnings.push(`${fullName} has invalid installed keg metadata; skipped malformed entries.`);
  }
  if (kegs.length === 0) return undefined;
  if (kegs.length > 1) {
    const versions = kegs.map((keg) => optionalText(keg.version) ?? "unknown").join(", ");
    if (raw.linked_keg) {
      const linked = kegs.find((keg) => keg.version === raw.linked_keg);
      if (linked) {
        warnings.push(
          `${fullName} has multiple installed versions (${versions}); using the linked keg ${raw.linked_keg}.`,
        );
        return linked;
      }
    }
    warnings.push(
      `${fullName} has multiple installed versions (${versions}) and no matching linked keg; using the most recent entry.`,
    );
    return kegs[kegs.length - 1];
  }
  return kegs[0];
}

function readIntent(keg: RawInstalledKeg | undefined): Intent {
  if (keg === undefined || typeof keg.installed_on_request !== "boolean") {
    return "unknown";
  }
  return keg.installed_on_request ? "requested" : "automatic";
}

export function readFormulae(
  rawFormulae: RawFormula[],
  warnings: string[],
): {
  formulae: Map<string, FormulaNode>;
  formulaAliases: Map<string, string>;
  kegs: Map<string, RawInstalledKeg | undefined>;
} {
  const formulae = new Map<string, FormulaNode>();
  const formulaAliases = new Map<string, string>();
  const kegs = new Map<string, RawInstalledKeg | undefined>();

  for (const raw of rawFormulae) {
    const fullName = formulaName(raw);
    if (!fullName) {
      warnings.push("Skipped an installed formula with no name in Homebrew's output.");
      continue;
    }
    const ID = formulaID(fullName);
    if (formulae.has(ID)) continue;

    const keg = selectKeg(raw, fullName, warnings);
    kegs.set(fullName, keg);
    const name = optionalText(raw.name) ?? fullName;
    const versions = (Array.isArray(raw.installed) ? raw.installed : [])
      .filter(isRecord)
      .map((entry) => optionalText(entry.version))
      .filter((version): version is string => version !== undefined);

    formulae.set(ID, {
      ID,
      name,
      fullName,
      tap: optionalText(raw.tap),
      description: optionalText(raw.desc),
      homepage: optionalText(raw.homepage),
      installedVersions: versions,
      intent: readIntent(keg),
      dependencies: [],
      directDependencies: [],
    });

    for (const alias of [name, fullName, ...namesFrom(raw.aliases), ...namesFrom(raw.oldnames)]) {
      if (typeof alias === "string" && alias.length > 0 && !formulaAliases.has(alias)) {
        formulaAliases.set(alias, ID);
      }
    }
  }

  return { formulae, formulaAliases, kegs };
}

export function linkFormulaEdges(pass: {
  rawFormulae: RawFormula[];
  formulae: Map<string, FormulaNode>;
  kegs: Map<string, RawInstalledKeg | undefined>;
  resolveFormula: Resolver;
  warnings: string[];
}): void {
  const { rawFormulae, formulae, kegs, resolveFormula, warnings } = pass;
  const linked = new Set<string>();

  for (const raw of rawFormulae) {
    const fullName = formulaName(raw);
    if (!fullName) continue;
    const node = formulae.get(formulaID(fullName));
    if (!node || linked.has(node.ID)) continue;
    linked.add(node.ID);

    const keg = kegs.get(fullName);
    if (keg === undefined) {
      warnings.push(`${fullName} has no installed keg metadata; its dependencies are unknown.`);
      continue;
    }
    if (!Array.isArray(keg.runtime_dependencies)) {
      warnings.push(
        `${fullName} has no recorded runtime dependency metadata; its dependencies are unknown.`,
      );
      continue;
    }

    const edges = new Set<string>();
    const direct = new Set<string>();
    for (const dependency of keg.runtime_dependencies) {
      const dependencyName = dependency?.full_name;
      if (typeof dependencyName !== "string" || dependencyName.length === 0) {
        warnings.push(`${fullName} records a runtime dependency with no name.`);
        continue;
      }
      const dependencyID = resolveFormula(dependencyName);
      if (!dependencyID) {
        warnings.push(
          `${fullName} depends on ${dependencyName}, which is not present in the installed inventory.`,
        );
        continue;
      }
      if (dependencyID === node.ID) continue;
      edges.add(dependencyID);
      if (dependency.declared_directly === true) direct.add(dependencyID);
    }
    node.dependencies = [...edges].sort();
    node.directDependencies = [...direct].sort();
  }
}

function formulaName(raw: RawFormula): string | undefined {
  return isRecord(raw) ? (optionalText(raw.full_name) ?? optionalText(raw.name)) : undefined;
}
