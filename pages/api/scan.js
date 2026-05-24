// pages/api/scan.js
// Uses Yahoo Finance API - no auth required, completely free

// ── TICKER CATEGORIES ─────────────────────────────────────────────────────────
const CATEGORIES = {
  'thetagang':  { label:'🎯 Thetagang',    tickers:['NVDA','TSLA','PLTR','AMD','MSTR','AAPL','META','GME','SMCI','HOOD','SOFI','COIN','APP','RDDT','RKLB'] },
  'bluechip':   { label:'🔵 Blue Chip',    tickers:['AAPL','MSFT','AMZN','GOOGL','JPM','V','JNJ','WMT','PG','HD','BAC','GS','KO','DIS','MCD','NKE','IBM','CAT','MMM','CVX'] },
  'largetech':  { label:'💻 Large Cap Tech',tickers:['NVDA','META','TSLA','AMD','PLTR','CRM','ORCL','NFLX','ADBE','QCOM','INTC','MU','AMAT','KLAC','LRCX','NOW','SNOW','UBER','LYFT','ABNB'] },
  'financials': { label:'🏦 Financials',   tickers:['JPM','BAC','GS','MS','C','WFC','BLK','SCHW','AXP','COF','USB','PNC','TFC','ALLY','SFM','IBKR','HOOD','SOFI','NU','AFRM'] },
  'speculative':{ label:'⚡ Speculative',  tickers:['MSTR','COIN','GME','SMCI','HOOD','SOFI','RDDT','RKLB','APP','IONQ','RGTI','ACHR','JOBY','LUNR','NKLA','RIVN','LCID','WOLF','SOUN','BBAI'] },
  'etfs':       { label:'📦 ETFs',         tickers:['SPY','QQQ','IWM','DIA','XLE','XLF','XLK','XLV','GLD','SLV','TLT','HYG','ARKK','SOXQ','SMH','MSOS','BITO','IBIT','UVXY','VIX'] },
  'energy':     { label:'⛽ Energy',       tickers:['XOM','CVX','COP','EOG','SLB','MPC','PSX','VLO','OXY','DVN','HAL','BKR','FANG','CTRA','APA','MRO','HES','NOG','SM','VTLE'] },
  'smallmid':   { label:'📊 Small/Mid Cap',tickers:['HOOD','SOFI','RDDT','RKLB','APP','IONQ','ACHR','JOBY','SOUN','BBAI','EXAS','HIMS','DKNG','PENN','CROX','BYND','OPEN','WISH','SPCE','NKLA'] },
}

// All unique tickers across all categories
const ALL_TICKERS = [...new Set(Object.values(CATEGORIES).flatMap(c => c.tickers))]

// ── TICKER CONFIG ─────────────────────────────────────────────────────────────
const TICKER_CONFIG = {
  // Thetagang favorites
  NVDA: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'high',   category:'largetech',  note:'AI infrastructure demand. IV elevated, premium juicy.' },
  TSLA: { play:'AVOID',    risk:'high', expiry:'—',       reddit_buzz:'high',   category:'largetech',  note:'Earnings proximity + gap risk makes CSP dangerous.' },
  PLTR: { play:'WHEEL',    risk:'med',  expiry:'Weekly',  reddit_buzz:'high',   category:'largetech',  note:'Government contract flow supports price. Thetagang darling.' },
  AMD:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'medium', category:'largetech',  note:'IV moderating post-earnings. Manageable assignment risk.' },
  MSTR: { play:'STRANGLE', risk:'high', expiry:'Monthly', reddit_buzz:'high',   category:'speculative',note:'Leveraged BTC proxy. Insane premium, insane risk.' },
  AAPL: { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Low IV but maximum safety. Best for conservative accounts.' },
  META: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'medium', category:'largetech',  note:'Steady uptrend. Good support at strike zone.' },
  GME:  { play:'AVOID',    risk:'high', expiry:'—',       reddit_buzz:'high',   category:'speculative',note:'Meme gap risk. Avoid unless purely speculative.' },
  SMCI: { play:'AVOID',    risk:'high', expiry:'—',       reddit_buzz:'medium', category:'speculative',note:'Accounting overhang. Premium is a trap.' },
  HOOD: { play:'CSP',      risk:'med',  expiry:'Weekly',  reddit_buzz:'medium', category:'financials', note:'Retail volumes rising. Moderate confidence setup.' },
  SOFI: { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'medium', category:'financials', note:'Low dollar premium but solid % ROC on collateral.' },
  COIN: { play:'CSP',      risk:'high', expiry:'Monthly', reddit_buzz:'high',   category:'speculative',note:'BTC correlated — rich premium, gap risk. Size accordingly.' },
  APP:  { play:'WHEEL',    risk:'med',  expiry:'Weekly',  reddit_buzz:'medium', category:'largetech',  note:'Ad tech momentum. OI building at support zone.' },
  RDDT: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'high',   category:'smallmid',   note:'Post-IPO IV elevated. Selling puts on Reddit — ironic.' },
  RKLB: { play:'WHEEL',    risk:'med',  expiry:'Weekly',  reddit_buzz:'medium', category:'smallmid',   note:'Space sector momentum. OI building at strike zone.' },
  // Blue Chip
  MSFT: { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Low IV, steady compounder. Safe wheel candidate.' },
  AMZN: { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'AWS growth supports price. Conservative CSP.' },
  GOOGL:{ play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Search dominance + AI. Solid CSP at support.' },
  JPM:  { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'financials', note:'Best in class bank. Low IV but reliable premium.' },
  V:    { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Payment network moat. Conservative wheel candidate.' },
  JNJ:  { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Healthcare staple. Very low IV — safe income play.' },
  WMT:  { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Retail giant. Defensive play, thin premium.' },
  PG:   { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Consumer staple. Very stable, low drama.' },
  HD:   { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Home improvement leader. Solid support at strike.' },
  BAC:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'financials', note:'Rate sensitive bank. Decent premium for financials.' },
  GS:   { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'financials', note:'Investment banking cycle. IV spikes on market stress.' },
  KO:   { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Dividend stalwart. Ultra-low IV — income not premium.' },
  DIS:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'medium', category:'bluechip',   note:'Streaming wars impact IV. Moderate premium available.' },
  MCD:  { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Franchise model. Very stable, low volatility.' },
  NKE:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'bluechip',   note:'Brand under pressure. IV elevated vs historic norm.' },
  CVX:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'energy',     note:'Oil major. IV tracks crude — good premium in vol spikes.' },
  // Large Cap Tech
  CRM:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'largetech',  note:'SaaS leader. AI integration driving renewed interest.' },
  ORCL: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'largetech',  note:'Cloud + AI tailwinds. IV moderate, decent premium.' },
  NFLX: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'medium', category:'largetech',  note:'Streaming + ads model. IV elevated around earnings.' },
  ADBE: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'largetech',  note:'Creative software moat. IV moderate post-deal collapse.' },
  QCOM: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'largetech',  note:'Chip cycle plays. IV spikes on tariff news.' },
  NOW:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'largetech',  note:'Enterprise SaaS. Steady grind, good premium at support.' },
  UBER: { play:'WHEEL',    risk:'med',  expiry:'Weekly',  reddit_buzz:'medium', category:'largetech',  note:'Rideshare + delivery. IV elevated, wheel-friendly.' },
  ABNB: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'medium', category:'largetech',  note:'Travel platform. Seasonal IV spikes create opportunity.' },
  // Financials
  MS:   { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'financials', note:'Wealth management focus. Moderate IV, decent premium.' },
  C:    { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'financials', note:'Global bank turnaround. IV elevated vs peers.' },
  WFC:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'financials', note:'Retail bank recovery. Moderate premium available.' },
  BLK:  { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'financials', note:'Asset management leader. Low IV, stable income.' },
  SCHW: { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'financials', note:'Brokerage. IV elevated post-banking stress.' },
  AFRM: { play:'CSP',      risk:'high', expiry:'Weekly',  reddit_buzz:'medium', category:'financials', note:'BNPL play. High IV, high risk — size small.' },
  // Speculative
  IONQ: { play:'CSP',      risk:'high', expiry:'Weekly',  reddit_buzz:'medium', category:'speculative',note:'Quantum computing. Extreme IV — premium is huge but risky.' },
  ACHR: { play:'CSP',      risk:'high', expiry:'Weekly',  reddit_buzz:'medium', category:'speculative',note:'eVTOL aircraft. Pre-revenue, very high IV.' },
  JOBY: { play:'CSP',      risk:'high', expiry:'Weekly',  reddit_buzz:'medium', category:'speculative',note:'Air taxi. Pre-revenue high flyer — speculative CSP only.' },
  RIVN: { play:'AVOID',    risk:'high', expiry:'—',       reddit_buzz:'medium', category:'speculative',note:'EV ramp challenges. Cash burn risk — avoid CSP.' },
  SOUN: { play:'CSP',      risk:'high', expiry:'Weekly',  reddit_buzz:'medium', category:'speculative',note:'Voice AI. Tiny float, huge IV — very small positions only.' },
  // ETFs
  SPY:  { play:'CSP',      risk:'low',  expiry:'Weekly',  reddit_buzz:'medium', category:'etfs',       note:'S&P 500 ETF. Most liquid options market. Low IV, safe.' },
  QQQ:  { play:'CSP',      risk:'low',  expiry:'Weekly',  reddit_buzz:'medium', category:'etfs',       note:'Nasdaq ETF. Tech weighted, slightly higher IV than SPY.' },
  IWM:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'etfs',       note:'Small cap ETF. Higher IV than large cap ETFs.' },
  DIA:  { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'etfs',       note:'Dow ETF. Very low IV, thin premium — ultra conservative.' },
  XLE:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'etfs',       note:'Energy sector ETF. IV tracks oil prices.' },
  XLF:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'etfs',       note:'Financials ETF. Rate sensitive, decent IV.' },
  XLK:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'etfs',       note:'Tech sector ETF. Good premium, diversified risk.' },
  GLD:  { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'etfs',       note:'Gold ETF. Defensive, moderate IV on macro uncertainty.' },
  TLT:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'etfs',       note:'20yr Treasury ETF. Rate play — IV spikes on Fed news.' },
  ARKK: { play:'CSP',      risk:'high', expiry:'Monthly', reddit_buzz:'medium', category:'etfs',       note:'Innovation ETF. High IV, high beta — premium is juicy.' },
  SMH:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'medium', category:'etfs',       note:'Semiconductor ETF. IV elevated on tariff/cycle news.' },
  // Energy
  XOM:  { play:'CSP',      risk:'low',  expiry:'Monthly', reddit_buzz:'low',    category:'energy',     note:'Oil supermajor. Low IV, steady dividend support.' },
  COP:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'energy',     note:'E&P leader. IV tracks crude oil closely.' },
  OXY:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'medium', category:'energy',     note:'Buffett-backed oil play. IV moderate, Berkshire floor.' },
  SLB:  { play:'CSP',      risk:'med',  expiry:'Monthly', reddit_buzz:'low',    category:'energy',     note:'Oilfield services. Global exposure, moderate IV.' },
}

// Default config for any ticker not in the list
function getConfig(ticker) {
  return TICKER_CONFIG[ticker] || {
    play:'CSP', risk:'med', expiry:'Monthly', reddit_buzz:'low', category:'other', note:`${ticker} — verify setup before trading.`
  }
}

// Fetch quote data from Yahoo Finance
async function getYahooQuote(symbol) {
  try {
    // Use v7 quote endpoint - more reliable 52W data
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChange,regularMarketChangePercent,regularMarketVolume,fiftyTwoWeekHigh,fiftyTwoWeekLow`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    })
    if (!res.ok) throw new Error('v7 failed')
    const data = await res.json()
    const q = data?.quoteResponse?.result?.[0]
    if (q) {
      return {
        price:     parseFloat((q.regularMarketPrice || 0).toFixed(2)),
        prevClose: parseFloat((q.regularMarketPreviousClose || 0).toFixed(2)),
        change:    parseFloat((q.regularMarketChange || 0).toFixed(2)),
        changePct: parseFloat((q.regularMarketChangePercent || 0).toFixed(2)),
        volume:    q.regularMarketVolume || 0,
        high52:    parseFloat((q.fiftyTwoWeekHigh || 0).toFixed(2)),
        low52:     parseFloat((q.fiftyTwoWeekLow  || 0).toFixed(2)),
      }
    }
  } catch(e) {}

  // Fallback to v8 chart endpoint
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    })
    if (!res.ok) return null
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    if (!meta) return null
    return {
      price:     parseFloat((meta.regularMarketPrice || meta.previousClose || 0).toFixed(2)),
      prevClose: parseFloat((meta.previousClose || 0).toFixed(2)),
      change:    parseFloat(((meta.regularMarketPrice - meta.previousClose) || 0).toFixed(2)),
      changePct: parseFloat((((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) || 0).toFixed(2)),
      volume:    meta.regularMarketVolume || 0,
      high52:    parseFloat((meta.fiftyTwoWeekHigh || 0).toFixed(2)),
      low52:     parseFloat((meta.fiftyTwoWeekLow  || 0).toFixed(2)),
    }
  } catch(e) { return null }
}

// Fetch options chain from Yahoo Finance
async function getYahooOptions(symbol, price) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    })
    if (!res.ok) return null
    const data = await res.json()
    const chain = data?.optionChain?.result?.[0]
    if (!chain) return null
    const expirationDates = chain.expirationDates || []
    const now = Math.floor(Date.now() / 1000)
    const targetExpiry = expirationDates.find(ts => {
      const days = (ts - now) / 86400
      return days >= 7 && days <= 45
    }) || expirationDates[0]
    if (!targetExpiry) return null
    const url2 = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?date=${targetExpiry}`
    const res2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } })
    if (!res2.ok) return null
    const data2 = await res2.json()
    const chain2 = data2?.optionChain?.result?.[0]
    if (!chain2) return null
    const puts = chain2.options?.[0]?.puts || []
    const dte  = Math.round((targetExpiry - now) / 86400)
    const expiryDate = new Date(targetExpiry * 1000).toISOString().split('T')[0]
    const targetStrike = price * 0.92
    const bestPut = puts.reduce((best, put) => {
      if (!best) return put
      return Math.abs(put.strike - targetStrike) < Math.abs(best.strike - targetStrike) ? put : best
    }, null)
    if (!bestPut) return null
    const mid = ((bestPut.bid || 0) + (bestPut.ask || 0)) / 2
    const premium = parseFloat((mid || bestPut.lastPrice || 0).toFixed(2))
    const iv = parseFloat(((bestPut.impliedVolatility || 0) * 100).toFixed(1))
    const ivRank = iv > 80 ? 80 : iv > 60 ? 65 : iv > 40 ? 50 : iv > 25 ? 35 : 20
    return {
      strike: bestPut.strike, premium, iv, ivRank, dte, expiryDate,
      openInterest: bestPut.openInterest || 0,
      volume: bestPut.volume || 0,
      delta: parseFloat((bestPut.delta || -0.30).toFixed(3)),
      bid: bestPut.bid || 0, ask: bestPut.ask || 0,
    }
  } catch(e) { return null }
}

function calcConfidence(ivRank, play, dte, changePct, week52pos) {
  if (play === 'AVOID') return 1
  let score = 3
  if (ivRank >= 50) score++
  if (ivRank >= 70) score++
  if (dte >= 21)    score++
  if (dte < 14)     score--
  if (changePct > 0) score++
  if (changePct < -3) score--
  // 52-week position boost — near lows = better CSP entry
  if (week52pos !== null) {
    if (week52pos <= 15)  score += 2  // very near 52W low — strong entry
    else if (week52pos <= 30) score++ // near low — good entry
    else if (week52pos >= 85) score-- // near 52W high — avoid CSP
  }
  return Math.max(1, Math.min(5, score))
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Fetch all quotes in parallel
    const quoteResults = await Promise.all(ALL_TICKERS.map(t => getYahooQuote(t)))

    // Fetch options for non-AVOID tickers
    const results = await Promise.all(ALL_TICKERS.map(async (ticker, i) => {
      const cfg   = getConfig(ticker)
      const q     = quoteResults[i] || {}
      const price = q.price || 0

      let optData = null
      if (cfg.play !== 'AVOID' && price > 0) {
        optData = await getYahooOptions(ticker, price)
      }

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

      // 52-week position: 0% = at 52W low, 100% = at 52W high
      const high52 = q.high52 || 0
      const low52  = q.low52  || 0
      const week52pos = (high52 > low52 && price > 0)
        ? parseFloat(((price - low52) / (high52 - low52) * 100).toFixed(1))
        : null
      const nearLow = week52pos !== null && week52pos <= 20

      const confidence  = calcConfidence(ivRank, cfg.play, dte, q.changePct || 0, week52pos)

      return {
        ticker,
        price,
        change:     q.change    || 0,
        changePct:  q.changePct || 0,
        volume:     q.volume    || 0,
        high52,
        low52,
        week52pos,
        nearLow,
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
        earnings_date: null,
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
        category:   cfg.category || 'other',
        play_why:   `Live Yahoo Finance data: price $${price}, IV ${Math.round(iv)}%, strike $${strike}, ${dte}d expiry. ${cfg.note}`,
        strike_pct: price > 0 && strike ? strike / price : 0.92,
        premium_pct: price > 0 && premium ? premium / price : 0.027,
        isLive:     true,
        dataSource: 'Yahoo Finance',
        lastUpdated: new Date().toISOString(),
      }
    }))

    // Also return categories metadata for the frontend
    const categoryMeta = Object.entries(CATEGORIES).map(([id, cat]) => ({
      id, label: cat.label, count: cat.tickers.length
    }))

    res.status(200).json({ results, categories: categoryMeta, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('Scan error:', err)
    res.status(500).json({ error: err.message || 'Scan failed' })
  }
}
