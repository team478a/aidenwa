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
});
