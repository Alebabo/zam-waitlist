import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.resend.com';

function page(title, message, status = 400) {
  return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · Zam</title><body style="margin:0;padding:48px 20px;background:#f7f3ec;font:16px Arial,sans-serif;color:#0f2a20"><main style="max-width:520px;margin:8vh auto;padding:32px;background:white;border-radius:12px"><div style="font-size:30px;font-weight:800">zam<span style="color:#3070B3">.</span></div><h1>${title}</h1><p style="line-height:1.6">${message}</p><a href="https://zamspielen.de" style="color:#3070B3">Zur Zam-Website</a></main></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const email = String(req.query.email || '').trim().toLowerCase();
  const expires = String(req.query.expires || '');
  const signature = String(req.query.sig || '');

  const fail = (title, message, status = 400) => {
    res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(page(title, message));
  };

  if (!process.env.RESEND_API_KEY || !email || !expires || !signature || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail('Link ungültig', 'Dieser Bestätigungslink ist ungültig oder unvollständig.');
  }
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) {
    return fail('Link abgelaufen', 'Bitte melde dich erneut auf zamspielen.de an, um einen neuen Bestätigungslink zu erhalten.');
  }

  const expected = createHmac('sha256', process.env.RESEND_API_KEY).update(`${email}:${expires}`).digest('hex');
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return fail('Link ungültig', 'Dieser Bestätigungslink konnte nicht verifiziert werden.');
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
      return fail('Bestätigung fehlgeschlagen', 'Deine E-Mail konnte gerade nicht bestätigt werden. Bitte versuche es später erneut.', 502);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(page('Du bist dabei. 🎾', 'Deine E-Mail-Adresse ist bestätigt und du stehst jetzt auf der Zam-Warteliste. Wir melden uns, sobald es Neuigkeiten gibt.', 200));
  } catch (error) {
    console.error('Confirmation handler error', error);
    return fail('Bestätigung fehlgeschlagen', 'Bitte versuche es später erneut.', 500);
  }
}
