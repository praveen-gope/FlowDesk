import { acceptInvite, AuthError, getUser, handleAuthCallback, login, logout, MissingIdentityError, updateUser } from '@netlify/identity';
import { request } from './api-client.js';

const form = document.querySelector('#login-form');
const status = document.querySelector('#login-status');
const button = form.querySelector('button');
let mode = 'login';
let inviteToken;

function showError(error) {
  if (error instanceof MissingIdentityError) {
    status.textContent = 'Netlify Identity is not enabled yet. Ask your administrator to enable it for this site.';
  } else if (error instanceof AuthError) {
    status.textContent = error.status === 401 ? 'Invalid email or password.' : error.status === 404 ? 'Sign-in is not available until Netlify Identity is enabled and deployed for this site.' : error.message;
  } else {
    status.textContent = error.message || 'Could not sign in. Please try again.';
  }
}

async function openWorkspace() {
  const session = await request('/api/auth/session');
  if (!session.user) throw new Error('Could not verify your session. Please sign in again.');
  location.assign('/html/dashboard.html');
}

function passwordMode(nextMode) {
  mode = nextMode;
  document.querySelector('h1').textContent = nextMode === 'invite' ? 'Join your workspace' : 'Choose a new password';
  document.querySelector('#auth-description').textContent = 'Set a password with at least 10 characters to continue.';
  form.elements.email.required = false;
  form.elements.email.hidden = true;
  document.querySelector('label[for="login-email"]').hidden = true;
  form.elements.password.autocomplete = 'new-password';
  form.elements.password.minLength = 10;
  form.elements.password.maxLength = 128;
  button.textContent = nextMode === 'invite' ? 'Accept invitation' : 'Update password';
  document.querySelector('#forgot-password-link').hidden = true;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = mode === 'login' ? 'Signing in…' : 'Updating your password…';
  try {
    if (mode === 'invite') await acceptInvite(inviteToken, form.elements.password.value);
    else if (mode === 'recovery') await updateUser({ password: form.elements.password.value });
    else await login(form.elements.email.value.trim(), form.elements.password.value);
    await openWorkspace();
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
    form.elements.password.value = '';
  }
});

async function initialize() {
  button.disabled = true;
  try {
    const callback = await handleAuthCallback();
    if (callback?.type === 'invite') {
      inviteToken = callback.token;
      passwordMode('invite');
    } else if (callback?.type === 'recovery') {
      passwordMode('recovery');
    } else if (await getUser()) {
      await openWorkspace();
    }
  } catch (error) {
    showError(error);
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'b';
    action.textContent = 'Use another account';
    action.onclick = async () => {
      await logout().catch(() => undefined);
      location.replace('/sign-in');
    };
    status.after(action);
  } finally {
    button.disabled = false;
  }
}

initialize();
