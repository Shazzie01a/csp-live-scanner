// lib/tastytrade.js
// All Tastytrade API calls live here - server side only

const BASE_URL = 'https://api.tastytrade.com'

// ── AUTH ──────────────────────────────────────────────────────────────────────
export async function login(username, password) {
  const res = await fetch(`${BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: username, password, 'remember-me': false }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || 'Login failed — check your username and password')
  }
  const data = await res.json()
  return data.data['session-token']
}

// ── MARKET METRICS (IV Rank, IV Percentile) ───────────────────────────────────
export async function getMarketMetrics(sessionToken, symbols) {
  const query = symbols.map(s => `symbols[]=${encodeURIComponent(s)}`).join('&')
  const res = await fetch(`${BASE_URL}/market-metrics?${query}`, {
    headers: {
      'Authorization': sessionToken,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error('Failed to fetch market metrics')
  const data = await res.json()
  // Returns map of symbol -> { iv-rank, iv-percentile, ... }
  const metrics = {}
  for (const item of data.data.items) {
    metrics[item.symbol] = {
      ivRank:       parseFloat(item['implied-volatility-index-rank'] || 0) * 100,
      ivPercentile: parseFloat(item['implied-volatility-percentile'] || 0) * 100,
      iv30:         parseFloat(item['implied-volatility-index'] || 0) * 100,
      dividendYield:parseFloat(item['dividend-rate-per-share'] || 0),
      beta:         parseFloat(item['beta'] || 0),
      corr:         parseFloat(item['corr-spy-3month'] || 0),
      earningsDate: item['earnings'] ? item['earnings']['expected-report-date'] : null,
    }
  }
  return metrics
}

// ── LIVE QUOTES (price) ───────────────────────────────────────────────────────
export async function getQuotes(sessionToken, symbols) {
  // Use market-data/by-type endpoint for equity quotes
  const query = symbols.map(s => `symbols[]=${encodeURIComponent(s)}`).join('&')
  const res = await fetch(`${BASE_URL}/market-data/by-type/equities?${query}`, {
    headers: {
      'Authorization': sessionToken,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error('Failed to fetch quotes')
  const data = await res.json()
  const quotes = {}
  for (const item of (data.data?.items || [])) {
    quotes[item.symbol] = {
      price: parseFloat(item['last'] || item['mark'] || item['close'] || 0),
      bid:   parseFloat(item['bid'] || 0),
      ask:   parseFloat(item['ask'] || 0),
      change: parseFloat(item['net-change'] || 0),
      changePct: parseFloat(item['net-change-in-percent'] || 0),
      volume: parseInt(item['volume'] || 0),
    }
  }
  return quotes
}

// ── OPTIONS CHAIN (find best CSP strike near 0.30 delta) ─────────────────────
export async function getOptionsChain(sessionToken, symbol) {
  const res = await fetch(
    `${BASE_URL}/option-chains/${encodeURIComponent(symbol)}/nested`,
    {
      headers: {
        'Authorization': sessionToken,
        'Content-Type': 'application/json',
      },
    }
  )
  if (!res.ok) throw new Error(`Failed to fetch options chain for ${symbol}`)
  const data = await res.json()
  return data.data?.items?.[0] || null
}

// ── FIND BEST CSP STRIKE ──────────────────────────────────────────────────────
// Finds the nearest weekly/monthly expiry with 21-45 DTE
// and the put strike closest to 0.30 delta
export function findBestExpiry(chain, targetDTEMin = 21, targetDTEMax = 45) {
  if (!chain?.expirations) return null
  const now = new Date()
  const valid = chain.expirations
    .map(exp => ({
      ...exp,
      dte: Math.round((new Date(exp['expiration-date']) - now) / (1000 * 60 * 60 * 24)),
    }))
    .filter(exp => exp.dte >= targetDTEMin && exp.dte <= targetDTEMax)
    .sort((a, b) => a.dte - b.dte)
  return valid[0] || null
}

// ── GET PUT PREMIUM FOR STRIKE ─────────────────────────────────────────────────
export async function getPutQuote(sessionToken, putSymbol) {
  // putSymbol looks like: "PLTR  241115P00034000"
  const encoded = encodeURIComponent(putSymbol)
  const res = await fetch(
    `${BASE_URL}/market-data/by-type/options?symbols[]=${encoded}`,
    {
      headers: {
        'Authorization': sessionToken,
        'Content-Type': 'application/json',
      },
    }
  )
  if (!res.ok) return null
  const data = await res.json()
  const item = data.data?.items?.[0]
  if (!item) return null
  return {
    bid:        parseFloat(item['bid'] || 0),
    ask:        parseFloat(item['ask'] || 0),
    mid:        parseFloat(item['mid'] || ((parseFloat(item['bid']||0) + parseFloat(item['ask']||0)) / 2)),
    iv:         parseFloat(item['implied-volatility'] || 0) * 100,
    delta:      parseFloat(item['delta'] || 0),
    theta:      parseFloat(item['theta'] || 0),
    openInt:    parseInt(item['open-interest'] || 0),
    volume:     parseInt(item['volume'] || 0),
  }
}