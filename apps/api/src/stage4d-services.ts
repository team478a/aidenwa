// Compatibility exports for callers that have not yet moved to the Handoff module.
export {
  fakeHandoffFixture,
  finalizeSalesHandoff,
} from './modules/handoffs/handoff-card/handoff-finalization.service.js';
export { calculateLeadScore } from './modules/handoffs/scoring/handoff-scoring.js';
