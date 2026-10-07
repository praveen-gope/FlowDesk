const params = new URLSearchParams(location.hash.slice(1));
if (['invite_token', 'recovery_token', 'confirmation_token', 'email_change_token', 'access_token'].some(key => params.has(key))) {
  location.replace('/sign-in' + location.hash);
}
