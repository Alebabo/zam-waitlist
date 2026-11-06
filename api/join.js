const API = 'https://api.resend.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Bitte eine gültige E-Mail eingeben.' });
  }

  const headers = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const r = await fetch(`${API}/contacts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      unsubscribed: false,
      ...(process.env.RESEND_SEGMENT_ID && { segments: [{ id: process.env.RESEND_SEGMENT_ID }] }),
    }),
  });

  if (!r.ok) {
    const text = await r.text();
    if (r.status === 409 || /exist/i.test(text)) return res.status(200).json({ ok: true, existing: true });
    console.error('Resend contact error', r.status, text);
    return res.status(500).json({ error: 'Hat nicht geklappt.' });
  }

  // Optionale Bestätigungsmail, nur wenn eine verifizierte Absenderadresse gesetzt ist
  if (process.env.RESEND_FROM) {
    await fetch(`${API}/emails`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: email,
        subject: 'Du bist auf der Zam-Warteliste',
        text: 'Danke für deine Anmeldung. Wir melden uns, sobald die ersten offenen Spiele in München starten.\n\nZam',
      }),
    }).catch((e) => console.error('Resend email error', e));
  }

  return res.status(200).json({ ok: true });
}
