# Connect Your Website to FlowDesk

This guide connects two website features to your existing Django CRM:

| Website feature | Public API endpoint | CRM destination |
| --- | --- | --- |
| Lead/contact enquiry form | POST `/api/capture` | Captured Leads |
| Support/contact-for-help form | POST `/api/support/capture` | Support Tickets |

Both endpoints accept JSON, save submissions directly to the CRM database, and return a receipt. Visitors do not need a FlowDesk account. Private CRM lists and record details still require authenticated, authorized access.

## 1. Choose Your CRM Address

For testing on the same computer, use `http://127.0.0.1:3000`.

For a live website, use your deployed HTTPS CRM address, for example `https://crm.yourcompany.com`. This is a placeholder: replace it with your actual hosted address. The local preview launcher does not publish FlowDesk to the internet. A visitor's browser treats localhost as the visitor's own computer.

The two complete example API addresses are:

```text
https://crm.yourcompany.com/api/capture
https://crm.yourcompany.com/api/support/capture
```

Use these exact paths without a trailing slash.

## 2. Allow Your Website to Submit

Stop the running local server with Ctrl+C. In PowerShell, configure both website-origin settings before restarting:

```powershell
cd "C:\Users\prave\FlowDesk"

$env:LEAD_FORM_ORIGINS = 'https://www.yourcompany.com'
$env:SUPPORT_FORM_ORIGINS = 'https://www.yourcompany.com'

.\start-flowdesk.cmd
```

Replace the example with the origin where your form runs. An origin contains the scheme, hostname, and port if applicable; it does not include a page path or a trailing slash.

`https://yourcompany.com` and `https://www.yourcompany.com` are different origins. Allow both if you serve forms on both:

```powershell
$env:LEAD_FORM_ORIGINS = 'https://yourcompany.com,https://www.yourcompany.com'
$env:SUPPORT_FORM_ORIGINS = 'https://yourcompany.com,https://www.yourcompany.com'
```

For a form running on another local development server, use its exact address, such as `http://127.0.0.1:5500`. Do not open that form as a `file://` page. Serve it through a local web server.

For deployed Django, configure these variables in your hosting environment and restart the service. PowerShell settings above apply only to the current terminal and processes launched from it.

## 3. Add the Lead Form

Place this HTML in your other website. You can change the design and labels; keep the field `name` attributes matching the API.

```html
<form id="lead-form">
  <label>Name <input name="name" autocomplete="name" maxlength="160" required></label>
  <label>Email <input name="email" type="email" autocomplete="email" maxlength="254" required></label>
  <label>Phone <input name="phone" type="tel" maxlength="40"></label>
  <label>Company <input name="company" maxlength="160"></label>
  <label>Message <textarea name="message" maxlength="4000"></textarea></label>
  <input name="source" type="hidden" value="Main website contact form">
  <input name="website" hidden tabindex="-1" autocomplete="off">
  <button type="submit">Send enquiry</button>
  <p data-form-status role="status" aria-live="polite"></p>
</form>
```

| Lead field | Required | Maximum characters |
| --- | --- | --- |
| `name` | Yes | 160 |
| `email` | Yes; valid email address | 254 |
| `phone` | No | 40 |
| `company` | No | 160 |
| `message` | No | 4000 |
| `source` | No | 200 |

The hidden `website` field is a honeypot: leave it empty. It is not where you enter your website address. Use `source` to label where a submission came from.

## 4. Add the Support Form

```html
<form id="support-form">
  <label>Name <input name="name" autocomplete="name" maxlength="160" required></label>
  <label>Email <input name="email" type="email" autocomplete="email" maxlength="254" required></label>
  <label>Subject <input name="subject" maxlength="160" required></label>
  <label>Message <textarea name="message" maxlength="4000" required></textarea></label>
  <label>Category
    <select name="category">
      <option>Support</option>
      <option>Technical issue</option>
      <option>Billing</option>
      <option>General enquiry</option>
    </select>
  </label>
  <label>Priority
    <select name="priority">
      <option>Low</option>
      <option selected>Normal</option>
      <option>High</option>
      <option>Urgent</option>
    </select>
  </label>
  <input name="source" type="hidden" value="Main website support form">
  <input name="website" hidden tabindex="-1" autocomplete="off">
  <button type="submit">Request support</button>
  <p data-form-status role="status" aria-live="polite"></p>
</form>
```

Support requires `name`, valid `email`, `subject`, and `message`. Name and subject have a 160-character limit; email 254; message 4000. Optional phone, company, and source use the same limits as lead capture.

Use category and priority values exactly as shown, including capitalization. Category defaults to `Support`; priority defaults to `Normal` when omitted. To capture a general support enquiry, select `General enquiry`.

## 5. Connect Both Forms With JavaScript

Place the following script after the forms, or load it from a JavaScript file with `defer`. Change `CRM_BASE_URL` to your CRM address.

```javascript
const CRM_BASE_URL = 'https://crm.yourcompany.com';
// For same-computer testing instead:
// const CRM_BASE_URL = 'http://127.0.0.1:3000';

function connectFlowDeskForm(formId, endpoint) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector('[data-form-status]');
    button.disabled = true;
    status.textContent = 'Sending...';

    try {
      const response = await fetch(CRM_BASE_URL + endpoint, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Could not submit your request.');
      }

      status.textContent = result.message +
        (result.reference ? ' Reference: ' + result.reference : '');
      form.reset();
    } catch (error) {
      status.textContent = error instanceof TypeError
        ? 'Could not connect. Please check your connection and try again.'
        : error.message;
    } finally {
      button.disabled = false;
    }
  });
}

connectFlowDeskForm('lead-form', '/api/capture');
connectFlowDeskForm('support-form', '/api/support/capture');
```

No API key, CRM password, login cookie, or CSRF token is needed for these two public submission endpoints. Do not put private credentials in your website's JavaScript. Do not use `mode: 'no-cors'`: it prevents your form from reading the receipt and does not fix server-side origin restrictions.

The example is for text fields. File attachments and automatic email replies are not implemented. If you already have a website form, map its field names to the payload above and retain your own styling.

## 6. Check the Responses

Successful lead capture returns HTTP 201:

```json
{
  "id": "<generated-record-uuid>",
  "message": "Lead captured successfully."
}
```

Successful support capture returns HTTP 201:

```json
{
  "id": "<generated-record-uuid>",
  "reference": "FD-<generated-uppercase-id>",
  "message": "Your support request has been received."
}
```

Errors return an `error` message where handled by the API:

```json
{"error": "Name and valid email are required."}
```

| HTTP status | Meaning | What to check |
| --- | --- | --- |
| 201 | Submission saved | Show the confirmation or support reference |
| 400 | Invalid JSON, fields, or oversized API payload | Required fields, limits, allowed values, JSON body |
| 403 | Website origin not allowed | Origin settings and server restart; the browser may hide the response body |
| 405 | Unsupported method | Use POST rather than GET |
| 429 | Submission rate limit reached | Wait before submitting again |
| 500 or a non-JSON error | Server failure | CRM server logs and database configuration |

The local preview also rejects transport bodies over 1 MB with HTTP 413. The Django API accepts a maximum JSON request body of 16 KB and returns 400 for larger bodies that reach its payload validator. Keep website submissions small.

## 7. Verify the Records in FlowDesk

1. Run FlowDesk and open your website form.
2. Submit a test enquiry with a recognizable name.
3. Sign in to FlowDesk as Super Admin or Admin.
4. Open **Captured Leads** for the enquiry, or **Support Tickets** for the support request.
5. Wait up to five seconds or click Refresh.
6. Use Assign to choose the owner, team, and additional users.
7. Sign in as the assigned user to verify the expected visibility.

Leads start as **New**. Support tickets start as **Open**. Both persist in the Django database after restarting the server.

Unassigned submissions are visible to administrators first. Managers see their assigned teams' records. Sales Executives see owned or explicitly assigned leads. Support users see explicitly assigned support-enabled tickets; assigning a ticket's owner alone is not sufficient for Support visibility. Select the Support user under Additional assignees and keep Permit support access enabled.

Website submissions cannot select a CRM owner, team, role, assignment, or status. These are controlled inside FlowDesk.

## 8. Troubleshooting

**The browser reports "Failed to fetch" or a CORS error.** Verify the CRM URL, that the server is running, and the exact website origin configured for the correct endpoint. Restart after changing environment variables. Check the browser's Network panel for the OPTIONS preflight and POST request. An origin such as `http://localhost:5500` differs from `http://127.0.0.1:5500`.

**Your live HTTPS website calls a local HTTP URL.** Deploy the CRM API with HTTPS and use its public URL. Localhost is only suitable for tests on the same computer.

**A record is saved but not visible to a staff member.** Check first as Admin, then confirm the team/owner/explicit assignments. Support access requires both explicit assignment and the support-access flag.

**The form submits twice.** Keep only one submit handler. Disable the submit button while a request is in progress, as in the example. The APIs do not implement idempotency keys; automatic retries after uncertain network failures can create duplicates.

**A form plugin sends urlencoded data or attachments.** Configure its webhook to send JSON, or map the form submission through your website backend. These endpoints accept text JSON, not multipart uploads. CORS settings apply to browsers; server-to-server senders are responsible for validating their own inbound website forms.

**Private CRM APIs return 401 or 403.** That is expected without a signed-in authorized CRM account. Only the two POST capture endpoints are public; do not connect a public form to GET `/api/leads` or POST `/api/records/lead`.

## 9. Live Deployment Notes

Use the Django backend behind a production HTTPS server with a durable database and backups. Configure the external origins on the hosted service, not only your local terminal. The local Node preview transport is for development.

Public capture is intentionally open for customer submissions. Browser CORS is not authentication and does not prevent non-browser clients from posting. Production should add shared rate-limit storage and bot protection. Match your website's consent/privacy text to the customer information collected and do not collect credentials or payment details through these forms.

## Existing Example Files

| Purpose | FlowDesk file |
| --- | --- |
| Example lead form | `html/lead-form.html` |
| Lead submission script | `javascript/lead-form.js` |
| Example support form | `html/support-form.html` |
| Support submission script | `javascript/support-form.js` |
| Lead CRM page | `html/captured-leads.html` |
| Support CRM page | `html/support-tickets.html` |
| Django API handlers | `backend/crm/views.py` |
| Website-origin settings | `backend/flowdesk/settings.py` |

See `API.md`, `SUPPORT-API.md`, and `backend/README.md` for endpoint-specific and backend details.
