import { z } from 'zod';

const apiInternalUrlSchema = z
  .string()
  .url()
  .transform((value, context) => {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must be an HTTP(S) origin or base URL without credentials, query, or fragment',
      });
      return z.NEVER;
    }
    return value.replace(/\/+$/, '');
  });

export function resolveApiInternalUrl(environment: NodeJS.ProcessEnv): string {
  const configuredUrl = environment.API_INTERNAL_URL?.trim();
  if (!configuredUrl && environment.NODE_ENV === 'development') {
    return 'http://127.0.0.1:3001';
  }

  const parsed = apiInternalUrlSchema.safeParse(configuredUrl);
  if (!parsed.success) {
    throw new Error(
      `Invalid API_INTERNAL_URL: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`,
    );
  }
  return parsed.data;
}
