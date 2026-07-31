export type GraphNode = {
  nodeKey: string;
  nodeType: string;
  instruction?: string;
  messageTemplate?: string;
  expectedIntents?: unknown;
  extractionSchema?: unknown;
  timeoutSeconds?: number;
  retryLimit?: number;
  config?: unknown;
};

export type GraphEdge = {
  fromNodeKey: string;
  toNodeKey: string;
  conditionType: string;
  conditionValue?: string;
  priority?: number;
};

const templateVariables = new Set(['company.name', 'contact.name', 'product.name', 'agent.name']);
const maxScenarioDepth = 50;
const maxCycleCount = 10;

export function objectConfig(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function edgeIdentity(edge: GraphEdge) {
  return [edge.fromNodeKey, edge.toNodeKey, edge.conditionType, edge.conditionValue ?? ''].join(
    '\u0000',
  );
}

export function validateScenario(nodes: GraphNode[], edges: GraphEdge[]) {
  const errors: string[] = [];
  const starts = nodes.filter((node) => node.nodeType === 'start');
  const ends = nodes.filter((node) => node.nodeType === 'end');
  if (starts.length !== 1) errors.push('start_node_must_be_exactly_one');
  if (!ends.length) errors.push('end_node_required');
  const nodeCounts = new Map<string, number>();
  for (const node of nodes) nodeCounts.set(node.nodeKey, (nodeCounts.get(node.nodeKey) ?? 0) + 1);
  for (const [key, count] of nodeCounts) if (count > 1) errors.push(`duplicate_node_key:${key}`);
  const keys = new Set(nodeCounts.keys());
  const edgeCounts = new Map<string, number>();
  const defaultsByNode = new Map<string, number>();
  const prioritiesByNode = new Map<string, Map<number, number>>();
  for (const edge of edges) {
    if (!keys.has(edge.fromNodeKey)) errors.push(`missing_from:${edge.fromNodeKey}`);
    if (!keys.has(edge.toNodeKey)) errors.push(`missing_to:${edge.toNodeKey}`);
    const identity = edgeIdentity(edge);
    edgeCounts.set(identity, (edgeCounts.get(identity) ?? 0) + 1);
    if (edge.conditionType === 'default')
      defaultsByNode.set(edge.fromNodeKey, (defaultsByNode.get(edge.fromNodeKey) ?? 0) + 1);
    const priorities = prioritiesByNode.get(edge.fromNodeKey) ?? new Map<number, number>();
    const priority = edge.priority ?? 100;
    priorities.set(priority, (priorities.get(priority) ?? 0) + 1);
    prioritiesByNode.set(edge.fromNodeKey, priorities);
  }
  for (const [identity, count] of edgeCounts)
    if (count > 1) errors.push(`duplicate_edge:${identity.replaceAll('\u0000', '->')}`);
  for (const [key, count] of defaultsByNode)
    if (count > 1) errors.push(`duplicate_default_branch:${key}`);
  for (const [key, priorities] of prioritiesByNode)
    for (const [priority, count] of priorities)
      if (count > 1) errors.push(`duplicate_priority:${key}:${priority}`);
  for (const end of ends)
    if (edges.some((edge) => edge.fromNodeKey === end.nodeKey))
      errors.push(`end_node_has_outgoing_edge:${end.nodeKey}`);

  const validEdges = edges.filter((edge) => keys.has(edge.fromNodeKey) && keys.has(edge.toNodeKey));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of validEdges) {
    outgoing.set(edge.fromNodeKey, [...(outgoing.get(edge.fromNodeKey) ?? []), edge.toNodeKey]);
    incoming.set(edge.toNodeKey, [...(incoming.get(edge.toNodeKey) ?? []), edge.fromNodeKey]);
  }
  if (starts[0]) {
    const reached = new Set<string>();
    const queue = [starts[0].nodeKey];
    while (queue.length) {
      const key = queue.shift();
      if (!key || reached.has(key)) continue;
      reached.add(key);
      queue.push(...(outgoing.get(key) ?? []));
    }
    for (const node of nodes)
      if (!reached.has(node.nodeKey)) errors.push(`unreachable:${node.nodeKey}`);
    if (!ends.some((node) => reached.has(node.nodeKey))) errors.push('no_reachable_end');

    const canReachEnd = new Set(ends.map((node) => node.nodeKey));
    const reverseQueue = [...canReachEnd];
    while (reverseQueue.length) {
      const key = reverseQueue.shift();
      if (!key) continue;
      for (const previous of incoming.get(key) ?? [])
        if (!canReachEnd.has(previous)) {
          canReachEnd.add(previous);
          reverseQueue.push(previous);
        }
    }
    for (const key of reached) if (!canReachEnd.has(key)) errors.push(`unsafe_no_end_path:${key}`);

    const depthMemo = new Map<string, number>();
    const depthPath = new Set<string>();
    const longestDepth = (key: string): number => {
      const cached = depthMemo.get(key);
      if (cached !== undefined) return cached;
      if (depthPath.has(key)) return 0;
      depthPath.add(key);
      const nextDepths = (outgoing.get(key) ?? []).map(longestDepth);
      depthPath.delete(key);
      const depth = 1 + (nextDepths.length ? Math.max(...nextDepths) : 0);
      depthMemo.set(key, depth);
      return depth;
    };
    const maximumDepth = longestDepth(starts[0].nodeKey);
    if (maximumDepth > maxScenarioDepth)
      errors.push(`maximum_depth_exceeded:${maximumDepth}:${maxScenarioDepth}`);

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const cycleNodes = new Set<string>();
    const traversalPath: string[] = [];
    const findCycles = (key: string) => {
      if (visiting.has(key)) {
        const cycleStart = traversalPath.indexOf(key);
        for (const cycleKey of traversalPath.slice(cycleStart)) cycleNodes.add(cycleKey);
        return;
      }
      if (visited.has(key)) return;
      visiting.add(key);
      traversalPath.push(key);
      for (const next of outgoing.get(key) ?? []) findCycles(next);
      traversalPath.pop();
      visiting.delete(key);
      visited.add(key);
    };
    findCycles(starts[0].nodeKey);
    if (cycleNodes.size) {
      const bounded = [...cycleNodes].some((key) => {
        const node = nodes.find((candidate) => candidate.nodeKey === key);
        const maxCycles = objectConfig(node?.config).maxCycles;
        return (
          typeof maxCycles === 'number' &&
          Number.isInteger(maxCycles) &&
          maxCycles >= 1 &&
          maxCycles <= maxCycleCount
        );
      });
      if (!bounded) errors.push(`unbounded_cycle:${[...cycleNodes].sort().join(',')}`);
    }
  }
  for (const node of nodes) {
    const config = objectConfig(node.config);
    if (
      'maxCycles' in config &&
      (typeof config.maxCycles !== 'number' ||
        !Number.isInteger(config.maxCycles) ||
        config.maxCycles < 1 ||
        config.maxCycles > maxCycleCount)
    )
      errors.push(`invalid_max_cycles:${node.nodeKey}:${maxCycleCount}`);
    if (node.nodeType === 'speak' && !node.messageTemplate?.trim())
      errors.push(`missing_config:${node.nodeKey}:messageTemplate`);
    if (
      ['faq_lookup', 'qualify', 'schedule_request', 'transfer_request'].includes(node.nodeType) &&
      !node.instruction?.trim()
    )
      errors.push(`missing_config:${node.nodeKey}:instruction`);
    if (node.nodeType === 'branch') {
      const branches = edges.filter((edge) => edge.fromNodeKey === node.nodeKey);
      if (!branches.some((edge) => edge.conditionType === 'default'))
        errors.push(`missing_config:${node.nodeKey}:defaultBranch`);
      if (!branches.some((edge) => edge.conditionType !== 'default'))
        errors.push(`missing_config:${node.nodeKey}:conditionalBranch`);
    }
    for (const match of node.messageTemplate?.matchAll(/\{\{\s*([^}]+)\s*\}\}/gu) ?? []) {
      const variable = match[1]?.trim();
      if (variable && !templateVariables.has(variable))
        errors.push(`undefined_variable:${variable}`);
    }
  }
  return [...new Set(errors)];
}
