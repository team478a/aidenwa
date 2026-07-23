import type { PrismaClient } from '@sales-ai/database';
import { checkOptOut } from './stage2-services.js';

export type GraphNode = {
  nodeKey: string;
  nodeType: string;
  messageTemplate?: string;
  config?: unknown;
};
export type GraphEdge = {
  fromNodeKey: string;
  toNodeKey: string;
  conditionType: string;
  conditionValue?: string;
  priority?: number;
};
const TEMPLATE_VARIABLES = new Set(['company.name', 'contact.name', 'product.name', 'agent.name']);

export function validateScenario(nodes: GraphNode[], edges: GraphEdge[]) {
  const errors: string[] = [];
  const starts = nodes.filter((node) => node.nodeType === 'start');
  const ends = nodes.filter((node) => node.nodeType === 'end');
  if (starts.length !== 1) errors.push('start_node_must_be_exactly_one');
  if (!ends.length) errors.push('end_node_required');
  const keys = new Set(nodes.map((node) => node.nodeKey));
  for (const edge of edges) {
    if (!keys.has(edge.fromNodeKey)) errors.push(`missing_from:${edge.fromNodeKey}`);
    if (!keys.has(edge.toNodeKey)) errors.push(`missing_to:${edge.toNodeKey}`);
  }
  if (starts[0]) {
    const reached = new Set<string>();
    const queue = [starts[0].nodeKey];
    while (queue.length) {
      const key = queue.shift();
      if (!key || reached.has(key)) continue;
      reached.add(key);
      queue.push(...edges.filter((edge) => edge.fromNodeKey === key).map((edge) => edge.toNodeKey));
    }
    for (const node of nodes)
      if (!reached.has(node.nodeKey)) errors.push(`unreachable:${node.nodeKey}`);
    if (!ends.some((node) => reached.has(node.nodeKey))) errors.push('no_reachable_end');
  }
  for (const node of nodes) {
    for (const match of node.messageTemplate?.matchAll(/\{\{\s*([^}]+)\s*\}\}/gu) ?? []) {
      const variable = match[1]?.trim();
      if (variable && !TEMPLATE_VARIABLES.has(variable))
        errors.push(`undefined_variable:${variable}`);
    }
  }
  return [...new Set(errors)];
}

export function simulateScenario(nodes: GraphNode[], edges: GraphEdge[], intents: string[]) {
  const start = nodes.find((node) => node.nodeType === 'start');
  if (!start) return { path: [], result: 'invalid' };
  const path = [start.nodeKey];
  let current = start.nodeKey;
  for (const intent of intents.slice(0, 50)) {
    const candidates = edges
      .filter((edge) => edge.fromNodeKey === current)
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
    if (nodes.find((node) => node.nodeKey === current)?.nodeType === 'end') break;
  }
  return { path, result: nodes.find((node) => node.nodeKey === current)?.nodeType ?? 'stopped' };
}

export async function targetEligibility(
  prisma: PrismaClient,
  organizationId: string,
  companyId: string,
  phoneNumberId?: string | null,
) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId, isDeleted: false },
  });
  if (!company) return { eligible: false, reason: 'company_missing' };
  if (!phoneNumberId) return { eligible: false, reason: 'phone_missing' };
  const phone = await prisma.phoneNumber.findFirst({
    where: { id: phoneNumberId, companyId, organizationId, isDeleted: false },
  });
  if (!phone) return { eligible: false, reason: 'phone_missing' };
  if (phone.type === 'fax') return { eligible: false, reason: 'fax' };
  if (!phone.isValid) return { eligible: false, reason: 'invalid_phone' };
  if (!phone.isCallable) return { eligible: false, reason: 'not_callable' };
  const blocked = await checkOptOut(prisma, organizationId, {
    companyId,
    phoneNumberId,
    phone: phone.normalizedNumber,
    channel: 'phone',
  });
  if (blocked.blocked) return { eligible: false, reason: `opt_out:${blocked.matchedScope}` };
  return { eligible: true, reason: null, phone };
}
