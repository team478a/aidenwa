import { describe, expect, it } from 'vitest';
import { simulateScenario, validateScenario } from './stage3-services';

const nodes = [
  { nodeKey: 'start', nodeType: 'start' },
  { nodeKey: 'listen', nodeType: 'listen', messageTemplate: '{{company.name}}' },
  { nodeKey: 'stop', nodeType: 'end' },
  { nodeKey: 'optout', nodeType: 'opt_out' },
];
const edges = [
  { fromNodeKey: 'start', toNodeKey: 'listen', conditionType: 'default', priority: 1 },
  { fromNodeKey: 'listen', toNodeKey: 'stop', conditionType: 'default', priority: 100 },
  {
    fromNodeKey: 'listen',
    toNodeKey: 'optout',
    conditionType: 'intent',
    conditionValue: 'opt_out',
    priority: 999,
  },
  { fromNodeKey: 'optout', toNodeKey: 'stop', conditionType: 'default', priority: 1 },
];

describe('Stage 3 scenario services', () => {
  it('detects invalid graph structure and undefined template variables', () => {
    expect(
      validateScenario(
        [{ nodeKey: 'a', nodeType: 'start', messageTemplate: '{{secret.code}}' }],
        [],
      ),
    ).toEqual(
      expect.arrayContaining([
        'end_node_required',
        'no_reachable_end',
        'undefined_variable:secret.code',
      ]),
    );
  });
  it('is deterministic and prioritizes opt-out intent', () => {
    expect(validateScenario(nodes, edges)).toEqual([]);
    expect(simulateScenario(nodes, edges, ['anything', 'opt_out', 'anything']).path).toEqual([
      'start',
      'listen',
      'optout',
      'stop',
    ]);
    expect(simulateScenario(nodes, edges, ['anything', 'opt_out', 'anything'])).toEqual(
      simulateScenario(nodes, edges, ['anything', 'opt_out', 'anything']),
    );
  });
  it('rejects duplicate nodes, edges, defaults, priorities, and end-node edges', () => {
    const errors = validateScenario(
      [
        { nodeKey: 'start', nodeType: 'start' },
        { nodeKey: 'end', nodeType: 'end' },
        { nodeKey: 'end', nodeType: 'end' },
      ],
      [
        { fromNodeKey: 'start', toNodeKey: 'end', conditionType: 'default', priority: 1 },
        { fromNodeKey: 'start', toNodeKey: 'end', conditionType: 'default', priority: 1 },
        { fromNodeKey: 'end', toNodeKey: 'start', conditionType: 'default', priority: 1 },
      ],
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'duplicate_node_key:end',
        'duplicate_edge:start->end->default->',
        'duplicate_default_branch:start',
        'duplicate_priority:start:1',
        'end_node_has_outgoing_edge:end',
      ]),
    );
  });
  it('rejects node-type configuration omissions and excessive depth', () => {
    const deepNodes = [
      { nodeKey: 'start', nodeType: 'start' },
      ...Array.from({ length: 50 }, (_, index) => ({
        nodeKey: `node_${index}`,
        nodeType: 'listen',
      })),
      { nodeKey: 'end', nodeType: 'end' },
    ];
    const deepEdges = deepNodes.slice(0, -1).map((node, index) => ({
      fromNodeKey: node.nodeKey,
      toNodeKey: deepNodes[index + 1]!.nodeKey,
      conditionType: 'default',
      priority: 1,
    }));
    expect(validateScenario(deepNodes, deepEdges)).toContain('maximum_depth_exceeded:52:50');
    expect(
      validateScenario(
        [
          { nodeKey: 'start', nodeType: 'start' },
          { nodeKey: 'say', nodeType: 'speak' },
          { nodeKey: 'branch', nodeType: 'branch' },
          { nodeKey: 'faq', nodeType: 'faq_lookup' },
          { nodeKey: 'end', nodeType: 'end' },
        ],
        [
          { fromNodeKey: 'start', toNodeKey: 'say', conditionType: 'default' },
          { fromNodeKey: 'say', toNodeKey: 'branch', conditionType: 'default' },
          { fromNodeKey: 'branch', toNodeKey: 'faq', conditionType: 'default' },
          { fromNodeKey: 'faq', toNodeKey: 'end', conditionType: 'default' },
        ],
      ),
    ).toEqual(
      expect.arrayContaining([
        'missing_config:say:messageTemplate',
        'missing_config:branch:conditionalBranch',
        'missing_config:faq:instruction',
      ]),
    );
  });
  it('rejects unsafe loops and accepts only explicitly bounded loops that can reach end', () => {
    const cyclicEdges = [
      { fromNodeKey: 'start', toNodeKey: 'loop_a', conditionType: 'default', priority: 1 },
      { fromNodeKey: 'loop_a', toNodeKey: 'loop_b', conditionType: 'default', priority: 1 },
      {
        fromNodeKey: 'loop_b',
        toNodeKey: 'loop_a',
        conditionType: 'intent',
        conditionValue: 'retry',
        priority: 1,
      },
      { fromNodeKey: 'loop_b', toNodeKey: 'end', conditionType: 'default', priority: 2 },
    ];
    const cyclicNodes = [
      { nodeKey: 'start', nodeType: 'start' },
      { nodeKey: 'loop_a', nodeType: 'listen' },
      { nodeKey: 'loop_b', nodeType: 'listen' },
      { nodeKey: 'end', nodeType: 'end' },
    ];
    expect(validateScenario(cyclicNodes, cyclicEdges)).toContain('unbounded_cycle:loop_a,loop_b');
    const boundedNodes = cyclicNodes.map((node) =>
      node.nodeKey === 'loop_a' ? { ...node, config: { maxCycles: 3 } } : node,
    );
    expect(validateScenario(boundedNodes, cyclicEdges)).toEqual([]);
    expect(
      simulateScenario(
        boundedNodes,
        cyclicEdges,
        Array.from({ length: 20 }, () => 'retry'),
      ),
    ).toEqual({
      path: ['start', 'loop_a', 'loop_b', 'loop_a', 'loop_b', 'loop_a', 'loop_b', 'end'],
      result: 'end',
    });
    expect(
      validateScenario(
        cyclicNodes.map((node) =>
          node.nodeKey === 'loop_a' ? { ...node, config: { maxCycles: 11 } } : node,
        ),
        cyclicEdges,
      ),
    ).toEqual(expect.arrayContaining(['invalid_max_cycles:loop_a:10']));
  });
  it('requires every reachable branch to retain a path to a safe end', () => {
    expect(
      validateScenario(
        [
          { nodeKey: 'start', nodeType: 'start' },
          { nodeKey: 'dead_a', nodeType: 'listen' },
          { nodeKey: 'dead_b', nodeType: 'listen' },
          { nodeKey: 'end', nodeType: 'end' },
        ],
        [
          { fromNodeKey: 'start', toNodeKey: 'end', conditionType: 'default', priority: 1 },
          { fromNodeKey: 'start', toNodeKey: 'dead_a', conditionType: 'intent', priority: 2 },
          { fromNodeKey: 'dead_a', toNodeKey: 'dead_b', conditionType: 'default', priority: 1 },
          { fromNodeKey: 'dead_b', toNodeKey: 'dead_a', conditionType: 'default', priority: 1 },
        ],
      ),
    ).toEqual(expect.arrayContaining(['unsafe_no_end_path:dead_a', 'unsafe_no_end_path:dead_b']));
  });
});
