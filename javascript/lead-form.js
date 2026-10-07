// On another website, set this to your hosted FlowDesk API URL.
const LEAD_API_URL = '/api/capture';
document.querySelector('#lead-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const status = document.querySelector('#form-status');
  button.disabled = true; status.textContent = 'Sending...';
  try {
    const response = await fetch(LEAD_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not send your enquiry.');
    status.textContent = 'Thank you. Your enquiry has been received.'; form.reset();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
