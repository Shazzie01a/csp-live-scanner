// pages/api/login.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' })

  // Try both production URLs
  const urls = [
    'https://api.tastytrade.com/sessions',
    'https://api.tastyworks.com/sessions',
  ]

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'CSPScanner/1.0',
        },
        body: JSON.stringify({ 
          login: username.trim(), 
          password: password.trim(),
          'remember-me': false 
        }),
      })

      const rawText = await response.text()
      
      let data
      try {
        data = JSON.parse(rawText)
      } catch(e) {
        // This URL returned HTML - try next
        continue
      }

      if (response.ok) {
        const token = data.data?.['session-token']
        if (token) return res.status(200).json({ token, url })
      }

      // Got JSON error back - return it
      return res.status(401).json({ 
        error: data?.error?.message || data?.errors?.[0]?.message || `Auth failed ${response.status}`,
        raw: data,
        url
      })

    } catch (err) {
      continue
    }
  }

  res.status(500).json({ error: 'Could not reach Tastytrade API from server. Try again later.' })
}
