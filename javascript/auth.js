const form=document.querySelector('#login-form');
const status=document.querySelector('#login-status');
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button');
  button.disabled=true;status.textContent='Signing in...';
  try{
    const sessionResponse=await fetch('/api/auth/session');
    if(!sessionResponse.ok)throw new Error('Could not connect to FlowDesk. Check that the server is running.');
    const session=await sessionResponse.json();
    const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRFToken':session.csrfToken},body:JSON.stringify({email:form.elements.email.value.trim(),password:form.elements.password.value})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Sign in failed.');
    location.href='/html/dashboard.html';
  }catch(error){status.textContent=error.message}
  finally{button.disabled=false}
});
