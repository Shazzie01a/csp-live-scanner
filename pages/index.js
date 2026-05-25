import { useState, useMemo, useCallback, useEffect } from 'react'

// ── HELPERS ───────────────────────────────────────────────────────────────────
const ivColor   = v => v>=75?'#ff4d6d':v>=50?'#ffaa00':v>=30?'#7ec8e3':'#aaa'
const sentColor = s => s==='bullish'?'#00e676':s==='bearish'?'#ff4d6d':'#ffaa00'
const sentIcon  = s => s==='bullish'?'▲':s==='bearish'?'▼':'◆'
const riskColor = r => r==='low'?'#00e676':r==='med'?'#ffaa00':'#ff4d6d'
const confColor = c => c>=4?'#00e676':c===3?'#ffaa00':c<=2?'#ff4d6d':'#aaa'
const confStars = c => '●'.repeat(c)+'○'.repeat(5-c)
const playColor = p => p==='CSP'?'#7ec8e3':p==='WHEEL'?'#00e676':p==='STRANGLE'?'#ffaa00':p==='AVOID'?'#ff4d6d':'#aaa'
const playBg    = p => p==='CSP'?'rgba(126,200,227,.12)':p==='WHEEL'?'rgba(0,230,118,.12)':p==='STRANGLE'?'rgba(255,170,0,.12)':p==='AVOID'?'rgba(255,77,109,.12)':'rgba(255,255,255,.05)'

function calcMath(r, contracts = 1) {
  const premium    = r.premium || 0
  const strike     = r.strike  || 0
  const collateral = strike * 100
  const credit     = Math.round(premium * 100)
  const rocPct     = collateral > 0 ? parseFloat(((credit / collateral) * 100).toFixed(2)) : 0
  const rocAnnual  = r.expiry === 'Weekly'
    ? parseFloat((rocPct * 52).toFixed(1))
    : parseFloat((rocPct * 12).toFixed(1))
  const tp = [
    { pct:25, label:'TP1 — 25%',   color:'#7ec8e3', optionPrice:parseFloat((premium*0.75).toFixed(2)), profitPer:Math.round(premium*0.25*100) },
    { pct:50, label:'TP2 — 50% ★', color:'#00e676', optionPrice:parseFloat((premium*0.50).toFixed(2)), profitPer:Math.round(premium*0.50*100) },
    { pct:75, label:'TP3 — 75%',   color:'#aaffaa', optionPrice:parseFloat((premium*0.25).toFixed(2)), profitPer:Math.round(premium*0.75*100) },
  ].map(t => ({
    ...t,
    stockNeeded: parseFloat((strike + (premium - t.optionPrice) / 0.30).toFixed(2)),
    rocAtTP:     parseFloat(((t.profitPer / collateral) * 100).toFixed(2)),
    totalProfit: t.profitPer * contracts,
  }))
  const roll = [
    {
      level:'🟢 ROLL FOR CREDIT', color:'#00e676', mult:0.85,
      action:'Best move — roll now while option is cheap. Sell next expiry for more than you pay to close. Net result: additional credit collected, zero loss.',
      isCredit: true,
    },
    {
      level:'👀 WATCH',           color:'#ffee44', mult:1.00,
      action:'Option back to your original premium. Rolling now is roughly breakeven — no profit on the roll but no loss either. Still a good time to act.',
      isCredit: false,
    },
    {
      level:'⚠️ ROLL NOW',        color:'#ff9900', mult:1.25,
      action:'Small debit to roll. Buy back current put, sell next expiry same/lower strike. Act before it gets worse.',
      isCredit: false,
    },
    {
      level:'🚨 URGENT',          color:'#ff4d6d', mult:1.75,
      action:'Last chance — roll down and out aggressively. Accept a debit or small loss to buy more time and lower your strike.',
      isCredit: false,
    },
  ].map(rv => ({
    ...rv,
    optionPrice:  parseFloat((premium * rv.mult).toFixed(2)),
    stockTrigger: rv.mult <= 1
      ? parseFloat((strike + (premium - premium * rv.mult) / 0.30).toFixed(2))  // stock still above strike
      : parseFloat((strike - (premium * (rv.mult - 1)) / 0.30).toFixed(2)),     // stock approaching/below strike
    netAmount:    rv.isCredit
      ? `+$${Math.round(premium * (1 - rv.mult) * 100) * contracts} credit` // rolling while cheap = credit
      : rv.mult <= 1.01
      ? 'breakeven'
      : `-$${Math.round(premium * (rv.mult - 1) * 100) * contracts} debit`,
  }))
  const stopOptionPrice  = parseFloat((premium * 2).toFixed(2))
  const stopStockTrigger = parseFloat((strike - premium / 0.30).toFixed(2))
  const lossTotal        = credit * contracts
  const maxLossPct       = collateral > 0 ? parseFloat(((credit / collateral) * 100).toFixed(2)) : 0
  return { collateral, credit, rocPct, rocAnnual, tp, roll, stopOptionPrice, stopStockTrigger, lossTotal, maxLossPct }
}

const FILTERS = [
  { id:'all',          label:'All',            fn:()=>true },
  { id:'sweet_spot',   label:'🎯 Sweet Spot',  fn:r=>r.iv_rank>=50 && r.play!=='AVOID' && r.dte_safe>=21 && r.confidence>=3 },
  { id:'near_low',     label:'📉 Near 52W Low',fn:r=>r.week52pos!==null && r.week52pos<=20 && r.play!=='AVOID' },
  { id:'high_conf',    label:'High Confidence',fn:r=>r.confidence>=4 },
  { id:'csp',          label:'CSP',            fn:r=>r.play==='CSP' },
  { id:'wheel',        label:'Wheel',          fn:r=>r.play==='WHEEL' },
  { id:'avoid',        label:'Avoid',          fn:r=>r.play==='AVOID' },
  { id:'high_iv',      label:'IV ≥ 50',        fn:r=>r.iv_rank>=50 },
  { id:'unusual',      label:'Unusual Flow',   fn:r=>r.unusual_flow },
]

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function CSPLiveScanner() {
  const [screen,    setScreen]    = useState('scanner')  // skip login - Yahoo Finance needs no auth
  const [username,  setUsername]  = useState('')
  const [password,  setPassword]  = useState('')
  const [token,     setToken]     = useState(null)
  const [loginErr,  setLoginErr]  = useState('')
  const [loginLoad, setLoginLoad] = useState(false)
  const [results,   setResults]   = useState([])
  const [scanning,  setScanning]  = useState(false)
  const [lastUpdate,setLastUpdate]= useState(null)
  const [scanErr,   setScanErr]   = useState('')
  const [filter,    setFilter]    = useState('sweet_spot')
  const [sortCol,   setSortCol]   = useState('iv_rank')
  const [sortDir,   setSortDir]   = useState('desc')
  const [expanded,  setExpanded]  = useState(null)
  const [contracts, setContracts] = useState(1)
  const [selectedTP,setSelectedTP]= useState(50)
  const [view,      setView]      = useState('cards')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [category,  setCategory]  = useState('all')
  const [categories,setCategories]= useState([])
  const [search,    setSearch]    = useState('')  // search bar

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setLoginErr('')
    setLoginLoad(true)
    try {
      const res = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      setToken(data.token)
      setScreen('scanner')
      runScan(data.token)
    } catch (err) {
      setLoginErr(err.message)
    }
    setLoginLoad(false)
  }

  // ── SCAN ───────────────────────────────────────────────────────────────────
  const runScan = useCallback(async (t) => {
    const tk = t || token
    if (!tk) return
    setScanning(true)
    setScanErr('')
    try {
      const res = await fetch('/api/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: tk }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      setResults(data.results)
      if (data.categories) setCategories(data.categories)
      setLastUpdate(new Date())
    } catch (err) {
      setScanErr(err.message)
    }
    setScanning(false)
  }, [token])

  // Auto-refresh every 5 minutes if enabled
  useEffect(() => {
    if (!autoRefresh || !token) return
    const id = setInterval(() => runScan(token), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [autoRefresh, token, runScan])

  // Auto-scan on first load
  useEffect(() => { runScan("yahoo-finance") }, [])

  const handleSort = col => {
    if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const rows = useMemo(() => {
    const fn = FILTERS.find(f=>f.id===filter)?.fn ?? (()=>true)
    const searchTerm = search.trim().toUpperCase()
    return [...results]
      .filter(fn)
      .filter(r => category === 'all' || r.category === category)
      .filter(r => !searchTerm || r.ticker.includes(searchTerm))
      .sort((a,b) => {
      let av=a[sortCol], bv=b[sortCol]
      if (typeof av==='string') av=av.toLowerCase()
      if (typeof bv==='string') bv=bv.toLowerCase()
      return sortDir==='asc'?(av>bv?1:av<bv?-1:0):(av<bv?1:av>bv?-1:0)
    })
  }, [results, filter, sortCol, sortDir, category, search])

  // ── STYLES ─────────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#080810;-webkit-text-size-adjust:100%}
    input{-webkit-appearance:none;appearance:none}
    .fb{border:1px solid #1e1e30;background:transparent;color:#aaa;padding:6px 12px;border-radius:4px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.05em;transition:all .15s;white-space:nowrap}
    .fb.on{border-color:#7ec8e3;color:#7ec8e3;background:rgba(126,200,227,.08)}
    .fb:hover:not(.on){border-color:#555;color:#fff}
    .vb{border:1px solid #1e1e30;background:transparent;color:#aaa;padding:6px 12px;border-radius:4px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.05em;transition:all .15s}
    .vb.on{border-color:#ffaa00;color:#ffaa00;background:rgba(255,170,0,.07)}
    .th{cursor:pointer;user-select:none;padding:11px 10px;text-align:left;font-weight:700;font-size:11px;letter-spacing:.08em;color:#fff;white-space:nowrap;border-bottom:2px solid #1e1e30}
    .th:hover{color:#7ec8e3}
    .tr{border-bottom:1px solid #0f0f1a;cursor:pointer}
    .tr:hover{background:rgba(255,255,255,.03)}
    .td{padding:10px 10px;white-space:nowrap;font-size:12px;color:#dde}
    .badge{display:inline-block;font-size:10px;padding:3px 8px;border-radius:3px;letter-spacing:.06em;font-weight:700}
    .card{background:#0d0d1c;border:1px solid #1a1a2e;border-radius:10px;padding:14px 16px;margin-bottom:12px;transition:border-color .15s}
    .card.open{border-color:#7ec8e3}
    .cs{background:#111120;border-radius:5px;padding:9px 10px}
    .csl{font-size:9px;color:#fff;font-weight:700;letter-spacing:.1em;margin-bottom:4px}
    .csv{font-size:13px;font-weight:500;color:#dde}
    .play-box{background:#0a0a18;border-radius:8px;padding:12px 14px;margin-top:10px;border-left:3px solid}
    .pl{font-size:9px;font-weight:700;letter-spacing:.12em;margin-bottom:6px}
    .pw{font-size:12px;color:#cce;line-height:1.75}
    .sl-box{background:#0f0a00;border:1px solid rgba(255,153,0,.2);border-radius:8px;padding:12px 14px;margin-top:8px}
    .tp-box{background:#0a120a;border:1px solid rgba(0,230,118,.15);border-radius:8px;padding:12px 14px;margin-top:8px}
    .tp-btn{border:1px solid #1e1e30;background:transparent;color:#aaa;padding:7px 0;border-radius:4px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;font-weight:700;letter-spacing:.06em;transition:all .15s;flex:1;text-align:center}
    .tp-25.on{border-color:#7ec8e3;color:#7ec8e3;background:rgba(126,200,227,.1)}
    .tp-50.on{border-color:#00e676;color:#00e676;background:rgba(0,230,118,.1)}
    .tp-75.on{border-color:#aaffaa;color:#aaffaa;background:rgba(170,255,170,.08)}
    .inp{background:#0d0d1c;border:1px solid #2a2a44;border-radius:6px;color:#fff;font-family:'DM Mono',monospace;font-size:14px;padding:12px 14px;outline:none;width:100%;transition:border-color .15s}
    .inp:focus{border-color:#7ec8e3}
    .search-bar{background:#0d0d1c;border:1px solid #2a2a44;border-radius:6px;color:#fff;font-family:'DM Mono',monospace;font-size:13px;padding:8px 12px;outline:none;width:100%;transition:border-color .15s;letter-spacing:.04em}
    .search-bar:focus{border-color:#7ec8e3}
    .search-bar::placeholder{color:#333}
    .back-to-top{position:fixed;bottom:24px;right:16px;width:44px;height:44px;background:#7ec8e3;border:none;border-radius:50%;color:#080810;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.4);z-index:999;transition:all .15s}
    .back-to-top:hover{background:#a8dff0;transform:translateY(-2px)}
    .live-dot{width:8px;height:8px;border-radius:50%;background:#00e676;display:inline-block;margin-right:6px;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,230,118,.4)}50%{opacity:.7;box-shadow:0 0 0 6px rgba(0,230,118,0)}}
    .spin{animation:spin 1s linear infinite;display:inline-block}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  `

  // ── LOGIN SCREEN ───────────────────────────────────────────────────────────
  if (screen === 'login') return (
    <div style={{fontFamily:"'DM Mono',monospace",background:'#080810',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <style>{css}</style>
      <div style={{width:'100%',maxWidth:400}}>
        <div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,color:'#fff',letterSpacing:'-.02em',marginBottom:4,textAlign:'center'}}>
          CSP <span style={{color:'#7ec8e3'}}>LIVE</span>
        </div>
        <div style={{fontSize:10,color:'#444',letterSpacing:'.1em',textAlign:'center',marginBottom:32}}>
          POWERED BY TASTYTRADE · LIVE OPTIONS DATA
        </div>
        <div style={{background:'#0d0d1c',border:'1px solid #1a1a2e',borderRadius:12,padding:24}}>
          <div style={{fontSize:11,color:'#7ec8e3',fontWeight:700,letterSpacing:'.1em',marginBottom:20}}>
            🔐 TASTYTRADE LOGIN
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:'#fff',fontWeight:700,letterSpacing:'.1em',marginBottom:6}}>USERNAME OR EMAIL</div>
            <input className="inp" type="text" placeholder="your@email.com" value={username}
              onChange={e=>setUsername(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleLogin()} />
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:9,color:'#fff',fontWeight:700,letterSpacing:'.1em',marginBottom:6}}>PASSWORD</div>
            <input className="inp" type="password" placeholder="••••••••" value={password}
              onChange={e=>setPassword(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleLogin()} />
          </div>
          {loginErr && (
            <div style={{color:'#ff4d6d',fontSize:11,marginBottom:12,padding:'8px 12px',background:'rgba(255,77,109,.08)',borderRadius:4,border:'1px solid rgba(255,77,109,.2)'}}>
              ⚠ {loginErr}
            </div>
          )}
          <button onClick={handleLogin} disabled={loginLoad}
            style={{width:'100%',background:'#7ec8e3',color:'#080810',border:'none',borderRadius:6,padding:'13px',fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,cursor:loginLoad?'not-allowed':'pointer',letterSpacing:'.06em',opacity:loginLoad?0.7:1,transition:'all .15s'}}>
            {loginLoad ? '⟳ CONNECTING...' : '→ CONNECT & SCAN'}
          </button>
          <div style={{marginTop:16,fontSize:10,color:'#333',lineHeight:1.7,textAlign:'center'}}>
            🔒 Your credentials are never stored.<br/>
            Used only to get a live session token.<br/>
            Token lives in your browser only.
          </div>
        </div>
      </div>
    </div>
  )

  // ── SCANNER SCREEN ─────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'DM Mono',monospace",background:'#080810',minHeight:'100vh',color:'#dde',padding:0}}>
      <style>{css}</style>

      {/* Header */}
      <div style={{borderBottom:'1px solid #141424'}}>
        <div style={{padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,color:'#fff',letterSpacing:'-.02em'}}>
              CSP <span style={{color:'#7ec8e3'}}>LIVE</span>
              <span style={{fontSize:10,color:'#aaa',fontWeight:400,marginLeft:10,letterSpacing:'.05em'}}>
                {scanning ? <span><span className="spin">⟳</span> SCANNING...</span>
                  : lastUpdate ? <span><span className="live-dot"/>LIVE · {lastUpdate.toLocaleTimeString()}</span>
                  : 'READY'}
              </span>
            </div>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
            <button className={`vb${view==='cards'?' on':''}`} onClick={()=>setView('cards')}>≡ CARDS</button>
            <button className={`vb${view==='table'?' on':''}`} onClick={()=>setView('table')}>⊞ TABLE</button>
            <button onClick={()=>runScan()} disabled={scanning}
              style={{background:'#7ec8e3',color:'#080810',border:'none',padding:'6px 14px',borderRadius:4,fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,cursor:'pointer',letterSpacing:'.06em'}}>
              ↺ REFRESH
            </button>
            <button onClick={()=>{setToken(null);setResults([]);setScreen('login');}}
              style={{background:'transparent',color:'#555',border:'1px solid #222',padding:'6px 12px',borderRadius:4,fontFamily:"'DM Mono',monospace",fontSize:11,cursor:'pointer'}}>
              LOGOUT
            </button>
          </div>
        </div>

        {/* Live banner */}
        <div style={{padding:'7px 16px 8px',background:'rgba(0,230,118,.06)',borderTop:'1px solid rgba(0,230,118,.1)',fontSize:10,color:'#00e676',letterSpacing:'.08em',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span className="live-dot"/>
          <span>LIVE DATA · Yahoo Finance · Real prices, options chain, live premiums · No login required</span>
          <span style={{marginLeft:'auto',color:'#333'}}>
            <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              <input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)}
                style={{cursor:'pointer'}}/>
              <span>Auto-refresh every 5min</span>
            </label>
          </span>
        </div>
      </div>

      {/* Scan error */}
      {scanErr && (
        <div style={{margin:'12px 14px',padding:'10px 14px',background:'rgba(255,77,109,.08)',border:'1px solid rgba(255,77,109,.2)',borderRadius:6,fontSize:11,color:'#ff4d6d'}}>
          ⚠ {scanErr} — <span style={{cursor:'pointer',textDecoration:'underline'}} onClick={()=>runScan()}>retry</span>
        </div>
      )}

      {/* Contracts + TP */}
      <div style={{padding:'12px 14px 0',display:'flex',gap:10,flexWrap:'wrap'}}>
        {/* Contracts */}
        <div style={{background:'#0d0d1c',border:'1px solid #1a1a2e',borderRadius:8,padding:'10px 14px',flex:1,minWidth:200}}>
          <div style={{fontSize:9,color:'#fff',fontWeight:700,letterSpacing:'.1em',marginBottom:8}}>📦 CONTRACTS</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {[1,2,3,5,10].map(n=>(
              <button key={n} onClick={()=>setContracts(n)}
                style={{border:`1px solid ${contracts===n?'#ffaa00':'#1e1e30'}`,background:contracts===n?'rgba(255,170,0,.1)':'transparent',color:contracts===n?'#ffaa00':'#aaa',padding:'6px 14px',borderRadius:4,cursor:'pointer',fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,transition:'all .15s'}}>
                {n}
              </button>
            ))}
            <input type="number" min="1" value={contracts} onChange={e=>{const v=parseInt(e.target.value);if(!isNaN(v)&&v>0)setContracts(v)}}
              style={{background:'#0d0d1c',border:'1px solid #2a2a44',borderRadius:4,color:'#ffaa00',fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,width:60,padding:'5px 8px',outline:'none',textAlign:'center'}}/>
          </div>
        </div>
        {/* TP Selector */}
        <div style={{background:'#0d0d1c',border:'1px solid #1a1a2e',borderRadius:8,padding:'10px 14px',flex:1,minWidth:200}}>
          <div style={{fontSize:9,color:'#fff',fontWeight:700,letterSpacing:'.1em',marginBottom:8}}>✅ TAKE PROFIT TARGET</div>
          <div style={{display:'flex',gap:6}}>
            {[{pct:25,cls:'tp-25'},{pct:50,cls:'tp-50'},{pct:75,cls:'tp-75'}].map(t=>(
              <button key={t.pct} className={`tp-btn ${t.cls}${selectedTP===t.pct?' on':''}`} onClick={()=>setSelectedTP(t.pct)}>
                {t.pct}% PROFIT
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{padding:'10px 14px',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        {FILTERS.map(f=>(
          <button key={f.id} 
            className={`fb${filter===f.id?' on':''}`} 
            onClick={()=>setFilter(f.id)}
            style={f.id==='sweet_spot'?{
              borderColor: filter==='sweet_spot'?'#ffd700':'rgba(255,215,0,.4)',
              color: filter==='sweet_spot'?'#ffd700':'rgba(255,215,0,.7)',
              background: filter==='sweet_spot'?'rgba(255,215,0,.1)':'rgba(255,215,0,.05)',
            }:f.id==='near_low'?{
              borderColor: filter==='near_low'?'#00e676':'rgba(0,230,118,.4)',
              color: filter==='near_low'?'#00e676':'rgba(0,230,118,.7)',
              background: filter==='near_low'?'rgba(0,230,118,.1)':'rgba(0,230,118,.05)',
            }:{}}
          >{f.label}</button>
        ))}
        <span style={{marginLeft:'auto',fontSize:10,color:'#444'}}>{rows.length}/{results.length} tickers</span>
      </div>

      {/* Category Filter */}
      <div style={{padding:'0 14px 10px',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:10,color:'#aaa',letterSpacing:'.08em',marginRight:4}}>SECTOR</span>
        <button className={`fb${category==='all'?' on':''}`} onClick={()=>setCategory('all')}>All Sectors</button>
        {categories.map(c=>(
          <button key={c.id} className={`fb${category===c.id?' on':''}`} onClick={()=>setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div style={{padding:'0 14px 10px',display:'flex',gap:8,alignItems:'center'}}>
        <div style={{position:'relative',flex:1}}>
          <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#444',fontSize:14}}>🔍</span>
          <input
            className="search-bar"
            style={{paddingLeft:30}}
            placeholder="Search ticker e.g. NOW, AAPL..."
            value={search}
            onChange={e=>{setSearch(e.target.value.toUpperCase());setFilter('all');setCategory('all')}}
          />
        </div>
        {search && (
          <button onClick={()=>setSearch('')}
            style={{background:'#2a2a44',border:'none',color:'#aaa',borderRadius:4,padding:'8px 12px',cursor:'pointer',fontFamily:"'DM Mono',monospace",fontSize:11}}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Ticker count */}
      <div style={{padding:'0 14px 8px',fontSize:10,color:'#444'}}>
        Showing <strong style={{color:'#aaa'}}>{rows.length}</strong> of <strong style={{color:'#aaa'}}>{results.length}</strong> tickers
        {search && <span style={{color:'#7ec8e3'}}> · searching "{search}"</span>}
        {!search && category!=='all'&&<span style={{color:'#7ec8e3'}}> · {categories.find(c=>c.id===category)?.label}</span>}
      </div>

      {results.length === 0 && !scanning && (
        <div style={{textAlign:'center',padding:'60px 20px',color:'#333',fontSize:12}}>
          {scanErr ? 'Scan failed — check your connection and retry.' : 'Hit Refresh to load live data.'}
        </div>
      )}

      {/* Back to top button */}
      <button className="back-to-top" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} title="Back to top">
        ↑
      </button>

      {/* ── CARDS VIEW ──────────────────────────────────────────────────────── */}
      {view==='cards' && (
        <div style={{padding:'4px 14px 20px'}}>
          {rows.map(r => {
            const M = calcMath(r, contracts)
            const hasPlay = r.play !== 'AVOID'
            const isOpen  = expanded === r.ticker
            return (
              <div key={r.ticker} className={`card${isOpen?' open':''}`}>
                {/* Ticker header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,cursor:'pointer'}} onClick={()=>setExpanded(isOpen?null:r.ticker)}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    {r.unusual_flow&&<span style={{color:'#ffaa00',fontSize:10}}>⚡</span>}
                    <span style={{color:'#fff',fontWeight:600,fontSize:16}}>{r.ticker}</span>
                    <span style={{color:r.changePct>=0?'#00e676':'#ff4d6d',fontSize:12,fontWeight:500}}>
                      ${r.price} <span style={{fontSize:10}}>{r.changePct>=0?'+':''}{r.changePct?.toFixed(2)}%</span>
                    </span>
                    <span style={{fontSize:9,color:'#333',background:'rgba(0,230,118,.05)',border:'1px solid rgba(0,230,118,.1)',borderRadius:3,padding:'2px 6px'}}>LIVE</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span className="badge" style={{color:riskColor(r.risk),background:`${riskColor(r.risk)}18`,border:`1px solid ${riskColor(r.risk)}40`}}>{r.risk?.toUpperCase()}</span>
                    <span style={{color:confColor(r.confidence),fontSize:12,letterSpacing:2}}>{confStars(r.confidence)}</span>
                  </div>
                </div>

                {/* Play box */}
                <div className="play-box" style={{borderLeftColor:playColor(r.play),background:playBg(r.play)}} onClick={()=>setExpanded(isOpen?null:r.ticker)}>
                  <div className="pl" style={{color:playColor(r.play)}}>RECOMMENDED PLAY</div>
                  <div style={{display:'flex',alignItems:'baseline',gap:12,flexWrap:'wrap',marginBottom:6}}>
                    <span style={{color:playColor(r.play),fontSize:18,fontWeight:700}}>{r.play}</span>
                    {hasPlay&&r.strike&&<span style={{color:'#fff',fontSize:13}}>Strike <strong>${r.strike}</strong></span>}
                    {r.expiry&&r.expiry!=='—'&&<span style={{color:'#cce',fontSize:12}}>{r.expiry}{r.expiry_date?` · ${r.expiry_date}`:''}</span>}
                    {r.delta&&<span style={{color:'#aaa',fontSize:11}}>δ {r.delta}</span>}
                  </div>
                  <div className="pw">{r.play_why}</div>
                </div>

                {/* Trade summary */}
                {hasPlay && r.strike && (
                  <>
                    <div style={{background:'rgba(0,230,118,.06)',border:'1px solid rgba(0,230,118,.15)',borderRadius:8,padding:'12px 14px',marginTop:8}}>
                      <div style={{fontSize:9,color:'#fff',fontWeight:700,letterSpacing:'.12em',marginBottom:10}}>
                        💰 TRADE SUMMARY {contracts>1&&<span style={{color:'#ffaa00'}}>· {contracts} CONTRACTS</span>}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        <div style={{background:'rgba(0,0,0,.3)',borderRadius:6,padding:'8px 10px'}}>
                          <div style={{fontSize:9,color:'#fff',fontWeight:700,letterSpacing:'.08em',marginBottom:3}}>COLLATERAL</div>
                          <div style={{fontSize:16,fontWeight:700,color:'#ffaa00'}}>${(M.collateral*contracts).toLocaleString()}</div>
                          <div style={{fontSize:9,color:'#aaa'}}>${M.collateral.toLocaleString()} × {contracts}</div>
                        </div>
                        <div style={{background:'rgba(0,0,0,.3)',borderRadius:6,padding:'8px 10px'}}>
                          <div style={{fontSize:9,color:'#fff',fontWeight:700,letterSpacing:'.08em',marginBottom:3}}>CREDIT COLLECTED</div>
                          <div style={{fontSize:16,fontWeight:700,color:'#00e676'}}>${(M.credit*contracts).toLocaleString()}</div>
                          <div style={{fontSize:9,color:'#aaa'}}>${M.credit}/contract</div>
                        </div>
                        <div style={{background:'rgba(0,0,0,.3)',borderRadius:6,padding:'8px 10px'}}>
                          <div style={{fontSize:9,color:'#fff',fontWeight:700,letterSpacing:'.08em',marginBottom:3}}>ROC</div>
                          <div style={{fontSize:16,fontWeight:700,color:'#7ec8e3'}}>{M.rocPct}%</div>
                          <div style={{fontSize:9,color:'#aaa'}}>this {r.expiry==='Weekly'?'week':'month'}</div>
                        </div>
                        <div style={{background:'rgba(0,0,0,.3)',borderRadius:6,padding:'8px 10px'}}>
                          <div style={{fontSize:9,color:'#fff',fontWeight:700,letterSpacing:'.08em',marginBottom:3}}>ANNUALIZED ~</div>
                          <div style={{fontSize:16,fontWeight:700,color:'#7ec8e3'}}>{M.rocAnnual}%</div>
                          <div style={{fontSize:9,color:'#aaa'}}>{r.expiry==='Weekly'?'×52':'×12'} if consistent</div>
                        </div>
                      </div>
                    </div>

                    {/* TP levels */}
                    <div className="tp-box">
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:'.12em',color:'#00e676',marginBottom:10}}>✅ TAKE PROFIT LEVELS {contracts>1&&<span style={{color:'#aaa',fontWeight:400}}>({contracts} contracts)</span>}</div>
                      {M.tp.map(t => {
                        const isSel = t.pct === selectedTP
                        // Redeploy math: close at this TP, immediately sell new CSP at current price
                        // New strike = current price * 0.92, new premium = current price * 0.027
                        const newStrike   = r.price > 0 ? Math.round(r.price * 0.92) : 0
                        const newPremium  = r.price > 0 ? parseFloat((r.price * 0.027).toFixed(2)) : 0
                        const newCredit   = Math.round(newPremium * 100) * contracts
                        const closeCost   = Math.round(t.optionPrice * 100) * contracts
                        const lockProfit  = t.profitPer * contracts
                        const netAfterRedeploy = lockProfit + newCredit // profit kept + new credit
                        const vsHolding   = netAfterRedeploy - lockProfit // extra from redeploying
                        return (
                          <div key={t.pct} style={{marginBottom:10,paddingBottom:10,borderBottom:'1px solid rgba(0,230,118,.07)'}}>
                            {/* TP row */}
                            <div style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr 1fr',gap:6,alignItems:'center',marginBottom:6,padding:isSel?'6px 8px':'0',background:isSel?'rgba(0,230,118,.04)':'transparent',borderRadius:isSel?5:0,outline:isSel?`1px solid ${t.color}44`:'none'}}>
                              <div style={{fontSize:10,fontWeight:700,color:t.color}}>{t.label}{isSel&&<span style={{fontSize:8,marginLeft:4}}>← YOU</span>}</div>
                              {[
                                ['BUY BACK',  `$${t.optionPrice}`],
                                ['STK ABOVE', `$${t.stockNeeded}`],
                                ['PROFIT',    `+$${(t.profitPer*contracts).toLocaleString()}`],
                                ['ROC',       `${t.rocAtTP}%`],
                              ].map(([l,v])=>(
                                <div key={l} style={{background:'#0d180d',borderRadius:4,padding:'5px 8px'}}>
                                  <div style={{fontSize:8,color:'#fff',fontWeight:700,letterSpacing:'.08em',marginBottom:2}}>{l}</div>
                                  <div style={{fontSize:12,fontWeight:600,color:t.color}}>{v}</div>
                                </div>
                              ))}
                            </div>

                            {/* Close & Redeploy section */}
                            <div style={{background:'rgba(126,200,227,.05)',border:'1px solid rgba(126,200,227,.15)',borderRadius:6,padding:'8px 10px'}}>
                              <div style={{fontSize:9,color:'#7ec8e3',fontWeight:700,letterSpacing:'.1em',marginBottom:6}}>🔄 CLOSE & REDEPLOY FRESH CSP</div>
                              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6,marginBottom:6}}>
                                <div style={{background:'rgba(0,0,0,.3)',borderRadius:4,padding:'5px 8px'}}>
                                  <div style={{fontSize:8,color:'#fff',fontWeight:700,letterSpacing:'.07em',marginBottom:2}}>LOCK PROFIT</div>
                                  <div style={{fontSize:12,fontWeight:600,color:'#00e676'}}>+${lockProfit.toLocaleString()}</div>
                                </div>
                                <div style={{background:'rgba(0,0,0,.3)',borderRadius:4,padding:'5px 8px'}}>
                                  <div style={{fontSize:8,color:'#fff',fontWeight:700,letterSpacing:'.07em',marginBottom:2}}>NEW STRIKE</div>
                                  <div style={{fontSize:12,fontWeight:600,color:'#7ec8e3'}}>${newStrike}</div>
                                </div>
                                <div style={{background:'rgba(0,0,0,.3)',borderRadius:4,padding:'5px 8px'}}>
                                  <div style={{fontSize:8,color:'#fff',fontWeight:700,letterSpacing:'.07em',marginBottom:2}}>NEW CREDIT</div>
                                  <div style={{fontSize:12,fontWeight:600,color:'#7ec8e3'}}>+${newCredit.toLocaleString()}</div>
                                </div>
                                <div style={{background:'rgba(126,200,227,.08)',border:'1px solid rgba(126,200,227,.2)',borderRadius:4,padding:'5px 8px'}}>
                                  <div style={{fontSize:8,color:'#fff',fontWeight:700,letterSpacing:'.07em',marginBottom:2}}>TOTAL IN POCKET</div>
                                  <div style={{fontSize:12,fontWeight:600,color:'#fff'}}>+${netAfterRedeploy.toLocaleString()}</div>
                                </div>
                              </div>
                              <div style={{fontSize:10,color:'#7a9aaa',lineHeight:1.65}}>
                                Close at ${t.optionPrice} · Lock +${lockProfit} profit · Same ${r.expiry?.toLowerCase()} collateral · Sell new ${r.expiry} CSP at $${newStrike} strike · Collect +${newCredit} fresh credit · <strong style={{color:'#7ec8e3'}}>Total in pocket: +${netAfterRedeploy.toLocaleString()}</strong> vs just closing (+${lockProfit})
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Roll alerts + stop loss */}
                    <div className="sl-box">
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:'.12em',color:'#ff9900',marginBottom:10}}>🔄 ROLL ALERTS — ACT BEFORE THE STOP LOSS</div>

                    {/* Timeline bar */}
                    <div style={{position:'relative',height:5,background:'#1a1408',borderRadius:3,marginBottom:14,overflow:'hidden'}}>
                      <div style={{position:'absolute',left:'0%',width:'21%',height:'100%',background:'#00e676',opacity:.6,borderRadius:3}}/>
                      <div style={{position:'absolute',left:'21%',width:'12%',height:'100%',background:'#ffee44',opacity:.7}}/>
                      <div style={{position:'absolute',left:'33%',width:'22%',height:'100%',background:'#ff9900',opacity:.8}}/>
                      <div style={{position:'absolute',left:'55%',width:'22%',height:'100%',background:'#ff6600'}}/>
                      <div style={{position:'absolute',left:'77%',width:'23%',height:'100%',background:'#ff4d6d'}}/>
                    </div>

                    {M.roll.map((rv,i) => (
                      <div key={i} style={{marginBottom:10,paddingBottom:10,borderBottom:i<M.roll.length-1?'1px solid rgba(255,153,0,.08)':'none'}}>
                        <div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr',gap:6,alignItems:'center',marginBottom:6}}>
                          <div style={{fontSize:10,fontWeight:700,color:rv.color,minWidth:140,whiteSpace:'nowrap'}}>{rv.level}</div>
                          <div style={{background:'rgba(0,0,0,.3)',borderRadius:4,padding:'5px 8px'}}>
                            <div style={{fontSize:8,color:'#fff',fontWeight:700,letterSpacing:'.08em',marginBottom:2}}>OPT PRICE</div>
                            <div style={{fontSize:12,fontWeight:600,color:rv.color}}>${rv.optionPrice}</div>
                          </div>
                          <div style={{background:'rgba(0,0,0,.3)',borderRadius:4,padding:'5px 8px'}}>
                            <div style={{fontSize:8,color:'#fff',fontWeight:700,letterSpacing:'.08em',marginBottom:2}}>STOCK ~</div>
                            <div style={{fontSize:12,fontWeight:600,color:rv.color}}>${rv.stockTrigger}</div>
                          </div>
                          <div style={{background:rv.isCredit?'rgba(0,230,118,.08)':'rgba(255,153,0,.08)',borderRadius:4,padding:'5px 8px',border:`1px solid ${rv.isCredit?'rgba(0,230,118,.2)':'rgba(255,153,0,.15)'}`}}>
                            <div style={{fontSize:8,color:'#fff',fontWeight:700,letterSpacing:'.08em',marginBottom:2}}>{rv.isCredit?'NET CREDIT':'NET COST'}</div>
                            <div style={{fontSize:12,fontWeight:600,color:rv.isCredit?'#00e676':rv.netAmount==='breakeven'?'#ffee44':'#ffaa00'}}>{rv.netAmount}</div>
                          </div>
                        </div>
                        <div style={{fontSize:11,color:'#ccb',lineHeight:1.65,paddingLeft:2}}>{rv.action}</div>
                      </div>
                    ))}
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:'.12em',color:'#ff4d6d',marginBottom:8,marginTop:10,paddingTop:10,borderTop:'1px solid rgba(255,77,109,.15)'}}>🛑 STOP LOSS — IF YOU MISSED THE ROLLS</div>
                    <div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr',gap:6,alignItems:'center'}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#ff4d6d',minWidth:140}}>Close position</div>
                      {[
                        ['OPT HITS',  `$${M.stopOptionPrice}`],
                        ['STOCK ~',   `$${M.stopStockTrigger}`],
                        ['TOTAL LOSS',`-$${M.lossTotal.toLocaleString()}`],
                      ].map(([l,v])=>(
                        <div key={l} style={{background:'rgba(30,0,0,.5)',borderRadius:4,padding:'5px 8px'}}>
                          <div style={{fontSize:8,color:'#fff',fontWeight:700,letterSpacing:'.08em',marginBottom:2}}>{l}</div>
                          <div style={{fontSize:12,fontWeight:600,color:l==='TOTAL LOSS'?'#ffaa00':'#ff4d6d'}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:10,color:'#aa8',marginTop:8,lineHeight:1.6}}>{M.maxLossPct}% of collateral at risk if stop hit.</div>
                  </div>
                  </>
                )}

                {/* Stats grid */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:10,cursor:'pointer'}} onClick={()=>setExpanded(isOpen?null:r.ticker)}>
                  {[
                    ['IV RANK',    <span style={{color:ivColor(r.iv_rank)}}>{r.iv_rank}</span>],
                    ['IV30',       <span style={{color:'#cce'}}>{r.iv30}%</span>],
                    ['EARN BUF',   <span style={{color:r.dte_safe>=21?'#00e676':r.dte_safe>=14?'#ffaa00':'#ff4d6d'}}>{r.dte_safe}d</span>],
                    ['SENTIMENT',  <span style={{color:sentColor(r.sentiment)}}>{sentIcon(r.sentiment)} {r.sentiment}</span>],
                    ['OI TREND',   <span style={{color:'#00e676',fontSize:11}}>LIVE</span>],
                    ['BUZZ',       <span style={{color:r.reddit_buzz==='high'?'#ff4d6d':r.reddit_buzz==='medium'?'#ffaa00':'#aaa',fontSize:11}}>{r.reddit_buzz?.toUpperCase()}</span>],
                  ].map(([l,v])=>(
                    <div key={l} className="cs"><div className="csl">{l}</div><div className="csv">{v}</div></div>
                  ))}

                  {/* 52-Week Range Bar */}
                  {r.week52pos !== null && r.high52 > 0 && r.low52 > 0 && r.high52 !== r.low52 && (
                    <div className="cs" style={{gridColumn:'1 / -1'}}>
                      <div className="csl" style={{display:'flex',justifyContent:'space-between'}}>
                        <span>52-WEEK RANGE {r.nearLow && <span style={{color:'#00e676',fontSize:9,marginLeft:4}}>● NEAR LOW — good CSP entry</span>}</span>
                        <span style={{color: r.week52pos<=20?'#00e676':r.week52pos>=80?'#ff4d6d':'#ffaa00'}}>{r.week52pos}% from low</span>
                      </div>
                      <div style={{position:'relative',height:6,background:'#1a1a2e',borderRadius:3,marginTop:4,overflow:'hidden'}}>
                        {/* gradient background */}
                        <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,#00e676,#ffaa00,#ff4d6d)',opacity:.25,borderRadius:3}}/>
                        {/* position marker */}
                        <div style={{
                          position:'absolute',top:0,bottom:0,
                          left:`${Math.min(Math.max(r.week52pos,2),98)}%`,
                          width:3,background:'#fff',borderRadius:2,
                          transform:'translateX(-50%)',
                          boxShadow:`0 0 6px ${r.week52pos<=20?'#00e676':r.week52pos>=80?'#ff4d6d':'#ffaa00'}`
                        }}/>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#444',marginTop:3}}>
                        <span>52W Low ${r.low52?.toFixed(2)}</span>
                        <span>Current ${r.price}</span>
                        <span>52W High ${r.high52?.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {isOpen && (
                  <div style={{padding:'12px 14px',background:'#0a0a18',borderTop:'1px solid #141428',fontSize:12,color:'#cce',lineHeight:1.8,borderRadius:'0 0 10px 10px',marginTop:10}}>
                    <strong style={{color:'#7ec8e3'}}>{r.ticker} — Analysis</strong><br/>
                    {r.note}
                    {r.earnings_date && <div style={{marginTop:6,fontSize:10,color:'#ffaa00'}}>📅 Next earnings: {r.earnings_date}</div>}
                    <div style={{marginTop:6,fontSize:10,color:'#00e676',letterSpacing:'.06em'}}>⏱ Live data · {lastUpdate?.toLocaleTimeString()}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── TABLE VIEW ──────────────────────────────────────────────────────── */}
      {view==='table' && (
        <div style={{overflowX:'auto',padding:'4px 14px 20px'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
            <thead>
              <tr>
                {[
                  ['ticker','TICKER'],['play','PLAY'],['strike','STRIKE'],
                  ['confidence','CONF'],['risk','RISK'],['price','PRICE'],
                  ['changePct','CHG%'],['iv_rank','IV RNK'],['premium','PREM'],
                  ['collateral','COLLAT'],['rocPct','ROC%'],['dte_safe','EARN BUF'],
                  ['delta','DELTA'],
                ].map(([key,label])=>(
                  <th key={key} className="th" onClick={()=>handleSort(key)}>
                    {label}{sortCol===key?(sortDir==='desc'?' ↓':' ↑'):''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const M = calcMath(r, contracts)
                const hasPlay = r.play !== 'AVOID'
                return (
                  <>
                    <tr key={r.ticker} className="tr" onClick={()=>setExpanded(expanded===r.ticker?null:r.ticker)}>
                      <td className="td" style={{color:'#fff',fontWeight:600}}>{r.unusual_flow&&<span style={{color:'#ffaa00',marginRight:4}}>⚡</span>}{r.ticker}</td>
                      <td className="td"><span className="badge" style={{color:playColor(r.play),background:playBg(r.play),border:`1px solid ${playColor(r.play)}40`}}>{r.play}</span></td>
                      <td className="td" style={{color:'#fff',fontWeight:500}}>{hasPlay&&r.strike?`$${r.strike}`:'—'}</td>
                      <td className="td"><span style={{color:confColor(r.confidence),fontSize:11,letterSpacing:1}}>{confStars(r.confidence)}</span></td>
                      <td className="td"><span className="badge" style={{color:riskColor(r.risk),background:`${riskColor(r.risk)}18`,border:`1px solid ${riskColor(r.risk)}40`}}>{r.risk?.toUpperCase()}</span></td>
                      <td className="td" style={{color:'#fff',fontWeight:600}}>${r.price}</td>
                      <td className="td" style={{color:r.changePct>=0?'#00e676':'#ff4d6d'}}>{r.changePct>=0?'+':''}{r.changePct?.toFixed(2)}%</td>
                      <td className="td">
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div style={{width:Math.max(r.iv_rank*0.38,3),height:3,background:ivColor(r.iv_rank),borderRadius:2}}/>
                          <span style={{color:ivColor(r.iv_rank)}}>{r.iv_rank}</span>
                        </div>
                      </td>
                      <td className="td" style={{color:'#7ec8e3',fontWeight:500}}>{r.premium?`$${r.premium}`:'—'}</td>
                      <td className="td" style={{color:'#ffaa00',fontWeight:700}}>{hasPlay?`$${(M.collateral*contracts).toLocaleString()}`:'—'}</td>
                      <td className="td" style={{color:'#7ec8e3'}}>{hasPlay?`${M.rocPct}%`:'—'}</td>
                      <td className="td" style={{color:r.dte_safe>=21?'#00e676':r.dte_safe>=14?'#ffaa00':'#ff4d6d'}}>{r.dte_safe}d</td>
                      <td className="td" style={{color:'#aaa'}}>{r.delta||'—'}</td>
                    </tr>
                    {expanded===r.ticker&&(
                      <tr key={r.ticker+'_exp'}>
                        <td colSpan={13} style={{padding:'12px 14px',background:'#0a0a18',borderBottom:'1px solid #0f0f1a',fontSize:12,color:'#cce',lineHeight:1.9}}>
                          <strong style={{color:playColor(r.play)}}>{r.play} · ${r.strike} · {r.expiry}</strong> — {r.play_why}<br/>
                          {hasPlay&&<>
                            <span style={{color:'#ffaa00'}}>💰 Collateral: ${(M.collateral*contracts).toLocaleString()}</span>
                            <span style={{color:'#aaa'}}> · Credit: ${(M.credit*contracts).toLocaleString()} · ROC: {M.rocPct}% · Ann: ~{M.rocAnnual}%</span><br/>
                            <span style={{color:'#00e676'}}>✅ TP50: buy back ${M.tp[1].optionPrice} · profit +${(M.tp[1].profitPer*contracts).toLocaleString()}</span><br/>
                            <span style={{color:'#ff9900'}}>⚠️ Roll Now: opt ${M.roll[1].optionPrice} · stk ~${M.roll[1].stockTrigger}</span><br/>
                            <span style={{color:'#ff4d6d'}}>🛑 Stop: opt ${M.stopOptionPrice} · stk ~${M.stopStockTrigger} · lose -${M.lossTotal.toLocaleString()}</span><br/>
                          </>}
                          <span style={{color:'#555'}}>{r.note}</span>
                          {r.earnings_date&&<span style={{color:'#ffaa00'}}> · Earnings: {r.earnings_date}</span>}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{padding:'8px 14px 28px',fontSize:9,color:'#1e1e30',letterSpacing:'.05em'}}>
        ⚠ Live data via Tastytrade API. Not financial advice. Always verify before trading.
      </div>
    </div>
  )
}
