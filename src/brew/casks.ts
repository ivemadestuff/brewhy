import { type Resolver, caskID } from "./ids.js";
import { isRecord, namesFrom, optionalText } from "./metadata.js";
import type { CaskNode, RawCask } from "./types.js";

export function readCasks(
  rawCasks: RawCask[],
  warnings: string[],
): { casks: Map<string, CaskNode>; caskAliases: Map<string, string> } {
  const casks = new Map<string, CaskNode>();
  const caskAliases = new Map<string, string>();

  for (const raw of rawCasks) {
    const fullToken = caskToken(raw);
    if (!fullToken) {
      warnings.push("Skipped an installed cask with no token in Homebrew's output.");
      continue;
    }
    const ID = caskID(fullToken);
    if (casks.has(ID)) continue;
    const token = optionalText(raw.token) ?? fullToken;
    casks.set(ID, {
      ID,
      token,
      fullToken,
      tap: optionalText(raw.tap),
      names: namesFrom(raw.name),
      description: optionalText(raw.desc),
      homepage: optionalText(raw.homepage),
      version: optionalText(raw.installed) ?? optionalText(raw.version),
      dependencies: [],
    });

    for (const alias of [token, fullToken, ...namesFrom(raw.old_tokens)]) {
      if (alias.length > 0 && !caskAliases.has(alias)) caskAliases.set(alias, ID);
    }
  }

  return { casks, caskAliases };
}

export function linkCaskEdges(pass: {
  rawCasks: RawCask[];
  casks: Map<string, CaskNode>;
  resolveFormula: Resolver;
  resolveCask: Resolver;
}): void {
  const { rawCasks, casks, resolveFormula, resolveCask } = pass;
  const linked = new Set<string>();

  for (const raw of rawCasks) {
    const fullToken = caskToken(raw);
    if (!fullToken) continue;
    const node = casks.get(caskID(fullToken));
    if (!node || linked.has(node.ID)) continue;
    linked.add(node.ID);

    const dependsOn = raw.depends_on;
    if (dependsOn === undefined || dependsOn === null) continue;

    const edges = new Set<string>();
    for (const dependencyName of namesFrom(dependsOn.formula)) {
      const dependencyID = resolveFormula(dependencyName);
      if (dependencyID) edges.add(dependencyID);
    }
    for (const dependencyToken of namesFrom(dependsOn.cask)) {
      const dependencyID = resolveCask(dependencyToken);
      if (dependencyID && dependencyID !== node.ID) edges.add(dependencyID);
    }
    node.dependencies = [...edges].sort();
  }
}

function caskToken(raw: RawCask): string | undefined {
  return isRecord(raw) ? (optionalText(raw.full_token) ?? optionalText(raw.token)) : undefined;
}
