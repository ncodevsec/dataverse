import { config } from '../config.js';

/**
 * Sends email through the Resend HTTP API when RESEND_API_KEY is set (plain fetch - no SDK needed).
 * Without a provider, development prints the message so the reset flow stays testable; production only warns.
 * Swap this one function to use SES / SendGrid / SMTP later.
 */
export async function sendMail({ to, subject, text }) {
  if (config.mail.resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mail.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mail.from, to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Mail provider responded ${res.status}`);
    return { sent: true };
  }
  if (!config.isProd) {
    console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n${text}\n`);
  } else {
    console.warn('[mail] RESEND_API_KEY is not configured; email was not sent. Admins can reset passwords from the Admin Panel.');
  }
  return { sent: false };
}
