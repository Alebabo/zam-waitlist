import { createHmac } from 'node:crypto';

const API = 'https://api.resend.com';
const SITE = 'https://zamspielen.de';
const sign = (value) => createHmac('sha256', process.env.RESEND_API_KEY).update(value).digest('hex');

function confirmationEmail(email) {
  const expires = String(Date.now() + 24 * 60 * 60 * 1000);
  const payload = `${email}:${expires}`;
  const sig = sign(payload);
  const link = `${SITE}/api/confirm?email=${encodeURIComponent(email)}&expires=${expires}&sig=${sig}`;
  const text = [
    'Hey!',
    '',
    'bitte bestätige deine E-Mail-Adresse, damit wir dich auf die Zam-Warteliste setzen können.',
    '',
    `E-Mail bestätigen: ${link}`,
    '',
    'Der Link ist 24 Stunden gültig. Falls du dich nicht angemeldet hast, kannst du diese Mail ignorieren.',
    '',
    'Dein Zam-Team',
    'zamspielen.de',
  ].join('\\n');

  const html = `
    <div style="margin:0;padding:40px 16px;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#172033">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden">
        <div style="padding:28px 32px 22px;border-bottom:1px solid #edf0f4">
          <div style="font-size:28px;font-weight:800;letter-spacing:-1.2px;color:#172033">zam<span style="color:#3070B3">.</span></div>
        </div>
        <div style="padding:34px 32px 30px">
          <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#edf4fb;color:#3070B3;font-size:12px;font-weight:700;letter-spacing:.4px">NOCH EIN SCHRITT</div>
          <h1 style="margin:20px 0 12px;font-size:27px;line-height:1.2;letter-spacing:-.7px;color:#172033">Bestätige deine E-Mail.</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#4b5565">Hey! Schön, dass du bei Zam dabei sein möchtest. Bestätige kurz deine E-Mail-Adresse, damit wir dich auf die Warteliste setzen können.</p>
          <a href="${link}" style="display:inline-block;padding:15px 22px;border-radius:7px;background:#0F3D2E;color:#fff;text-decoration:none;font-size:15px;font-weight:700">E-Mail bestätigen</a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#7b8492">Der Link ist 24 Stunden gültig. Falls du dich nicht angemeldet hast, kannst du diese Mail ignorieren.</p>
        </div>
        <div style="padding:18px 32px;background:#fafbfc;border-top:1px solid #edf0f4">
          <a href="${SITE}" style="font-size:13px;color:#3070B3;text-decoration:none;font-weight:700">zamspielen.de</a>
          <span style="float:right;font-size:12px;color:#9aa3b2">Zusammen spielen.</span>
        </div>
      </div>
    </div>
  `;
  return { text, html, link };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Bitte eine gültige E-Mail eingeben.' });
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('Missing RESEND_API_KEY or RESEND_FROM');
    return res.status(500).json({ error: 'Die Bestätigungsmail ist gerade nicht verfügbar.' });
  }

  const headers = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    const existingResponse = await fetch(`${API}/contacts/${encodeURIComponent(email)}`, { headers });
    if (existingResponse.ok) {
      const contact = await existingResponse.json();
      if (contact.unsubscribed === false) {
        return res.status(200).json({ ok: true, existing: true });
      }
    } else if (existingResponse.status === 404) {
      const created = await fetch(`${API}/contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email,
          // Pending contacts stay unsubscribed until the verification link is clicked.
          unsubscribed: true,
          ...(process.env.RESEND_SEGMENT_ID && { segments: [{ id: process.env.RESEND_SEGMENT_ID }] }),
        }),
      });

      if (!created.ok && created.status !== 409) {
        console.error('Resend contact error', created.status, await created.text());
        return res.status(500).json({ error: 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.' });
      }
    } else {
      console.error('Resend lookup error', existingResponse.status, await existingResponse.text());
      return res.status(500).json({ error: 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.' });
    }

    const mail = confirmationEmail(email);
    const sent = await fetch(`${API}/emails`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Zam <noreply@zamspielen.de>',
        to: email,
        subject: 'Bitte bestätige deine E-Mail für Zam',
        text: mail.text,
        html: mail.html,
      }),
    });

    if (!sent.ok) {
      console.error('Resend confirmation email error', sent.status, await sent.text());
      return res.status(502).json({ error: 'Die Bestätigungsmail konnte nicht versendet werden. Bitte versuche es später erneut.' });
    }

    return res.status(200).json({ ok: true, confirmationRequired: true });
  } catch (error) {
    console.error('Waitlist signup error', error);
    return res.status(500).json({ error: 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.' });
  }
}
