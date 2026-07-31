import type { PrismaClient } from '@sales-ai/database';
import { targetEligibility } from './campaign-target.eligibility.js';
import { listSalesListMembers } from './campaign-target.repository.js';

export type TargetPreviewRow = {
  companyId: string;
  phoneNumberId: string | null;
  ownerUserIdSnapshot: string | null;
  eligible: boolean;
  exclusionReason: string | null;
};

export async function previewCampaignTargets(
  prisma: PrismaClient,
  organizationId: string,
  salesListId: string,
) {
  const members = await listSalesListMembers(prisma, salesListId);
  const rows: TargetPreviewRow[] = [];
  for (const member of members) {
    const phone = member.company.phoneNumbers[0];
    const eligibility = await targetEligibility(
      prisma,
      organizationId,
      member.companyId,
      phone?.id,
    );
    rows.push({
      companyId: member.companyId,
      phoneNumberId: phone?.id ?? null,
      ownerUserIdSnapshot: member.company.ownerUserId,
      eligible: eligibility.eligible,
      exclusionReason: eligibility.reason,
    });
  }
  return rows;
}

export async function materializeCampaignTargets(
  prisma: PrismaClient,
  organizationId: string,
  campaignId: string,
  rows: TargetPreviewRow[],
) {
  await prisma.campaignTarget.deleteMany({ where: { campaignId } });
  for (const row of rows)
    await prisma.campaignTarget.create({
      data: {
        organizationId,
        campaignId,
        companyId: row.companyId,
        phoneNumberId: row.phoneNumberId,
        ownerUserIdSnapshot: row.ownerUserIdSnapshot,
        status: row.eligible ? 'pending' : 'excluded',
        eligibilityStatus: row.eligible ? 'eligible' : 'excluded',
        exclusionReason: row.exclusionReason,
      },
    });
}

export function summarizeCampaignTargets(rows: TargetPreviewRow[]) {
  return {
    total: rows.length,
    eligible: rows.filter((row) => row.eligible).length,
    excluded: rows.filter((row) => !row.eligible).length,
  };
}
