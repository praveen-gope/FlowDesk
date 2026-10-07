const form=document.querySelector('#login-form');
const status=document.querySelector('#login-status');
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button');
  button.disabled=true;status.textContent='Signing in...';
  try{
    const callback=await window.FlowDeskIdentityCallbackReady;
    if(callback?.type==='invite'){
      await window.FlowDeskAcceptInvite(callback.token,form.elements.password.value);
      const access=await fetch('/api/auth/session');
      const result=await access.json();
      if(!access.ok||!result.user)throw new Error(result.error||'Account confirmed. Ask your administrator for CRM access.');
      location.href='/html/dashboard.html';return;
    }
    const sessionResponse=await fetch('/api/auth/session');
    if(!sessionResponse.ok)throw new Error(sessionResponse.status===404?'FlowDesk API is missing from this deployment. Deploy the Netlify Functions configuration.':'FlowDesk backend is unavailable. Check database configuration and migrations.');
    if(!sessionResponse.headers.get('content-type')?.includes('application/json'))throw new Error('FlowDesk API returned a web page instead of JSON. Check deployment redirects.');
    const session=await sessionResponse.json();
    const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':session.csrfToken},body:JSON.stringify({email:form.elements.email.value.trim(),password:form.elements.password.value})});
    if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('The sign-in API is unavailable in this deployment.');
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Sign in failed.');
    location.href='/html/dashboard.html';
  }catch(error){status.textContent=error.message}
  finally{button.disabled=false}
});
