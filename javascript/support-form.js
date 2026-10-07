// Set an absolute hosted API URL when this form is installed on another website.
const SUPPORT_API_URL='/api/support/capture';
document.querySelector('#support-form').addEventListener('submit',async event=>{
event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),status=document.querySelector('#support-status');button.disabled=true;status.textContent='Sending your support request...';
try{const response=await fetch(SUPPORT_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not submit your request.');
status.textContent=result.message+' Reference: '+result.reference;form.reset();
}catch(error){status.textContent=error.message}finally{button.disabled=false}
});
