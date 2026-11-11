import { Hono } from 'hono';
import type { AppContext } from '../env';

/**
 * Public, human-readable pages required by the app stores: a privacy policy and account/data deletion
 * instructions. The text describes what this system actually does. It is a DRAFT for the operator to
 * review with a lawyer before publishing; set SUPPORT_EMAIL and OPERATOR_NAME as Worker vars.
 */
export const legalRouter = new Hono<AppContext>();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F7F5EF;color:#202B28;margin:0;line-height:1.6}
main{max-width:720px;margin:0 auto;padding:32px 20px 64px}h1{font-size:28px;line-height:34px;color:#034339}h2{font-size:20px;margin-top:32px}
a{color:#245B50}li{margin:6px 0}.muted{color:#58645F}</style></head><body><main>${body}</main></body></html>`;
}

legalRouter.get('/privacy', (c) => {
  const operator = esc(c.env.OPERATOR_NAME || 'The operator of this DoseSaathi service');
  const email = c.env.SUPPORT_EMAIL ? esc(c.env.SUPPORT_EMAIL) : null;
  const contact = email ? `<a href="mailto:${email}">${email}</a>` : 'the contact address shown on the app’s store listing';
  const html = page(
    'DoseSaathi privacy policy',
    `<h1>DoseSaathi privacy policy</h1>
<p class="muted">Last updated: 11 November 2026</p>
<p>${operator} (“we”) provides DoseSaathi, a medicine reminder app. This page explains what information the app handles.</p>

<h2>If you only use DoseSaathi for your own medicines</h2>
<ul>
<li>Your medicines, schedules, dose history and settings are stored <strong>only on your phone</strong>.</li>
<li>No account is needed and nothing is sent to our servers.</li>
<li>Deleting the app, or using “Delete all my medicines” in Settings, removes this data from the phone.</li>
</ul>

<h2>If you link a family member (family sharing)</h2>
<p>Linking is optional and starts only when you choose it. While a link is active, the following is stored on our server so that it can be passed between the linked phones:</p>
<ul>
<li><strong>The person taking medicines:</strong> the display name you entered, a random device identifier, the list of medicines and schedules on that phone, dose events (taken, skipped, reminded later, not confirmed, course completed) with their times and time zone, the phone’s push notification token, and when the phone last connected.</li>
<li><strong>The caregiver:</strong> email address, display name, a salted hash of the password (never the password itself), sign-in tokens, the relationships and permissions each patient approved, and the plan changes the caregiver sent.</li>
</ul>
<p>A caregiver only sees what the person approved on their own phone, and that approval can be withdrawn at any time. Data travels over HTTPS. It is <strong>not</strong> end-to-end encrypted: it is readable on our server so that it can be delivered.</p>

<h2>What we do not do</h2>
<ul><li>We do not sell personal information or use it for advertising.</li><li>The app contains no advertising or third-party analytics trackers.</li><li>The app does not give medical advice and does not change prescriptions.</li></ul>

<h2>Service providers</h2>
<p>The server runs on Cloudflare (Workers and D1). If push notifications are enabled, wake-up messages containing no medicine or personal details are sent through Google Firebase Cloud Messaging and, on iPhone, Apple’s push service.</p>

<h2>Permissions the app asks for</h2>
<ul><li><strong>Notifications, exact alarms, full-screen alerts:</strong> to ring medicine reminders at the right time.</li><li><strong>Camera:</strong> only to scan a family member’s pairing QR code. No photos are stored or sent.</li></ul>

<h2>Keeping and deleting data</h2>
<ul>
<li>Server data is kept while a link or account exists.</li>
<li>The person taking medicines can remove a caregiver’s access, or use “Stop sharing and delete server data”, which erases everything our server holds for that phone.</li>
<li>A caregiver can delete their account in the app (Profile → Delete my account). See <a href="/delete-account">how to delete your account and data</a>.</li>
</ul>

<h2>Children</h2>
<p>DoseSaathi is not directed at children. An adult should set it up when it is used to care for a child.</p>

<h2>Contact</h2>
<p>Questions or requests about your data: ${contact}.</p>`,
  );
  return c.html(html, 200, { 'Cache-Control': 'public, max-age=3600' });
});

legalRouter.get('/delete-account', (c) => {
  const email = c.env.SUPPORT_EMAIL ? esc(c.env.SUPPORT_EMAIL) : null;
  const contact = email
    ? `email <a href="mailto:${email}">${email}</a> from the address of your account and we will delete it`
    : 'contact us through the address on the app’s store listing and we will delete it';
  const html = page(
    'Delete your DoseSaathi account and data',
    `<h1>Delete your DoseSaathi account and data</h1>
<h2>Caregiver account</h2>
<ol><li>Open DoseSaathi and go to <strong>Profile</strong>.</li><li>Tap <strong>Delete my account</strong>, enter your password and confirm.</li></ol>
<p>This permanently deletes your account, sign-in sessions, your connections to family members and the plan changes you sent. It does not delete medicines stored on a family member’s phone.</p>
<h2>Person taking medicines (family sharing)</h2>
<ol><li>Open DoseSaathi and go to the <strong>Family</strong> tab.</li><li>Tap <strong>Stop sharing and delete server data</strong> and confirm.</li></ol>
<p>This removes every caregiver’s access and deletes everything our server holds for that phone: its display name, device identifier, medicine plan, dose events and push token. Medicines on the phone itself stay until you delete them in Settings or uninstall the app.</p>
<h2>Without the app</h2>
<p>If you can no longer use the app, ${contact}.</p>
<p class="muted">Deletion is immediate and cannot be undone. <a href="/privacy">Privacy policy</a></p>`,
  );
  return c.html(html, 200, { 'Cache-Control': 'public, max-age=3600' });
});
