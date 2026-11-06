export default async function handler(req, res) {
  const headers = { Authorization: `Bearer ${process.env.RESEND_API_KEY}` };
  let count = 0;
  let after = '';

  try {
    for (let i = 0; i < 100; i++) {
      const url = `https://api.resend.com/contacts?limit=100${after ? `&after=${after}` : ''}`;
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      const d = await r.json();
      count += d.data.filter((c) => !c.unsubscribed).length;
      if (!d.has_more || !d.data.length) break;
      after = d.data[d.data.length - 1].id;
    }
  } catch (e) {
    console.error('Resend count error', e);
    return res.status(500).json({ error: 'count failed' });
  }

  // CDN-Cache 60 s, schont das Resend-Rate-Limit
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({ count });
}
