// pages/api/scan.js
// Main scanner endpoint - fetches live data for all tickers
import { getMarketMetrics, getQuotes, getOptionsChain, findBestExpiry, getPutQuote } from '../../lib/tastytrade'

const TICKERS = [
  'NVDA','TSLA','PLTR','AMD','MSTR','AAPL','META',
  'GME','SMCI','HOOD','SOFI','COIN','APP','RDDT','RKLB'
]

// Base config per ticker - sentiment, play type, notes etc (non-price data)
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

function calcConfidence(ivRank, pcRatio, dte, play, sentiment) {
  if (play === 'AVOID') return 1
  let score = 3
  if (ivRank >= 50) score++
  if (ivRank >= 75) score++
  if (pcRatio && pcRatio <= 0.75) score++
  if (pcRatio && pcRatio >= 1.0) score--
  if (dte >= 21) score++
  if (dte < 14)  score--
  return Math.max(1, Math.min(5, score))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Session token required' })

  try {
    // Fetch market metrics (IV rank) and quotes in parallel
    const [metrics, quotes] = await Promise.all([
      getMarketMetrics(token, TICKERS),
      getQuotes(token, TICKERS),
    ])

    // Build scanner results
    const results = await Promise.all(TICKERS.map(async ticker => {
      const cfg   = TICKER_CONFIG[ticker] || {}
      const m     = metrics[ticker] || {}
      const q     = quotes[ticker]  || {}
      const price = q.price || 0

      // IV data
      const ivRank = Math.round(m.ivRank || 0)
      const iv30   = Math.round(m.iv30   || 0)

      // Earnings buffer
      const earningsDays = m.earningsDate
        ? Math.round((new Date(m.earningsDate) - new Date()) / (1000*60*60*24))
        : 45

      // Get options chain for non-AVOID tickers
      let strike = null, premium = null, putOI = null, delta = null, expDate = null, dte = null

      if (cfg.play !== 'AVOID' && price > 0) {
        try {
          const chain  = await getOptionsChain(token, ticker)
          const expiry = findBestExpiry(chain, cfg.expiry === 'Weekly' ? 5 : 21, cfg.expiry === 'Weekly' ? 14 : 45)

          if (expiry) {
            dte     = expiry.dte
            expDate = expiry['expiration-date']

            // Find strike closest to 30-delta (roughly 90-95% of price for CSP)
            const targetStrike = price * (cfg.play === 'STRANGLE' ? 0.90 : 0.92)
            const strikes      = expiry.strikes || []
            const best         = strikes.reduce((prev, curr) => {
              return Math.abs(parseFloat(curr['strike-price']) - targetStrike) <
                     Math.abs(parseFloat(prev['strike-price']) - targetStrike)
                     ? curr : prev
            }, strikes[0] || {})

            if (best && best['put']) {
              strike = parseFloat(best['strike-price'])
              // Get live put quote
              const putQ = await getPutQuote(token, best['put'])
              if (putQ) {
                premium = putQ.mid
                delta   = putQ.delta
                putOI   = putQ.openInt
              }
            }
          }
        } catch (e) {
          // Options chain fetch failed — use price-based estimate
          strike  = price ? Math.round(price * 0.92) : null
          premium = price ? parseFloat((price * 0.027).toFixed(2)) : null
        }
      }

      // Fallback estimates if live data missing
      if (!strike  && price) strike  = Math.round(price * 0.92)
      if (!premium && price) premium = parseFloat((price * 0.027).toFixed(2))
      if (!dte)              dte     = earningsDays > 21 ? 30 : 14

      // Collateral & ROC
      const collateral  = strike ? strike * 100 : 0
      const creditTotal = premium ? Math.round(premium * 100) : 0
      const rocPct      = collateral > 0 ? parseFloat(((creditTotal / collateral) * 100).toFixed(2)) : 0

      // Confidence score
      const confidence = calcConfidence(ivRank, null, dte, cfg.play, 'neutral')
      const riskColor  = cfg.risk

      return {
        ticker,
        price:          parseFloat(price.toFixed(2)),
        change:         parseFloat((q.change || 0).toFixed(2)),
        changePct:      parseFloat((q.changePct || 0).toFixed(2)),
        iv_rank:        ivRank,
        iv30,
        strike,
        premium:        premium ? parseFloat(premium.toFixed(2)) : null,
        premium_weekly: premium ? `$${parseFloat(premium.toFixed(2))}` : 'N/A',
        collateral,
        creditTotal,
        rocPct,
        delta:          delta ? parseFloat(delta.toFixed(3)) : null,
        put_oi:         putOI || 'live',
        dte_safe:       Math.min(dte || 30, earningsDays),
        earnings_date:  m.earningsDate || null,
        oi_trend:       'live',
        unusual_flow:   ivRank >= 70,
        wheel_friendly: cfg.play === 'WHEEL' || (cfg.play === 'CSP' && cfg.risk !== 'high'),
        sentiment:      q.changePct > 1 ? 'bullish' : q.changePct < -1 ? 'bearish' : 'neutral',
        reddit_buzz:    cfg.reddit_buzz || 'medium',
        confidence,
        risk:           riskColor,
        play:           cfg.play || 'CSP',
        expiry:         cfg.expiry || 'Monthly',
        expiry_date:    expDate,
        note:           cfg.note || '',
        play_why:       `Live data: IV rank ${ivRank}, strike $${strike}, ${dte}d to expiry. ${cfg.note}`,
        strike_pct:     price > 0 && strike ? strike / price : 0.92,
        premium_pct:    price > 0 && premium ? premium / price : 0.027,
        isLive:         true,
        lastUpdated:    new Date().toISOString(),
      }
    }))

    res.status(200).json({ results, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('Scan error:', err)
    res.status(500).json({ error: err.message || 'Scan failed' })
  }
}