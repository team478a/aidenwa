// Compatibility exports for callers that have not yet moved to the Maintenance registry.
export {
  maintenanceDefinitions,
  maintenanceJobNames,
  processMaintenanceJob,
  recordMaintenanceFailure,
  registerMaintenanceSchedulers,
  type MaintenanceJobName,
} from './jobs/maintenance/registry.js';
