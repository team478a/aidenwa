import type { readProductionReadiness } from './readiness.repository.js';

type ReadinessRecords = Awaited<ReturnType<typeof readProductionReadiness>>;

export function buildProductionReadiness(records: ReadinessRecords, now: Date) {
  const { approval, policy, providers, activeStops, allowlistCount } = records;
  const approvalState = !approval
    ? 'incomplete'
    : approval.status === 'approved' && approval.expiresAt && approval.expiresAt > now
      ? 'complete'
      : approval.expiresAt && approval.expiresAt <= now
        ? 'expired'
        : 'review_required';
  return {
    overall: 'unavailable',
    realCallingEnabled: false,
    checks: [
      { key: 'approval', state: approvalState },
      { key: 'policy', state: policy ? 'complete' : 'incomplete' },
      {
        key: 'provider',
        state: providers.some((provider) => provider.allowed && !provider.productionEnabled)
          ? 'complete'
          : 'incomplete',
      },
      { key: 'allowlist', state: allowlistCount > 0 ? 'complete' : 'incomplete' },
      { key: 'emergencyStop', state: activeStops.length ? 'review_required' : 'complete' },
      { key: 'writtenApproval', state: 'incomplete' },
      { key: 'realProvider', state: 'unavailable' },
    ],
    approval,
    policy,
    providers,
    activeStops,
    allowlistCount,
  };
}
