import type { Inventory } from "../brew/types.js";

export interface DependencyGraph {
  edges: Map<string, string[]>;
  reverse: Map<string, string[]>;
  requestedRootIDs: string[];
  topLevelCaskIDs: string[];
}

export function buildGraph(inventory: Inventory): DependencyGraph {
  const edges = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();

  const addNode = (ID: string, dependencies: string[]): void => {
    edges.set(ID, [...dependencies].sort());
    if (!reverse.has(ID)) reverse.set(ID, []);
  };

  for (const node of inventory.formulae.values()) {
    addNode(node.ID, node.dependencies);
  }
  for (const node of inventory.casks.values()) {
    addNode(node.ID, node.dependencies);
  }

  for (const [ID, dependencies] of edges) {
    for (const dependency of dependencies) {
      const dependents = reverse.get(dependency);
      if (dependents) dependents.push(ID);
    }
  }
  for (const dependents of reverse.values()) {
    dependents.sort();
  }

  const requestedRootIDs = [...inventory.formulae.values()]
    .filter((node) => node.intent === "requested")
    .map((node) => node.ID)
    .sort();

  const caskIDs = new Set(inventory.casks.keys());
  const topLevelCaskIDs = [...inventory.casks.values()]
    .filter((node) => {
      const dependents = reverse.get(node.ID) ?? [];
      return !dependents.some((dependent) => caskIDs.has(dependent));
    })
    .map((node) => node.ID)
    .sort();

  return { edges, reverse, requestedRootIDs, topLevelCaskIDs };
}
