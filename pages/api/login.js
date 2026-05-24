// pages/api/login.js
// Handles Tastytrade authentication - runs server-side only
import { login } from '../../lib/tastytrade'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' })

  try {
    const token = await login(username, password)
    res.status(200).json({ token })
  } catch (err) {
    res.status(401).json({ error: err.message || 'Login failed' })
  }
}