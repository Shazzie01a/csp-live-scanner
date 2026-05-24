// pages/api/login.js
export default async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' })

  try {
    const response = await fetch('https://api.tastytrade.com/sessions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ 
        login: username.trim(), 
        password: password,
        'remember-me': false 
      }),
    })

    // Get raw text first to debug
    const rawText = await response.text()
    
    // Try to parse as JSON
    let data
    try {
      data = JSON.parse(rawText)
    } catch(e) {
      // Not JSON - return the raw response for debugging
      return res.status(500).json({ 
        error: `Tastytrade returned non-JSON response (status ${response.status})`,
        raw: rawText.slice(0, 500)
      })
    }

    if (!response.ok) {
      return res.status(401).json({ 
        error: data?.error?.message || data?.errors?.[0]?.message || `Auth failed: ${response.status}`,
        raw: data
      })
    }

    const token = data.data?.['session-token']
    if (!token) {
      return res.status(401).json({ error: 'No session token in response', raw: data })
    }

    res.status(200).json({ token })
  } catch (err) {
    res.status(500).json({ error: `Fetch failed: ${err.message}` })
  }
}
