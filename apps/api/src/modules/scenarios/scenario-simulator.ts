import { objectConfig, type GraphEdge, type GraphNode } from './scenario-validator.js';

export function simulateScenario(nodes: GraphNode[], edges: GraphEdge[], intents: string[]) {
  const start = nodes.find((node) => node.nodeType === 'start');
  if (!start) return { path: [], result: 'invalid' };
  const path = [start.nodeKey];
  const visits = new Map([[start.nodeKey, 1]]);
  let current = start.nodeKey;
  for (const intent of intents.slice(0, 50)) {
    const candidates = edges
      .filter((edge) => edge.fromNodeKey === current)
      .filter((edge) => {
        const target = nodes.find((node) => node.nodeKey === edge.toNodeKey);
        const maxCycles = objectConfig(target?.config).maxCycles;
        return typeof maxCycles !== 'number' || (visits.get(edge.toNodeKey) ?? 0) < maxCycles;
      })
      .sort((a, b) =>
        intent === 'opt_out' && a.conditionValue === 'opt_out'
          ? -1
          : (a.priority ?? 100) - (b.priority ?? 100),
      );
    const edge =
      candidates.find((item) => item.conditionValue === intent) ??
      candidates.find((item) => item.conditionType === 'default');
    if (!edge) break;
    current = edge.toNodeKey;
    path.push(current);
    visits.set(current, (visits.get(current) ?? 0) + 1);
    if (nodes.find((node) => node.nodeKey === current)?.nodeType === 'end') break;
  }
  return { path, result: nodes.find((node) => node.nodeKey === current)?.nodeType ?? 'stopped' };
}
