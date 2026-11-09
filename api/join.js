const API = 'https://api.resend.com';

const confirmationText = [
  'Hey!',
  '',
  'du bist auf der Zam-Warteliste. Schön, dass du dabei bist!',
  '',
  'Wir bauen Zam, damit du in München unkompliziert Mitspieler findest und bei offenen Spielen dazukommst.',
  'Sobald es Neuigkeiten gibt, melden wir uns bei dir.',
  '',
  'Bis bald auf dem Court,',
  'Dein Zam-Team',
  '',
  'zamspielen.de',
].join('\n');

const confirmationHtml = `
  <div style="margin:0;padding:40px 16px;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#172033">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden">
      <div style="padding:28px 32px 22px;border-bottom:1px solid #edf0f4">
        <div style="font-size:28px;font-weight:800;letter-spacing:-1.2px;color:#172033">zam<span style="color:#3070B3">.</span></div>
      </div>
      <div style="padding:34px 32px 30px">
        <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#edf4fb;color:#3070B3;font-size:12px;font-weight:700;letter-spacing:.4px">WARTELISTE BESTÄTIGT</div>
        <h1 style="margin:20px 0 12px;font-size:27px;line-height:1.2;letter-spacing:-.7px;color:#172033">Du bist dabei. 🎾</h1>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#4b5565">Hey!</p>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#4b5565">du bist auf der Zam-Warteliste. Schön, dass du dabei bist!</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#4b5565">Wir bauen Zam, damit du in München unkompliziert Mitspieler findest und bei offenen Spielen dazukommst. Sobald es Neuigkeiten gibt, melden wir uns bei dir.</p>
        <div style="height:3px;width:48px;border-radius:3px;background:#E37222;margin:0 0 22px"></div>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#172033;font-weight:700">Bis bald auf dem Court,</p>
        <p style="margin:4px 0 0;font-size:15px;color:#4b5565">Dein Zam-Team</p>
      </div>
      <div style="padding:18px 32px;background:#fafbfc;border-top:1px solid #edf0f4">
        <a href="https://zamspielen.de" style="font-size:13px;color:#3070B3;text-decoration:none;font-weight:700">zamspielen.de</a>
        <span style="float:right;font-size:12px;color:#9aa3b2">Zusammen spielen.</span>
      </div>
    </div>
  </div>
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Bitte eine gültige E-Mail eingeben.' });
  }

  const headers = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const existing = await fetch(`${API}/contacts/${encodeURIComponent(email)}`, { headers });
  if (existing.ok) return res.status(200).json({ ok: true, existing: true });

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

  // Send the confirmation only when a verified sender address is configured.
  if (process.env.RESEND_FROM) {
    const sent = await fetch(`${API}/emails`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: email,
        subject: 'Du bist auf der Zam-Warteliste 🎾',
        text: confirmationText,
        html: confirmationHtml,
      }),
    });

    if (!sent.ok) {
      console.error('Resend email error', sent.status, await sent.text());
    }
  }

  return res.status(200).json({ ok: true });
}
