import { getUser, logout } from '@netlify/identity';

export async function initializeIdentity() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (['invite_token', 'recovery_token', 'confirmation_token', 'email_change_token', 'access_token'].some(key => params.has(key))) {
    location.replace('/sign-in' + location.hash);
    return false;
  }
  return getUser();
}

export async function request(url, method = 'GET', data) {
  await getUser();
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('The FlowDesk API is unavailable. Deploy the Netlify Functions and database migrations.');
  }
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function signOut() {
  try {
    await logout();
  } finally {
    location.assign('/sign-in');
  }
}
