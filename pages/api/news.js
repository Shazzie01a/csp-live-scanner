// pages/api/news.js
// Fetches latest news for a ticker from Yahoo Finance RSS feed
// No auth required — completely free

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { ticker } = req.body
  if (!ticker) return res.status(400).json({ error: 'Ticker required' })

  try {
    // Yahoo Finance RSS feed — free, no auth
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`
    const res2 = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml' }
    })

    if (!res2.ok) return res.status(200).json({ articles: [] })

    const xml = await res2.text()
    const now = Date.now()

    // Parse RSS XML manually — no library needed
    const items = []
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || []

    for (const item of itemMatches.slice(0, 6)) { // max 6 articles
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                         item.match(/<title>(.*?)<\/title>/)
      const linkMatch  = item.match(/<link>(.*?)<\/link>/) ||
                         item.match(/<guid[^>]*>(.*?)<\/guid>/)
      const dateMatch  = item.match(/<pubDate>(.*?)<\/pubDate>/)

      if (!titleMatch) continue

      const title   = titleMatch[1].trim()
      const link    = linkMatch ? linkMatch[1].trim() : `https://finance.yahoo.com/quote/${ticker}/news/`
      const pubDate = dateMatch ? new Date(dateMatch[1]).getTime() : now
      const ageHours = (now - pubDate) / (1000 * 60 * 60)

      // Only include news from last 7 days
      if (ageHours > 168) continue

      items.push({ title, link, ageHours: parseFloat(ageHours.toFixed(1)), pubDate })
    }

    res.status(200).json({ articles: items, ticker })
  } catch (err) {
    console.error('News fetch error:', err)
    res.status(200).json({ articles: [] }) // fail silently
  }
}
