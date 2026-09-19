export interface RawRuntimeDependency {
  full_name?: string;
  version?: string;
  declared_directly?: boolean;
}

export interface RawInstalledKeg {
  version?: string;
  installed_on_request?: boolean;
  runtime_dependencies?: RawRuntimeDependency[];
}

export interface RawFormula {
  name?: string;
  full_name?: string;
  desc?: string;
  homepage?: string;
  tap?: string;
  aliases?: string[];
  oldnames?: string[];
  linked_keg?: string | null;
  installed?: RawInstalledKeg[];
}

export interface RawCaskDependsOn {
  formula?: string | string[];
  cask?: string | string[];
}

export interface RawCask {
  token?: string;
  full_token?: string;
  old_tokens?: string[];
  tap?: string;
  name?: string[];
  desc?: string;
  homepage?: string;
  version?: string;
  installed?: string | null;
  depends_on?: RawCaskDependsOn;
}

export interface RawBrewInfo {
  formulae?: RawFormula[];
  casks?: RawCask[];
}

export type Intent = "requested" | "automatic" | "unknown";

export type NodeType = "formula" | "cask";

export interface FormulaNode {
  ID: string;
  name: string;
  fullName: string;
  tap: string | undefined;
  description: string | undefined;
  homepage: string | undefined;
  installedVersions: string[];
  intent: Intent;
  dependencies: string[];
  directDependencies: string[];
}

export interface CaskNode {
  ID: string;
  token: string;
  fullToken: string;
  tap: string | undefined;
  names: string[];
  description: string | undefined;
  homepage: string | undefined;
  version: string | undefined;
  dependencies: string[];
}

export interface Inventory {
  formulae: Map<string, FormulaNode>;
  casks: Map<string, CaskNode>;
  formulaAliases: Map<string, string>;
  caskAliases: Map<string, string>;
  warnings: string[];
}
