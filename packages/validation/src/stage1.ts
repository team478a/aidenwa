import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
  organizationSlug: z.string().min(1).max(100).optional(),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(12).max(200),
});
export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(200),
  role: z.enum(['system_admin', 'admin', 'manager', 'sales']),
  teamId: z.string().uuid().nullable().optional(),
});
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: z.enum(['system_admin', 'admin', 'manager', 'sales']).optional(),
    teamId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  managerUserId: z.string().uuid().nullable().optional(),
});
export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    managerUserId: z.string().uuid().nullable().optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(100)
      .optional(),
    timezone: z.string().min(1).max(100).optional(),
    status: z.enum(['active', 'suspended']).optional(),
    settings: z.record(z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const idParamsSchema = z.object({ id: z.string().uuid() });
