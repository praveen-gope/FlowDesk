export function editUser({user, roles, teams, request, saved, backend}){
  const dialog=document.createElement('dialog');dialog.className='shortcut-dialog';
  dialog.innerHTML='<form><div class="shortcut-heading"><h2>Edit user</h2><button type="button" class="b ic" aria-label="Close">&times;</button></div><div class="shortcut-task-form"><label for="edit-user-name">Full name</label><input class="in" id="edit-user-name" name="name" required maxlength="150"><label for="edit-user-email">Email</label><input class="in" id="edit-user-email" name="email" type="email" required maxlength="254"><label for="edit-user-role">Role</label><select class="in" id="edit-user-role" name="role"></select><label for="edit-user-teams">Teams</label><select class="in" id="edit-user-teams" name="teams" multiple size="4"></select><label for="edit-user-password">New password (leave blank to keep current)</label><input class="in" id="edit-user-password" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password"><label><input name="active" type="checkbox"> Active account</label><p class="mu" role="status"></p><button class="b p" type="submit">Save changes</button></div></form>';
  dialog.setAttribute('aria-label','Edit user');document.body.append(dialog);
  const form=dialog.querySelector('form'),fields=form.elements,previous=document.activeElement;
  fields.namedItem('name').value=user.name;fields.email.value=user.email;fields.active.checked=user.active;
  roles.forEach(role=>{const option=document.createElement('option');option.value=role.value;option.textContent=role.label;fields.role.append(option)});fields.role.value=user.role;
  teams.forEach(team=>{const option=document.createElement('option');option.value=team.id;option.textContent=team.name;option.selected=user.teams.some(t=>t.id===team.id);fields.teams.append(option)});
  if(backend==='netlify'){['name','email','password'].forEach(key=>fields.namedItem(key).disabled=true)}
  dialog.querySelector('button[type=button]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();previous?.focus()});
  form.onsubmit=async event=>{
    event.preventDefault();const submit=form.querySelector('button[type=submit]'),status=form.querySelector('[role=status]');submit.disabled=true;status.textContent='Saving...';
    const data={role:fields.role.value,teams:[...fields.teams.selectedOptions].map(option=>Number(option.value)),active:fields.active.checked};
    if(backend!=='netlify'){data.name=fields.namedItem('name').value.trim();data.email=fields.email.value.trim();if(fields.password.value)data.password=fields.password.value}
    try{await request('/api/users/'+user.id,'PATCH',data);await saved();dialog.close();notify('User updated')}catch(error){status.textContent=error.message}finally{submit.disabled=false}
  };
  dialog.showModal();fields.namedItem('name').focus();
}
