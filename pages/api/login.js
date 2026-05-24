// pages/api/login.js
// No longer needed - using Yahoo Finance (no auth required)
// Kept as passthrough for compatibility
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  // Return a dummy token - Yahoo Finance needs no auth
  res.status(200).json({ token: 'yahoo-finance-no-auth-needed' })
}
