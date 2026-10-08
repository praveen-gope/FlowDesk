export function installShortcuts({request, user}) {
  if(document.querySelector('#crm-shortcuts'))return;
  const dialog=document.createElement('dialog');
  dialog.id='crm-shortcuts';dialog.className='shortcut-dialog';
  dialog.innerHTML='<div class="shortcut-heading"><h2 id="shortcut-title"></h2><button type="button" class="b ic" aria-label="Close dialog" title="Close">&times;</button></div><div id="shortcut-content"></div>';
  dialog.setAttribute('aria-labelledby','shortcut-title');document.body.append(dialog);
  const title=dialog.querySelector('h2'),content=dialog.querySelector('#shortcut-content');
  let version=0,previousFocus;
  const element=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el};
  const button=(text,action)=>{const el=element('button',text,'b');el.type='button';el.onclick=action;return el};
  const openRecord=record=>{sessionStorage.setItem('flowdesk-record',record.id);location.href='/html/record.html'};
  const status=message=>{content.replaceChildren(element('p',message,'mu'))};
  dialog.querySelector('button').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}});
  dialog.addEventListener('close',()=>{version++;previousFocus?.focus()});

  async function open(mode){
    const current=++version;
    if(!dialog.open){previousFocus=document.activeElement;dialog.showModal()}
    title.textContent={customers:'Find customer',tasks:'Tasks',reports:'Reports'}[mode];
    status('Loading...');
    dialog.querySelector('button').focus();
    try{
      if(mode==='reports'){
        const {counts}=await request('/api/reports');if(current!==version)return;
        const list=element('dl',undefined,'shortcut-reports');
        const labels={lead:'Leads',contact:'Contacts',company:'Companies',deal:'Deals',task:'Tasks',product:'Products',invoice:'Invoices',ticket:'Support tickets',communication:'Communications',note:'Notes',document:'Documents'};
        Object.entries(labels).forEach(([key,label])=>{list.append(element('dt',label),element('dd',String(counts[key]??0)))});
        content.replaceChildren(list,button('Open reports',()=>{location.href='/html/reports.html'}));return;
      }
      const {records}=await request('/api/records/'+(mode==='customers'?'contact':'task'));if(current!==version)return;
      const input=element('input',undefined,'in shortcut-search');input.type='search';input.placeholder=mode==='customers'?'Name or phone number':'Search tasks';input.setAttribute('aria-label',input.placeholder);
      const results=element('div',undefined,'shortcut-results');results.setAttribute('aria-live','polite');
      const render=()=>{
        const query=input.value.trim().toLowerCase(),digits=query.replace(/\D/g,'');
        const matches=records.filter(record=>record.name.toLowerCase().includes(query)||(mode==='customers'&&digits&&/^[-+()\d\s.]+$/.test(query)&&record.phone.replace(/\D/g,'').includes(digits)));
        results.replaceChildren();
        if(!matches.length){results.append(element('p','No matching records.','mu'));return}
        matches.forEach(record=>{
          const item=element('article',undefined,'shortcut-result');
          item.append(button(record.name,()=>openRecord(record)));
          const detail=mode==='customers'?[record.company,record.email,record.phone]:[record.status,record.details['Due date']];
          item.append(element('p',detail.filter(Boolean).join(' | '),'mu'));results.append(item);
        });
      };
      input.oninput=render;content.replaceChildren(input,results);render();input.focus();
      if(mode==='tasks'){
        const form=element('form',undefined,'shortcut-task-form');
        const label=element('label','Task name');label.htmlFor='quick-task-name';
        const name=element('input',undefined,'in');name.id='quick-task-name';name.required=true;name.maxLength=160;
        const dateLabel=element('label','Due date');dateLabel.htmlFor='quick-task-date';
        const date=element('input',undefined,'in');date.id='quick-task-date';date.type='date';
        const submit=element('button','Add task','b p');submit.type='submit';
        const message=element('p','','mu');message.setAttribute('role','status');
        form.append(label,name,dateLabel,date,submit,message);
        form.onsubmit=async event=>{
          event.preventDefault();if(!name.value.trim()){name.setCustomValidity('Enter a task name.');name.reportValidity();return}name.setCustomValidity('');submit.disabled=true;
          try{const {record}=await request('/api/records/task','POST',{name:name.value.trim(),status:'To-Do',details:{'Due date':date.value}});if(current!==version)return;records.unshift(record);form.reset();input.value='';render();message.textContent='Task added.'}
          catch(error){if(current===version)message.textContent=error.message}finally{submit.disabled=false}
        };
        name.oninput=()=>name.setCustomValidity('');content.append(form,button('Open tasks',()=>{location.href='/html/tasks.html'}));
      }
    }catch(error){if(current===version)status(error.message)}
  }
  const actions=element('div',undefined,'shortcut-actions');
  [['customers','Find customer','Ctrl+K'],['tasks','Tasks','Ctrl+P'],['reports','Reports','Ctrl+R']].forEach(([mode,label,key])=>{const control=button(label,()=>open(mode));control.title=key;control.setAttribute('aria-keyshortcuts',key.replace('Ctrl','Control'));actions.append(control)});
  document.querySelector('header').after(actions);
  document.addEventListener('keydown',event=>{
    if(!event.ctrlKey||event.altKey||event.shiftKey||event.metaKey||event.repeat)return;
    const mode={k:'customers',p:'tasks',r:'reports'}[event.key.toLowerCase()];
    if(mode){event.preventDefault();open(mode)}
  },true);
}
