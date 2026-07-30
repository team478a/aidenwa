import { maskPhone } from '@sales-ai/voice-provider';

export function callableValue(type: string, requested: boolean, isValid: boolean) {
  return type === 'fax' ? false : requested && isValid;
}

type PhoneAuditSource = {
  id: string;
  companyId: string;
  contactId?: string | null;
  type: string;
  isPrimary: boolean;
  isValid: boolean;
  isCallable: boolean;
  normalizedNumber: string;
};

export function phoneAuditData(phone: PhoneAuditSource) {
  return {
    id: phone.id,
    companyId: phone.companyId,
    contactId: phone.contactId,
    type: phone.type,
    isPrimary: phone.isPrimary,
    isValid: phone.isValid,
    isCallable: phone.isCallable,
    maskedNumber: maskPhone(phone.normalizedNumber),
  };
}
