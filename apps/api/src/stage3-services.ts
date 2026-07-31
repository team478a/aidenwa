// Compatibility exports for callers that have not yet moved to domain modules.
export { targetEligibility } from './modules/campaign-targets/campaign-target.eligibility.js';
export { simulateScenario } from './modules/scenarios/scenario-simulator.js';
export {
  type GraphEdge,
  type GraphNode,
  validateScenario,
} from './modules/scenarios/scenario-validator.js';
