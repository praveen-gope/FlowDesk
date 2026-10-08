// Connect editable pages to scoped CRM APIs (Django locally, Functions on Netlify).
window.FlowDeskReady = (async () => {
  const listPages=['Contacts','Companies','Deals','Tasks','Products','Invoices','Emails','Notifications','Support Notes','Documents','Support Tickets'];
  let loading;
  if(location.protocol==='file:'){document.querySelectorAll('table').forEach(table=>table.dataset.recordsState='ready');return}
  if(listPages.includes(document.body.dataset.page)){
    loading=document.createElement('p');loading.id='backend-list-status';loading.className='mu';loading.setAttribute('role','status');loading.textContent='Loading records...';
    const table=document.querySelector('#v table');
    if(table){table.setAttribute('aria-busy','true');table.parentElement.after(loading)}
    else document.querySelector('#v').append(loading);
  }
  await window.FlowDeskIdentityCallbackReady;
  const response = await fetch('/api/auth/session');
  if (!response.ok) throw new Error('CRM session unavailable. Check account access and backend configuration.');
  const session = await response.json();
  let csrf = session.csrfToken;
  const user = session.user;
  async function request(url, method='GET', data) {
    const res = await fetch(url, {method, headers:{'Content-Type':'application/json','X-CSRFToken':csrf}, ...(data ? {body:JSON.stringify(data)} : {})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || 'Request failed.');
    if(result.csrfToken)csrf=result.csrfToken;
    return result;
  }
  const page=document.body.dataset.page,view=document.querySelector('#v');
  const notice=message=>notify(message);
  if(page==='Sign in'){
    const button=view.querySelector('button');
    button.onclick=async()=>{const inputs=view.querySelectorAll('input');inputs.forEach(i=>i.required=true);if([...inputs].some(i=>!i.reportValidity()))return;button.disabled=true;
      try{await request('/api/auth/login','POST',{email:inputs[0].value,password:inputs[1].value});location.href='/index.html'}catch(error){notice(error.message)}finally{button.disabled=false}};
    view.querySelectorAll('a').forEach(a=>a.hidden=true);return;
  }
  if(!user){location.href='/html/sign-in.html';return}
  const privileged=['super_admin','admin','manager'].includes(user.role);
  const me=document.querySelector('.me');me.querySelector('b').textContent=user.name;me.querySelector('small').textContent=user.email;me.querySelector('.av').textContent=user.name.split(' ').map(w=>w[0]).slice(0,2).join('');
  const role=document.createElement('small');role.textContent=user.roleLabel;me.querySelector('div').append(role);
  const logout=document.createElement('button');logout.className='b';logout.textContent='Sign out';logout.onclick=async()=>{await request('/api/auth/logout','POST',{});location.href='/html/sign-in.html'};document.querySelector('header .bar').append(logout);
  document.querySelectorAll('#nav a').forEach(a=>{
    if(['Sign in','Sign up','Forgot password','OTP verification','New password'].includes(a.dataset.p))a.hidden=true;
    if(a.dataset.p==='Users & Teams')a.hidden=false;
    if(['Integrations','Explore integrations','Settings'].includes(a.dataset.p)&&user.role!=='super_admin')a.hidden=true;
    if(user.role==='support'&&['Captured Leads','Deals','Add deal','Add contact','Add company','Products','Invoices','Companies'].includes(a.dataset.p))a.hidden=true;
  });
  async function assign(record,refresh){
    try{
      const [people,groups]=await Promise.all([request('/api/assignees'),request('/api/teams')]);
      const modal=document.createElement('div');modal.className='md';
      modal.innerHTML='<form class="card" style="width:440px;max-width:100%"><h3>Assign record</h3><label>Team</label><select class="in" name="team" style="width:100%"></select><label>Owner</label><select class="in" name="owner" style="width:100%"></select><label>Additional assignees</label><select class="in" name="assigned" multiple style="width:100%;min-height:100px"></select><label><input type="checkbox" name="support"> Permit support access</label><p><button class="b p" type="submit">Save assignment</button> <button class="b" type="button">Cancel</button></p></form>';
      const form=modal.querySelector('form');
      const option=(select,label,value)=>{const o=document.createElement('option');o.textContent=label;o.value=value;select.append(o)};
      option(form.elements.team,'Unassigned','');option(form.elements.owner,'Unassigned','');groups.teams.forEach(t=>option(form.elements.team,t.name,t.id));people.users.forEach(u=>{option(form.elements.owner,u.name,u.id);option(form.elements.assigned,u.name,u.id)});
      form.elements.team.value=record.team||'';form.elements.owner.value=record.owner||'';form.elements.support.checked=record.support_access;[...form.elements.assigned.options].forEach(o=>o.selected=record.assigned_to.includes(Number(o.value)));
      form.querySelector('button[type=button]').onclick=()=>modal.remove();
      form.onsubmit=async e=>{e.preventDefault();try{await request('/api/record/'+record.id,'PATCH',{team:Number(form.elements.team.value)||null,owner:Number(form.elements.owner.value)||null,assigned_to:[...form.elements.assigned.selectedOptions].map(o=>Number(o.value)),support_access:form.elements.support.checked});modal.remove();await refresh();notice('Assignment saved')}catch(error){notice(error.message)}};
      document.body.append(modal);
    }catch(error){notice(error.message)}
  }
  window.FlowDesk={request,user,assign};
  const {installShortcuts}=await import('/javascript/shortcuts.js');
  installShortcuts(window.FlowDesk);
  const kinds={Contacts:'contact',Companies:'company',Deals:'deal',Tasks:'task',Products:'product',Invoices:'invoice',Emails:'communication',Notifications:'communication','Support Notes':'note',Documents:'document','Support Tickets':'ticket'};
  const formKind={'Add contact':'contact','Add company':'company','Add deal':'deal','Add task':'task','Add product':'product','Add support note':'note','Add document':'document'}[page];
  if(formKind){view.querySelector('button').onclick=async()=>{
    const inputs=[...view.querySelectorAll('input,textarea')];inputs[0].required=true;if(inputs.some(i=>!i.reportValidity()))return;
    const data={name:inputs[0].value,details:{}};inputs.forEach(i=>{const label=i.previousElementSibling?.textContent.trim()||'';if(label==='Email')data.email=i.value;else if(label==='Phone')data.phone=i.value;else if(label==='Company')data.company=i.value;else if(label==='Message')data.message=i.value;else if(label==='Status'||label==='Stage')data.status=i.value||'New';else data.details[label]=i.value});
    try{await request('/api/records/'+formKind,'POST',data);location.href='/html/'+({contact:'contacts',company:'companies',deal:'deals',task:'tasks',product:'products',note:'support-notes',document:'documents'}[formKind])+'.html'}catch(error){notice(error.message)}
  }}
  const kind=kinds[page];
  if(kind){
    let table=view.querySelector('table');
    if(!table){view.replaceChildren();table=document.createElement('table');const wrap=document.createElement('div');wrap.className='card tw';wrap.append(table);view.append(wrap);table.innerHTML='<thead><tr><th></th><th>Name</th><th>Message</th><th>Status</th></tr></thead><tbody></tbody>'}
    if(loading&&!loading.isConnected)table.parentElement.after(loading);
    const render=async()=>{
      const {records}=await request('/api/records/'+kind);const headers=[...table.querySelectorAll('th')].slice(1).map(th=>th.textContent.trim());table.querySelectorAll('tr').forEach((r,i)=>{if(i)r.remove()});
      records.forEach(record=>{const row=table.insertRow();const details=Object.fromEntries(Object.entries(record.details).map(([key,value])=>[key.toLowerCase(),value]));row.insertCell().innerHTML='<input type="checkbox" aria-label="Select record">';headers.forEach((label,i)=>{const key=label.toLowerCase();let value=details[key]||'';if(i===0)value=record.name;else if(['email','phone','company','message'].includes(key))value=record[key];else if(/status|stage|type/.test(key))value=record.status;else if(/date/.test(key))value=record.details['Due date']||new Date(record.createdAt).toLocaleDateString();else if(/owner|assignee/.test(key))value=record.owner===user.id?user.name:'Assigned';row.insertCell().textContent=value||'-'});
        if(privileged){const button=document.createElement('button');button.className='b';button.textContent='Assign';button.onclick=()=>assign(record,render);row.insertCell().append(button)}row.cells[1].style.cursor='pointer';row.cells[1].onclick=()=>{sessionStorage.setItem('flowdesk-record',record.id);location.href='/html/record.html'};
      });
      view.querySelector('#backend-empty')?.remove();if(!records.length){const p=document.createElement('p');p.id='backend-empty';p.className='mu';p.textContent='No records assigned to this view.';table.parentElement.after(p)}
      table.dataset.recordsState='ready';table.setAttribute('aria-busy','false');loading?.remove();
    };
    await render();
    if(page==='Support Tickets'){
      const refresh=async()=>{await render();view.querySelector('input[placeholder^="Search"]')?.dispatchEvent(new Event('input'))};
      document.querySelector('#ticket-refresh').onclick=()=>refresh().catch(error=>notice(error.message));
      setInterval(()=>{if(!document.hidden)refresh().catch(error=>notice(error.message))},5000);
    }
    view.querySelectorAll('button').forEach(button=>{if(button.textContent.includes('Export'))button.onclick=async()=>{const {records}=await request('/api/records/'+kind);const fields=['name','email','phone','company','status'];const csv=[fields,...records.map(r=>fields.map(f=>r[f]))].map(row=>row.map(v=>'"'+String(v||'').replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=kind+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}});
  }
  if(page==='Record'){
    const id=sessionStorage.getItem('flowdesk-record');if(!id){notice('Choose a record from a list.');return}const {record}=await request('/api/record/'+id);document.querySelector('#record-name').textContent=record.name;
    const form=document.querySelector('#record-form');['name','email','phone','company','message','status'].forEach(k=>form.elements[k].value=record[k]||'');if(user.role==='support'&&!['note','task','document','ticket'].includes(record.kind))[...form.elements].forEach(el=>el.disabled=true);
    form.onsubmit=async e=>{e.preventDefault();try{await request('/api/record/'+id,'PATCH',Object.fromEntries(new FormData(form)));notice('Record saved')}catch(error){notice(error.message)}};
  }
  if(['Dashboard','Reports'].includes(page)){
    const {counts}=await request('/api/reports');const cards=[...view.querySelectorAll('.g3>.card,.g4>.card')].slice(0,3);['lead','deal','task'].forEach((k,i)=>{const card=cards[i];if(card){card.querySelector('.mu').textContent={lead:'Visible leads',deal:'Visible deals',task:'Visible tasks'}[k];card.querySelector('.big').textContent=counts[k];card.querySelectorAll('svg,.pl').forEach(el=>el.remove())}});
    if(page==='Dashboard'){view.querySelector('table')?.parentElement.remove();const title=[...view.querySelectorAll('h3')].find(h=>h.textContent==='Table data sales');if(title)title.parentElement.remove()}
  }
  if(page==='Calendar'){
    const {records}=await request('/api/records/task');view.replaceChildren();const title=document.createElement('h2');title.textContent='Scheduled tasks';view.append(title);
    records.forEach(record=>{const item=document.createElement('div');item.className='mail';const name=document.createElement('b');name.textContent=record.name;const date=document.createElement('p');date.className='mu';date.textContent=record.details['Due date']||'No due date';item.append(name,date);view.append(item)});
    if(!records.length){const empty=document.createElement('p');empty.className='mu';empty.textContent='No scheduled tasks in your record scope.';view.append(empty)}
  }
  if(['Sign up','Forgot password','OTP verification','New password'].includes(page)){
    view.replaceChildren();const message=document.createElement('p');message.textContent='Contact your administrator for account creation and password assistance.';view.append(message);
  }
  if(page==='Profile'){const inputs=view.querySelectorAll('input');inputs[0].value=user.name;inputs[1].value='';inputs[2].value=user.email;view.querySelector('button').onclick=()=>notice('Account details are managed by your administrator.')}
  if(['Company detail','Deal detail','Product detail','Edit contact'].includes(page))location.replace('/html/record.html');
  if(page==='Import CSV')view.querySelector('button').onclick=()=>notice('Bulk import is not connected to Django yet. Use the record forms or capture API.');
  if(['Settings','Integrations','Explore integrations'].includes(page)&&user.role!=='super_admin'){view.replaceChildren();const p=document.createElement('p');p.textContent='System configuration requires Super Admin access.';view.append(p)}
  if(page==='Users & Teams'){
    const form=document.querySelector('#user-form'),teamForm=document.querySelector('#team-form');
    teamForm.hidden=!['super_admin','admin'].includes(user.role);
    const render=async()=>{const [people,groups]=await Promise.all([request('/api/users'),request('/api/teams')]);
      form.elements.role.replaceChildren();people.roles.forEach(r=>{const o=document.createElement('option');o.value=r.value;o.textContent=r.label;form.elements.role.append(o)});
      form.elements.team.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='No team';form.elements.team.append(empty);groups.teams.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.name;form.elements.team.append(o)});
      const body=document.querySelector('#user-rows');body.replaceChildren();people.users.forEach(u=>{const row=document.createElement('tr');[u.name,u.email,u.roleLabel,u.teams.map(t=>t.name).join(', ')||'-',u.active?'Active':'Inactive'].forEach(v=>{const td=document.createElement('td');td.textContent=v;row.append(td)});const action=document.createElement('td');const button=document.createElement('button');button.className='b';button.textContent=u.active?'Deactivate':'Activate';button.disabled=u.id===user.id;button.onclick=async()=>{try{await request('/api/users/'+u.id,'PATCH',{active:!u.active});await render()}catch(error){notice(error.message)}};action.append(button);row.append(action);body.append(row)})};
    form.onsubmit=async e=>{e.preventDefault();try{await request('/api/users','POST',{name:form.elements.name.value,email:form.elements.email.value,password:form.elements.password.value,role:form.elements.role.value,teams:form.elements.team.value?[Number(form.elements.team.value)]:[]});form.reset();await render();notice('User created')}catch(error){notice(error.message)}};
    teamForm.onsubmit=async e=>{e.preventDefault();try{await request('/api/teams','POST',{name:teamForm.elements.name.value});teamForm.reset();await render();notice('Team created')}catch(error){notice(error.message)}};
    await render();
  }
})().catch(error=>{const status=document.querySelector('#backend-list-status');if(status){status.textContent='Unable to load records. '+error.message;document.querySelector('#v table')?.setAttribute('aria-busy','false')}if(typeof notify==='function')notify(error.message);console.error(error)});
