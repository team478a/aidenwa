// Compatibility aggregation for existing imports inside and outside the Followup module.
export { assignFollowup, autoAssignFollowup } from '../assignment/followup-assignment.service.js';
export { recordFollowupAttempt } from '../attempt/followup-attempt.service.js';
export { followupDashboard } from '../kpi/followup-kpi.service.js';
export { runFakeZoomMatch } from '../zoom-sync/fake-zoom-sync.service.js';
export { ensureHumanFollowupAllowed } from './followup-eligibility.service.js';
export { transitionFollowup } from './followup-state.service.js';
