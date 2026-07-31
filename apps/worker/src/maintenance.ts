// Compatibility exports for callers that have not yet moved to the Maintenance registry.
export {
  maintenanceDefinitions,
  maintenanceJobNames,
  processMaintenanceJob,
  registerMaintenanceSchedulers,
  type MaintenanceJobName,
} from './jobs/maintenance/registry.js';
export { recordMaintenanceFailure } from './jobs/maintenance/failure-reporting.js';
