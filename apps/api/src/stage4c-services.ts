// Compatibility exports for callers that have not yet moved to the Followup module.
export {
  assignFollowup,
  autoAssignFollowup,
  ensureHumanFollowupAllowed,
  followupDashboard,
  recordFollowupAttempt,
  runFakeZoomMatch,
  transitionFollowup,
} from './modules/followups/workflow/followup.service.js';
