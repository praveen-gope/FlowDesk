const examples={
leads:[['Northstar Studio','Website enquiry','Interested in a team workspace','Schedule a conversation','New','new'],['Harbor & Co.','Contact form','Growing their sales team','Share the next steps','In progress','progress'],['Fieldwork Design','Website enquiry','A better way to follow up','Arrange a follow-up','Assigned','assigned']],
deals:[['Northstar Studio','New opportunity','Team workspace rollout','Review requirements','In progress','progress'],['Harbor & Co.','Open opportunity','Sales workflow planning','Discuss the proposal','Assigned','assigned']],
tasks:[['Fieldwork Design','Customer follow-up','Arrange a discovery conversation','This week','New','new'],['Harbor & Co.','Team task','Prepare the follow-up details','Next working day','Assigned','assigned']]
};
const tabs=[...document.querySelectorAll('.preview-tabs button')];
function selectTab(tab){
tabs.forEach(t=>{t.setAttribute('aria-selected',String(t===tab));t.tabIndex=t===tab?0:-1});
document.querySelector('#preview-panel').setAttribute('aria-labelledby',tab.id);
const body=document.querySelector('#preview-rows');body.replaceChildren();
examples[tab.dataset.view].forEach(values=>{const row=document.createElement('tr');const customer=document.createElement('td');const name=document.createElement('b');name.textContent=values[0];const detail=document.createElement('small');detail.textContent=values[1];customer.append(name,detail);row.append(customer);
values.slice(2,4).forEach(value=>{const td=document.createElement('td');td.textContent=value;row.append(td)});
const td=document.createElement('td');const label=document.createElement('span');label.className='preview-status '+values[5];label.textContent=values[4];td.append(label);row.append(td);body.append(row)});
}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();tabs[next].focus();selectTab(tabs[next])})});
