import { handleAuthCallback, acceptInvite, hydrateSession } from '@netlify/identity';

if (/^#(?:invite_token|confirmation_token|recovery_token|access_token)=/.test(location.hash) && location.pathname !== '/sign-in' && location.pathname !== '/sign-in.html') {
  location.replace('/sign-in' + location.hash);
} else {
  window.FlowDeskAcceptInvite = acceptInvite;
  window.FlowDeskIdentityCallbackReady = (async () => {
    const callback = await handleAuthCallback();
    if (callback?.type === 'invite') {
      const form = document.querySelector('#login-form');
      if (form) {
        document.querySelector('h1').textContent = 'Set your password';
        form.elements.email.required = false;
        document.querySelector('label[for="login-email"]').hidden = true;
        form.elements.email.hidden = true;
        form.elements.password.minLength = 12;
        form.elements.password.autocomplete = 'new-password';
        form.querySelector('button').textContent = 'Accept invitation';
      }
    } else if (callback?.type === 'recovery') {
      document.querySelector('#login-status').textContent = 'Password recovery is not connected yet. Contact your administrator.';
    } else {
      await hydrateSession().catch(() => {});
    }
    return callback;
  })();
  window.FlowDeskIdentityCallbackReady.catch(error => {
    const status = document.querySelector('#login-status');
    if (status) status.textContent = error.message;
  });
}
