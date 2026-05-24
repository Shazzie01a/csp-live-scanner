// pages/api/login.js
export default async function handler(req, res) {
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

    const data = await response.json()

    // Return full error details so we can debug
    if (!response.ok) {
      return res.status(401).json({ 
        error: data?.error?.message || data?.errors?.[0]?.message || JSON.stringify(data),
        status: response.status,
        raw: data
      })
    }

    const token = data.data?.['session-token']
    if (!token) {
      return res.status(401).json({ error: 'No session token returned', raw: data })
    }

    res.status(200).json({ token })
  } catch (err) {
    res.status(500).json({ error: `Network error: ${err.message}` })
  }
}
