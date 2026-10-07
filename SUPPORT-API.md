# External Website Support API

## Submit a ticket or support enquiry

POST `/api/support/capture` accepts public website submissions. It does not require a CRM login or expose CRM records.

```javascript
const response = await fetch('https://your-crm.example/api/support/capture', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Jane Smith',
    email: 'jane@example.com',
    subject: 'Unable to access my account',
    message: 'Please help me restore access.',
    priority: 'Normal',
    category: 'Technical issue',
    source: 'Customer website'
  })
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
console.log(result.reference);
```

Required: name, email, subject, message. Optional: phone, company, source, priority, category. Priorities: Low, Normal, High, Urgent. Categories: Support, Technical issue, Billing, General enquiry.

Success returns HTTP 201 with `id`, `reference`, and `message`. Invalid input returns 400, disallowed browser origin 403, rate limiting 429. Only POST is public. Submitted owner, assignments, status, and permissions are ignored.

## Allow the other website

In the same PowerShell terminal used to start FlowDesk:

```powershell
cd "C:\Users\prave\FlowDesk"
$env:SUPPORT_FORM_ORIGINS = 'https://your-website.example'
.\start-flowdesk.cmd
```

Use the exact scheme and hostname, including port for local development. Multiple origins can be comma-separated. Restart the server after changing this value. Allowed-origin checks apply only to the public submission endpoint; private CRM APIs remain authenticated.

For an internet-hosted website, deploy the Django API at a reachable HTTPS address. A localhost URL only reaches the visitor's own computer. Update `SUPPORT_API_URL` in `javascript/support-form.js` to the hosted endpoint, or adapt the fetch example to your existing form. Do not embed CRM passwords or session tokens in public website code.

## CRM workflow

New tickets are saved in the same database and start with Open status. Open Support Tickets in the sidebar. Administrators see new unassigned tickets; use Assign to select a team and Support users. Support users must be explicitly assigned and support access must remain enabled. Managers see tickets belonging to their teams. Sales users do not see support tickets.

The ticket list refreshes every five seconds. Click a subject to open the record, edit the message/status, and save. This implementation captures and tracks requests; it does not send email replies or attachments yet.

Private endpoints: GET `/api/records/ticket`, GET/PATCH `/api/record/{id}`. These use the existing session and CSRF rules.

## Local test

1. Restart FlowDesk.
2. Open http://127.0.0.1:3000/html/support-form.html and submit the form.
3. Sign in as Admin or Super Admin.
4. Open http://127.0.0.1:3000/html/support-tickets.html.
5. Assign the ticket to a Support user and sign in as that user to verify visibility.

Browser CORS is not an authentication or anti-spam mechanism. Public forms are intentionally public; deployment should include shared rate-limit storage and bot protection.
