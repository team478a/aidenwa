import type { AuthContext } from '../../types.js';
import { companyScope } from '../companies/company.policy.js';

export function contactCompanyScope(auth: AuthContext) {
  return companyScope(auth);
}
