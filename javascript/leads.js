import { request } from './api-client.js';

const leadBody = document.querySelector('#lead-rows');
let captured = [];
function showLeads() {
  const query = document.querySelector('#lead-search').value.toLowerCase();
  leadBody.replaceChildren();
  const matches = captured.filter(lead => [lead.name, lead.email, lead.company, lead.source].join(' ').toLowerCase().includes(query));
  document.querySelector('#lead-count').textContent = captured.length;
  document.querySelector('#lead-empty').hidden = matches.length > 0;
  for (const lead of matches) {
    const row = document.createElement('tr');
    for (const value of [lead.name, lead.email, lead.phone || '-', lead.company || '-', lead.source, lead.message || '-', lead.status, new Date(lead.createdAt).toLocaleString()]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    leadBody.append(row);
    if(window.FlowDesk && ['super_admin','admin','manager'].includes(window.FlowDesk.user.role)){
      const cell=document.createElement('td');const button=document.createElement('button');button.className='b';button.textContent='Assign';button.onclick=()=>window.FlowDesk.assign(lead,loadLeads);cell.append(button);row.append(cell);
    }
  }
}
async function loadLeads() {
  const status = document.querySelector('#lead-status');
  try {
    if (location.protocol === 'file:') throw new Error('Open FlowDesk through the local server to receive leads.');
    if(window.FlowDeskReady) await window.FlowDeskReady;
    captured = (await request('/api/leads')).leads;
    showLeads(); status.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (error) {
    if (error.status === 401) location.href='/sign-in';
    status.textContent = error.message;
  }
}
document.querySelector('#lead-search').addEventListener('input', showLeads);
document.querySelector('#lead-refresh').addEventListener('click', loadLeads);
loadLeads();
setInterval(() => { if (!document.hidden) loadLeads(); }, 5000);
