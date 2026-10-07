# Public Website Lead API

FlowDesk already implements public lead capture in Django.

## Endpoint

POST `/api/capture`

Required: name and a valid email. Optional: phone, company, message, source. Send JSON with Content-Type: application/json. CRM login credentials are not required and must not be embedded in a public form.

```javascript
const response = await fetch('https://your-crm.example/api/capture', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '+1 555 0100',
    company: 'Example Company',
    message: 'Please contact me about your services.',
    source: 'Website contact form'
  })
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
console.log(result.id);
```

Success returns HTTP 201 with `id` and `message`. Invalid submissions return 400, blocked browser origins 403, rate limits 429. GET /api/capture is not public. Private GET /api/leads requires authentication and applies record-visibility rules.

## Allow your website

Before starting FlowDesk, configure the exact submitting website origin:

```powershell
cd "C:\Users\prave\FlowDesk"
$env:LEAD_FORM_ORIGINS = 'https://your-website.example'
.\start-flowdesk.cmd
```

Origins include scheme, hostname and port when applicable. Multiple origins can be comma-separated. Restart FlowDesk after changes. CORS applies to this public submission endpoint; it does not open private CRM APIs.

For an internet-hosted website, deploy the Django backend to a reachable HTTPS address and replace `https://your-crm.example` in the example. A localhost address on a visitor's browser points to that visitor's computer, not your CRM server.

## Example form and CRM

Local form: http://127.0.0.1:3000/html/lead-form.html

Captured Leads: http://127.0.0.1:3000/html/captured-leads.html

The example form lives in html/lead-form.html. To use it on another website, change LEAD_API_URL in javascript/lead-form.js to the hosted /api/capture endpoint.

Submissions are saved directly to the Django database, start with New status, and appear in Captured Leads within five seconds. Administrators see unassigned leads first, then assign a team, owner or additional users. Managers see their teams' leads; Sales users see owned or explicitly assigned leads. Public submissions cannot choose an owner, role, team, status or permission.

Leads persist after server restarts. The old Node JSON server is no longer used.

## Scope

The endpoint captures website submissions, not outgoing email. Public forms still need production spam protection; browser CORS is not authentication. See backend/README.md for deployment requirements and SUPPORT-API.md for support-ticket submissions.
