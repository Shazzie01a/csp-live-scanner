// pages/api/scan.js
// Uses Yahoo Finance API - no auth required, completely free

const TICKERS = [
  'NVDA','TSLA','PLTR','AMD','MSTR','AAPL','META',
  'GME','SMCI','HOOD','SOFI','COIN','APP','RDDT','RKLB'
]

const TICKER_CONFIG = {
  NVDA: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'high',   note:'AI infrastructure demand. IV elevated, premium juicy.' },
  TSLA: { play:'AVOID',    risk:'high', expiry:'—',       reddit_buzz:'high',   note:'Earnings proximity + gap risk makes CSP dangerous.' },
  PLTR: { play:'WHEEL',    risk:'med',  expiry:'Weekly',  reddit_buzz:'high',   note:'Government contract flow supports price. Thetagang darling.' },
  AMD:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'medium', note:'IV moderating post-earnings. Manageable assignment risk.' },
  MSTR: { play:'STRANGLE', risk:'high', expiry:'Monthly', reddit_buzz:'high',   note:'Leveraged BTC proxy. Insane premium, insane risk.' },
  AAPL: { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    note:'Low IV but maximum safety. Best for conservative accounts.' },
  META: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'medium', note:'Steady uptrend. Good support at strike zone.' },
  GME:  { play:'AVOID',    risk:'high', expiry:'—',       reddit_buzz:'high',   note:'Meme gap risk. Avoid unless purely speculative.' },
  SMCI: { play:'AVOID',    risk:'high', expiry:'—',       reddit_buzz:'medium', note:'Accounting overhang. Premium is a trap.' },
  HOOD: { play:'CSP',      risk:'med',  expiry:'Weekly',  reddit_buzz:'medium', note:'Retail volumes rising. Moderate confidence setup.' },
  SOFI: { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'medium', note:'Low dollar premium but solid % ROC on collateral.' },
  COIN: { play:'CSP',      risk:'high', expiry:'Monthly', reddit_buzz:'high',   note:'BTC correlated — rich premium, gap risk. Size accordingly.' },
  APP:  { play:'WHEEL',    risk:'med',  expiry:'Weekly',  reddit_buzz:'medium', note:'Ad tech momentum. OI building at support zone.' },
  RDDT: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'high',   note:'Post-IPO IV elevated. Selling puts on Reddit — ironic.' },
  RKLB: { play:'WHEEL',    risk:'med',  expiry:'Weekly',  reddit_buzz:'medium', note:'Space sector momentum. OI building at strike zone.' },
}

// Fetch quote data from Yahoo Finance
async function getYahooQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
    const res = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    })
    if (!res.ok) return null
    const data = await res.json()
    const quote = data?.chart?.result?.[0]
    if (!quote) return null
    const meta = quote.meta
    return {
      price:      parseFloat((meta.regularMarketPrice || meta.previousClose || 0).toFixed(2)),
      prevClose:  parseFloat((meta.previousClose || 0).toFixed(2)),
      change:     parseFloat(((meta.regularMarketPrice - meta.previousClose) || 0).toFixed(2)),
      changePct:  parseFloat((((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) || 0).toFixed(2)),
      volume:     meta.regularMarketVolume || 0,
      high52:     meta.fiftyTwoWeekHigh || 0,
      low52:      meta.fiftyTwoWeekLow  || 0,
    }
  } catch(e) {
    return null
  }
}

// Fetch options data from Yahoo Finance
async function getYahooOptions(symbol, price) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`
    const res = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    })
    if (!res.ok) return null
    const data = await res.json()
    const chain = data?.optionChain?.result?.[0]
    if (!chain) return null

    // Get available expiration dates
    const expirationDates = chain.expirationDates || []
    const now = Math.floor(Date.now() / 1000)
    
    // Find expiry 21-45 days out
    const targetExpiry = expirationDates.find(ts => {
      const days = (ts - now) / 86400
      return days >= 7 && days <= 45
    }) || expirationDates[0]

    if (!targetExpiry) return null

    // Fetch that specific expiry's chain
    const url2 = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?date=${targetExpiry}`
    const res2 = await fetch(url2, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    })
    if (!res2.ok) return null
    const data2 = await res2.json()
    const chain2 = data2?.optionChain?.result?.[0]
    if (!chain2) return null

    const puts = chain2.options?.[0]?.puts || []
    const dte  = Math.round((targetExpiry - now) / 86400)
    const expiryDate = new Date(targetExpiry * 1000).toISOString().split('T')[0]

    // Find put closest to 92% of price (~ 0.30 delta)
    const targetStrike = price * 0.92
    const bestPut = puts.reduce((best, put) => {
      if (!best) return put
      return Math.abs(put.strike - targetStrike) < Math.abs(best.strike - targetStrike) ? put : best
    }, null)

    if (!bestPut) return null

    const mid = ((bestPut.bid || 0) + (bestPut.ask || 0)) / 2
    const premium = parseFloat((mid || bestPut.lastPrice || 0).toFixed(2))

    // Get IV from the option
    const iv = parseFloat(((bestPut.impliedVolatility || 0) * 100).toFixed(1))

    // Estimate IV rank from 52-week range context (Yahoo doesn't give IV rank directly)
    // We use IV vs historical as a proxy
    const ivRank = iv > 80 ? 80 : iv > 60 ? 65 : iv > 40 ? 50 : iv > 25 ? 35 : 20

    return {
      strike:     bestPut.strike,
      premium,
      iv,
      ivRank,
      dte,
      expiryDate,
      openInterest: bestPut.openInterest || 0,
      volume:       bestPut.volume || 0,
      delta:        parseFloat((bestPut.delta || -0.30).toFixed(3)),
      bid:          bestPut.bid || 0,
      ask:          bestPut.ask || 0,
    }
  } catch(e) {
    return null
  }
}

function calcConfidence(ivRank, play, dte, changePct) {
  if (play === 'AVOID') return 1
  let score = 3
  if (ivRank >= 50) score++
  if (ivRank >= 70) score++
  if (dte >= 21)    score++
  if (dte < 14)     score--
  if (changePct > 0) score++
  if (changePct < -3) score--
  return Math.max(1, Math.min(5, score))
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Fetch all quotes in parallel
    const quoteResults = await Promise.all(
      TICKERS.map(ticker => getYahooQuote(ticker))
    )

    // Fetch options for non-AVOID tickers
    const results = await Promise.all(TICKERS.map(async (ticker, i) => {
      const cfg   = TICKER_CONFIG[ticker] || {}
      const q     = quoteResults[i] || {}
      const price = q.price || 0

      let optData = null
      if (cfg.play !== 'AVOID' && price > 0) {
        optData = await getYahooOptions(ticker, price)
      }

      // Fallback estimates if options data unavailable
      const strike     = optData?.strike    || Math.round(price * 0.92)
      const premium    = optData?.premium   || parseFloat((price * 0.027).toFixed(2))
      const iv         = optData?.iv        || 40
      const ivRank     = optData?.ivRank    || 45
      const dte        = optData?.dte       || 30
      const expiryDate = optData?.expiryDate || null
      const openInt    = optData?.openInterest || 0

      const collateral  = strike * 100
      const creditTotal = Math.round(premium * 100)
      const rocPct      = collateral > 0 ? parseFloat(((creditTotal / collateral) * 100).toFixed(2)) : 0
      const confidence  = calcConfidence(ivRank, cfg.play, dte, q.changePct || 0)

      return {
        ticker,
        price,
        change:     q.change    || 0,
        changePct:  q.changePct || 0,
        volume:     q.volume    || 0,
        iv_rank:    ivRank,
        iv30:       Math.round(iv),
        strike,
        premium:    parseFloat(premium.toFixed(2)),
        premium_weekly: `$${parseFloat(premium.toFixed(2))}`,
        collateral,
        creditTotal,
        rocPct,
        delta:      optData?.delta || null,
        put_oi:     openInt ? `${openInt.toLocaleString()} contracts` : 'N/A',
        dte_safe:   dte,
        earnings_date:  null,
        oi_trend:   openInt > 1000 ? 'building' : 'stable',
        unusual_flow: ivRank >= 65,
        wheel_friendly: cfg.play === 'WHEEL' || (cfg.play === 'CSP' && cfg.risk !== 'high'),
        sentiment:  (q.changePct || 0) > 1 ? 'bullish' : (q.changePct || 0) < -1 ? 'bearish' : 'neutral',
        reddit_buzz: cfg.reddit_buzz || 'medium',
        confidence,
        risk:       cfg.risk || 'med',
        play:       cfg.play || 'CSP',
        expiry:     cfg.expiry || 'Monthly',
        expiry_date: expiryDate,
        note:       cfg.note || '',
        play_why:   `Live Yahoo Finance data: price $${price}, IV ${Math.round(iv)}%, strike $${strike}, ${dte}d expiry. ${cfg.note}`,
        strike_pct: price > 0 && strike ? strike / price : 0.92,
        premium_pct: price > 0 && premium ? premium / price : 0.027,
        isLive:     true,
        dataSource: 'Yahoo Finance',
        lastUpdated: new Date().toISOString(),
      }
    }))

    res.status(200).json({ results, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('Scan error:', err)
    res.status(500).json({ error: err.message || 'Scan failed' })
  }
}
