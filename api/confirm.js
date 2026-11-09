import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.resend.com';

function validToken(email, expires, signature) {
  if (!process.env.RESEND_API_KEY || !email || !expires || !signature) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = createHmac('sha256', process.env.RESEND_API_KEY).update(`${email}:${expires}`).digest('hex');
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function html(title, message, form = '') {
  return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · Zam</title><body style="margin:0;padding:48px 20px;background:#f7f3ec;font:16px Arial,sans-serif;color:#0f2a20"><main style="max-width:520px;margin:8vh auto;padding:32px;background:white;border-radius:12px"><div style="font-size:30px;font-weight:800">zam<span style="color:#3070B3">.</span></div><h1 style="margin:24px 0 12px">${title}</h1><p style="line-height:1.6">${message}</p>${form}<a href="https://zamspielen.de" style="display:inline-block;margin-top:20px;color:#3070B3">Zur Zam-Website</a></main></body></html>`;
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
    const form = `<form method="POST" action="/api/confirm" style="margin-top:24px"><input type="hidden" name="email" value="${email}"><input type="hidden" name="expires" value="${expires}"><input type="hidden" name="sig" value="${signature}"><button type="submit" style="border:0;border-radius:7px;padding:15px 22px;background:#0F3D2E;color:white;font-size:15px;font-weight:700;cursor:pointer">E-Mail jetzt bestätigen</button></form>`;
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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html('Du bist dabei. 🎾', 'Deine E-Mail-Adresse ist bestätigt und du stehst jetzt auf der Zam-Warteliste. Wir melden uns, sobald es Neuigkeiten gibt.'));
  } catch (error) {
    console.error('Confirmation handler error', error);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(html('Bestätigung fehlgeschlagen', 'Bitte versuche es später erneut.'));
  }
}
