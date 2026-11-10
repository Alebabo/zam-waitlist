import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.resend.com';
const SITE = 'https://zamspielen.de';

function validToken(email, expires, signature) {
  if (!process.env.RESEND_API_KEY || !email || !expires || !signature) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = createHmac('sha256', process.env.RESEND_API_KEY).update(`${email}:${expires}`).digest('hex');
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

function html(title, message, form = '') {
  return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · Zam</title><body style="margin:0;padding:48px 20px;background:#f7f3ec;font:16px Arial,sans-serif;color:#0f2a20"><main style="max-width:520px;margin:8vh auto;padding:32px;background:white;border-radius:12px"><div style="font-size:30px;font-weight:800">zam<span style="color:#3070B3">.</span></div><h1 style="margin:24px 0 12px">${title}</h1><p style="line-height:1.6">${message}</p>${form}<a href="${SITE}" style="display:inline-block;margin-top:20px;color:#3070B3">Zur Zam-Website</a></main></body></html>`;
}

function welcomeEmail() {
  const text = [
    'Hey!',
    '',
    'deine E-Mail-Adresse ist bestätigt und dein Platz auf der Zam-Warteliste ist gesichert.',
    '',
    'Wir freuen uns, dich bald dabei zu haben!',
    '',
    'Dein Zam-Team',
    'zamspielen.de',
  ].join('\\n');

  const body = '<p style="font-size:16px;line-height:1.65;color:#4b5565">Hey! Deine E-Mail-Adresse ist bestätigt und dein Platz auf der Zam-Warteliste ist gesichert.</p><p style="font-size:16px;line-height:1.65;color:#4b5565">Wir freuen uns, dich bald dabei zu haben!</p>';

  const emailHtml = `<div style="margin:0;padding:40px 16px;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#172033"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden"><div style="padding:28px 32px 22px;border-bottom:1px solid #edf0f4"><div style="font-size:28px;font-weight:800;letter-spacing:-1.2px;color:#172033">zam<span style="color:#3070B3">.</span></div></div><div style="padding:34px 32px 30px"><div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#edf4fb;color:#3070B3;font-size:12px;font-weight:700;letter-spacing:.4px">DU BIST DABEI</div><h1 style="margin:20px 0 12px;font-size:27px;line-height:1.2;letter-spacing:-.7px;color:#172033">Willkommen bei zam!</h1>${body}</div><div style="padding:18px 32px;background:#fafbfc;border-top:1px solid #edf0f4"><a href="${SITE}" style="font-size:13px;color:#3070B3;text-decoration:none;font-weight:700">zamspielen.de</a><span style="float:right;font-size:12px;color:#9aa3b2">Zusammen spielen.</span><div style="clear:both;text-align:center;padding-top:22px"><img src="${SITE}/favicon.svg" width="76" height="76" alt="Zam" style="display:block;width:76px;height:76px;margin:0 auto;border:0"></div></div></div></div>`;
  return { text, html: emailHtml };
}

export default async function handler(req, res) {
  const method = req.method;
  const source = method === 'POST' ? (req.body || {}) : (req.query || {});
  const email = String(source.email || '').trim().toLowerCase();
  const expires = String(source.expires || '');
  const signature = String(source.sig || '');

  if (method !== 'GET' && method !== 'POST') return res.status(405).send('Method not allowed');

  if (!validToken(email, expires, signature)) {
    const expired = /^\d+$/.test(expires) && Number(expires) < Date.now();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(html(expired ? 'Link abgelaufen' : 'Link ungültig', expired
      ? 'Bitte melde dich erneut auf zamspielen.de an, um einen neuen Bestätigungslink zu erhalten.'
      : 'Dieser Bestätigungslink ist ungültig oder konnte nicht verifiziert werden.'));
  }

  if (method === 'GET') {
    const form = `<form method="POST" action="/api/confirm" style="margin-top:24px"><input type="hidden" name="email" value="${escapeHtml(email)}"><input type="hidden" name="expires" value="${expires}"><input type="hidden" name="sig" value="${signature}"><button type="submit" style="border:0;border-radius:7px;padding:15px 22px;background:#0F3D2E;color:white;font-size:15px;font-weight:700;cursor:pointer">E-Mail jetzt bestätigen</button></form>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html('Fast geschafft!', 'Klicke auf den Button, um deine E-Mail-Adresse zu bestätigen und deinen Platz auf der Zam-Warteliste zu sichern.', form));
  }

  try {
    const response = await fetch(`${API}/contacts/${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ unsubscribed: false }),
    });

    if (!response.ok) {
      console.error('Resend confirm error', response.status, await response.text());
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(502).send(html('Bestätigung fehlgeschlagen', 'Deine E-Mail konnte gerade nicht bestätigt werden. Bitte versuche es später erneut.'));
    }

    const welcome = welcomeEmail();
    const mailResponse = await fetch(`${API}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `zam-welcome-${expires}-${createHmac('sha256', process.env.RESEND_API_KEY).update(email).digest('hex').slice(0, 16)}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Zam <noreply@zamspielen.de>',
        to: email,
        subject: 'Du bist bei zam dabei! 🎉',
        text: welcome.text,
        html: welcome.html,
      }),
    });

    if (!mailResponse.ok) {
      console.error('Resend welcome email error', mailResponse.status, await mailResponse.text());
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html('Du bist dabei. 🎾', mailResponse.ok
      ? 'Deine E-Mail-Adresse ist bestätigt und du stehst jetzt auf der Zam-Warteliste. Du bekommst gleich noch eine Bestätigungsmail von uns.'
      : 'Deine E-Mail-Adresse ist bestätigt und du stehst jetzt auf der Zam-Warteliste. Die zusätzliche Bestätigungsmail konnte gerade nicht versendet werden.'));
  } catch (error) {
    console.error('Confirmation handler error', error);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(html('Bestätigung fehlgeschlagen', 'Bitte versuche es später erneut.'));
  }
}
