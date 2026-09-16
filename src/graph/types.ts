import type { CaskNode, FormulaNode, Intent, Inventory, NodeType } from "../brew/types.js";
import type { DependencyGraph } from "./graph.js";
import type { ReachabilityIndex } from "./paths.js";

export interface ReasonSource {
  ID: string;
  name: string;
  type: NodeType;
}

export interface ReasonPath {
  source: string;
  sourceType: NodeType;
  path: string[];
  pathTypes: NodeType[];
}

export interface PackageRelations {
  label: string;
  isShared: boolean;
  requestedFormulaRoots: ReasonSource[];
  caskReasonSources: ReasonSource[];
  immediateDependents: ReasonSource[];
  reasonPaths: ReasonPath[];
}

export interface PackageFacts extends PackageRelations {
  type: "formula";
  node: FormulaNode;
  intent: Intent;
  isUnexplained: boolean;
}

export interface CaskFacts extends PackageRelations {
  type: "cask";
  node: CaskNode;
}

export type ExplainedPackage = PackageFacts | CaskFacts;

export interface Summary {
  total: number;
  requested: number;
  automatic: number;
  unknown: number;
  shared: number;
  unexplained: number;
}

export interface RootFacts {
  ID: string;
  label: string;
  type: NodeType;
  dependencies: string[];
  exclusive: string[];
}

export interface Analysis {
  inventory: Inventory;
  graph: DependencyGraph;
  reachability: ReachabilityIndex;
  packages: PackageFacts[];
  casks: CaskFacts[];
  byID: Map<string, PackageFacts>;
  caskByID: Map<string, CaskFacts>;
  labels: Map<string, string>;
  roots: RootFacts[];
  summary: Summary;
  warnings: string[];
}
