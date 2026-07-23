import { z } from 'zod';
import { SALES_STATUSES } from '@sales-ai/shared/stage2';

const nullableText = z.string().trim().max(1000).nullable().optional();
export const companyInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  corporateNumber: z
    .string()
    .trim()
    .regex(/^\d{13}$/)
    .nullable()
    .optional(),
  nameKana: nullableText,
  tradeName: nullableText,
  websiteUrl: z.string().trim().url().nullable().optional(),
  inquiryUrl: z.string().trim().url().nullable().optional(),
  industryCode: nullableText,
  industryName: nullableText,
  employeeRange: nullableText,
  annualSalesRange: nullableText,
  establishedYear: z.number().int().min(1000).max(3000).nullable().optional(),
  postalCode: nullableText,
  prefecture: nullableText,
  city: nullableText,
  address: nullableText,
  businessHours: nullableText,
  closedDays: nullableText,
  salesStatus: z.enum(SALES_STATUSES).optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  sourceType: nullableText,
  sourceUrl: z.string().url().nullable().optional(),
  isCustomer: z.boolean().optional(),
  nextActionAt: z.coerce.date().nullable().optional(),
  nextActionType: nullableText,
});
export const companyPatchSchema = companyInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const companyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().optional(),
  phone: z.string().optional(),
  corporateNumber: z.string().optional(),
  domain: z.string().optional(),
  prefecture: z.string().optional(),
  city: z.string().optional(),
  industry: z.string().optional(),
  salesStatus: z.enum(SALES_STATUSES).optional(),
  ownerUserId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  isCustomer: z.enum(['true', 'false']).optional(),
  optOut: z.enum(['true', 'false']).optional(),
  sortBy: z
    .enum(['name', 'createdAt', 'updatedAt', 'lastContactedAt', 'nextActionAt'])
    .default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export const contactInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameKana: nullableText,
  department: nullableText,
  position: nullableText,
  email: z.string().trim().email().nullable().optional(),
  decisionRole: z.enum(['unknown', 'contact', 'champion', 'decision_maker']).optional(),
  verificationStatus: z.enum(['unverified', 'ai_extracted', 'verified']).optional(),
  sourceType: nullableText,
  notes: nullableText,
});
export const contactPatchSchema = contactInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const phoneInputSchema = z.object({
  rawNumber: z.string().trim().min(1).max(50),
  contactId: z.string().uuid().nullable().optional(),
  type: z
    .enum(['representative', 'department', 'store', 'direct', 'mobile', 'fax', 'unknown'])
    .default('unknown'),
  label: nullableText,
  isPrimary: z.boolean().default(false),
  isCallable: z.boolean().default(true),
});
export const phonePatchSchema = phoneInputSchema.partial().refine((v) => Object.keys(v).length > 0);
export const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#64748b'),
  description: nullableText,
});
export const tagPatchSchema = tagInputSchema
  .partial()
  .extend({ status: z.enum(['active', 'archived']).optional() })
  .refine((v) => Object.keys(v).length > 0);
export const salesListInputSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: nullableText,
  listType: z.enum(['static', 'dynamic']).default('static'),
  filterConditions: companyQuerySchema.partial().default({}),
});
export const salesListPatchSchema = salesListInputSchema
  .partial()
  .extend({ status: z.enum(['active', 'archived']).optional() })
  .refine((v) => Object.keys(v).length > 0);
export const companyIdsSchema = z.object({
  companyIds: z.array(z.string().uuid()).min(1).max(100),
});
export const optOutInputSchema = z.object({
  companyId: z.string().uuid().optional(),
  phoneNumberId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  scope: z.enum(['company', 'phone', 'contact', 'channel']),
  channel: z.enum(['all', 'phone', 'email', 'form', 'sms']),
  reasonCode: z.enum([
    'customer_request',
    'complaint',
    'existing_customer',
    'competitor',
    'internal_block',
    'invalid_number',
    'closed_business',
    'duplicate',
    'out_of_scope',
    'other',
  ]),
  reasonText: nullableText,
  evidenceText: nullableText,
});
export const optOutCheckSchema = z.object({
  companyId: z.string().uuid().optional(),
  phoneNumberId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  channel: z.enum(['phone', 'email', 'form', 'sms']),
});
export const releaseOptOutSchema = z.object({ releaseReason: z.string().trim().min(3).max(1000) });
export const mappingSchema = z.object({
  mapping: z.record(z.string().min(1)),
  duplicatePolicy: z.enum(['create', 'update', 'fill_blank', 'skip', 'review']),
});
