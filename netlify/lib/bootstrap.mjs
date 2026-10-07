import { HttpError } from './policy.mjs';

export async function bootstrapID(identity, identityAdmin) {
  if (!identity) return '';
  if (process.env.FLOWDESK_FIRST_ADMIN_ID) return process.env.FLOWDESK_FIRST_ADMIN_ID;
  const configured = (process.env.FLOWDESK_FIRST_ADMIN_EMAIL ?? 'kr.praveengope@gmail.com').trim().toLowerCase();
  if (!configured || identity.email?.toLowerCase() !== configured) return '';
  // Check the persisted, confirmed Identity account rather than trusting browser metadata.
  const verified = await identityAdmin.getUser(identity.id);
  if (verified.id !== identity.id || verified.email?.toLowerCase() !== configured || !verified.confirmedAt) {
    throw new HttpError(403, 'Confirm your administrator email in Netlify Identity before signing in.');
  }
  return identity.id;
}
