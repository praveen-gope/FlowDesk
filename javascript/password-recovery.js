import { AuthError, MissingIdentityError, requestPasswordRecovery } from '@netlify/identity';

const form = document.querySelector('#recovery-form');
const status = document.querySelector('#recovery-status');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Sending reset instructions…';
  try {
    await requestPasswordRecovery(form.elements.email.value.trim());
    status.textContent = 'If an account exists for this address, check your inbox for reset instructions.';
  } catch (error) {
    if (error instanceof MissingIdentityError) status.textContent = 'Netlify Identity is not enabled for this site yet.';
    else if (error instanceof AuthError && error.status === 404) status.textContent = 'If an account exists for this address, check your inbox for reset instructions.';
    else status.textContent = 'Could not send reset instructions. Please try again later.';
  } finally {
    button.disabled = false;
  }
});
