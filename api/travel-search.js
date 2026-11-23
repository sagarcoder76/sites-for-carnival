// Server-side TinyFish proxy. Keep TINYFISH_API_KEY in Vercel Environment Variables;
// never expose it in browser code.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const { from, to, date, mode } = req.body || {};
  const allowed = new Set(['train', 'flight', 'bus', 'cab']);
  const clean = value => typeof value === 'string' ? value.trim().slice(0, 100) : '';
  const origin = clean(from), destination = clean(to), travelDate = clean(date);
  if (!origin || !destination || !allowed.has(mode)) {
    return res.status(400).json({ error: 'Enter a starting point, destination, and travel type.' });
  }
  if (!process.env.TINYFISH_API_KEY) {
    return res.status(503).json({ error: 'Travel search is not configured yet.' });
  }
  const modeLabel = { train: 'train', flight: 'flight', bus: 'bus', cab: 'taxi or cab' }[mode];
  const query = `${modeLabel} ${origin} to ${destination}${travelDate ? ` ${travelDate}` : ''} India booking official`;
  try {
    const endpoint = new URL('https://api.search.tinyfish.ai');
    endpoint.searchParams.set('query', query);
    endpoint.searchParams.set('location', 'IN');
    endpoint.searchParams.set('language', 'en');
    const upstream = await fetch(endpoint, {
      headers: { 'X-API-Key': process.env.TINYFISH_API_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    if (!upstream.ok) {
      console.error('TinyFish search returned', upstream.status);
      return res.status(502).json({ error: 'The travel search provider is temporarily unavailable.' });
    }
    const data = await upstream.json();
    const results = Array.isArray(data.results) ? data.results.slice(0, 8).map(item => ({
      title: String(item.title || item.site_name || 'Travel result').slice(0, 180),
      snippet: String(item.snippet || '').slice(0, 500),
      url: typeof item.url === 'string' && /^https:\/\//i.test(item.url) ? item.url : '',
      source: String(item.site_name || '').slice(0, 100)
    })).filter(item => item.url) : [];
    return res.status(200).json({ query, results, note: 'Web search links only. Availability, fares, and booking are confirmed by the provider.' });
  } catch (error) {
    console.error('TinyFish search failed:', error?.message || error);
    return res.status(502).json({ error: 'Could not search right now. Please try again shortly.' });
  }
}
