import type { Inventory } from "../brew/types.js";

export interface DependencyGraph {
  edges: Map<string, string[]>;
  reverse: Map<string, string[]>;
  directEdges: Map<string, string[]>;
  directReverse: Map<string, string[]>;
  requestedRootIDs: string[];
  topLevelCaskIDs: string[];
}

export function buildGraph(inventory: Inventory): DependencyGraph {
  const edges = new Map<string, string[]>();
  const directEdges = new Map<string, string[]>();

  const addNode = (ID: string, dependencies: string[], directDependencies: string[]): void => {
    edges.set(ID, [...dependencies].sort());
    directEdges.set(ID, [...directDependencies].sort());
  };

  for (const node of inventory.formulae.values()) {
    addNode(node.ID, node.dependencies, node.directDependencies);
  }
  for (const node of inventory.casks.values()) {
    addNode(node.ID, node.dependencies, node.dependencies);
  }

  const reverse = reverseEdges(edges);
  const directReverse = reverseEdges(directEdges);

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

  return { edges, reverse, directEdges, directReverse, requestedRootIDs, topLevelCaskIDs };
}

function reverseEdges(edges: Map<string, string[]>): Map<string, string[]> {
  const reverse = new Map<string, string[]>([...edges.keys()].map((ID) => [ID, []]));
  for (const [ID, dependencies] of edges) {
    for (const dependency of dependencies) {
      reverse.get(dependency)?.push(ID);
    }
  }
  for (const dependents of reverse.values()) dependents.sort();
  return reverse;
}
