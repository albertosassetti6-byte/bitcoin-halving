/* ============================================================
 * BTC://TERMINAL — Bitcoin Halving Countdown
 * script.js
 * ------------------------------------------------------------
 *  - Stima l'altezza del blocco corrente (10 min/blocco)
 *  - Sincronizzazione opzionale con mempool.space
 *  - Countdown live al prossimo halving
 *  - Terminale interattivo con comandi
 * ============================================================ */

(() => {
  'use strict';

  /* ----------------------------------------------------------
   * 1. COSTANTI
   * -------------------------------------------------------- */
  const BLOCK_MS        = 10 * 60 * 1000;   // 10 minuti
  const HALVING_EVERY   = 210000;           // blocchi
  const INITIAL_SUBSIDY = 50;               // BTC
  const MAX_LINES       = 400;              // buffer del log
  const LS_MANUAL       = 'btc-terminal::manual-block';

  const API_HEIGHT = 'https://mempool.space/api/blocks/tip/height';
  const API_PRICES = 'https://mempool.space/api/v1/prices';

  // Blocco noto con timestamp certo: #840.000 (4° halving)
  const REFERENCE = { height: 840000, time: Date.UTC(2024, 3, 20, 0, 9, 27) };

  // Fallback se data/halvings.json non è raggiungibile (es. apertura via file://)
  const FALLBACK = [
    [0,  0,       '2009-01-03', 50],
    [1,  210000,  '2012-11-28', 25],
    [2,  420000,  '2016-07-09', 12.5],
    [3,  630000,  '2020-05-11', 6.25],
    [4,  840000,  '2024-04-20', 3.125],
    [5,  1050000, '2028-04-17', 1.5625],
    [6,  1260000, '2032-04-15', 0.78125],
    [7,  1470000, '2036-04-12', 0.390625],
    [8,  1680000, '2040-04-09', 0.1953125],
    [9,  1890000, '2044-04-07', 0.09765625],
    [10, 2100000, '2048-04-04', 0.048828125],
    [11, 2310000, '2052-04-01', 0.0244140625],
    [12, 2520000, '2056-03-30', 0.01220703125],
    [13, 2730000, '2060-03-27', 0.006103515625],
    [14, 2940000, '2064-03-24', 0.0030517578125],
    [15, 3150000, '2068-03-22', 0.00152587890625],
    [16, 3360000, '2072-03-19', 0.000762939453125],
    [17, 3570000, '2076-03-16', 0.0003814697265625],
    [18, 3780000, '2080-03-14', 0.00019073486328125],
    [19, 3990000, '2084-03-11', 0.000095367431640625],
    [20, 4200000, '2088-03-08', 0.0000476837158203125],
    [21, 4410000, '2092-03-06', 0.00002384185791015625],
    [22, 4620000, '2096-03-03', 0.000011920928955078125],
    [23, 4830000, '2100-03-01', 0.0000059604644775390625],
    [24, 5040000, '2104-02-27', 0.0000029802322387695312],
    [25, 5250000, '2108-02-24', 0.0000014901161193847656],
    [26, 5460000, '2112-02-21', 0.0000007450580596923828],
    [27, 5670000, '2116-02-19', 0.0000003725290298461914],
    [28, 5880000, '2120-02-16', 0.0000001862645149230957],
    [29, 6090000, '2124-02-13', 0.00000009313225746154785],
    [30, 6300000, '2128-02-11', 0.00000004656612873077393],
    [31, 6510000, '2132-02-08', 0.000000023283064365386963],
    [32, 6720000, '2136-02-05', 0.000000011641532182693481],
    [33, 6930000, '2140-02-03', 0],
  ];

  /* ----------------------------------------------------------
   * 2. HELPER
   * -------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);

  const nfUS = new Intl.NumberFormat('en-US');
  const fmt  = (n) => nfUS.format(n);
  const pad  = (n, len = 2) => String(Math.max(0, n)).padStart(len, '0');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

  /** Formatta una subsidy BTC in modo leggibile. */
  function fmtBtc(v) {
    if (v === 0) return '0';
    if (v >= 0.0001) return String(parseFloat(v.toFixed(8)));
    return v.toExponential(3);
  }

  /** Formatta una durata in giorni/ore/minuti/secondi. */
  function splitDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return {
      d: Math.floor(total / 86400),
      h: Math.floor((total % 86400) / 3600),
      m: Math.floor((total % 3600) / 60),
      s: total % 60,
    };
  }

  /* ----------------------------------------------------------
   * 3. RIFERIMENTI DOM
   * -------------------------------------------------------- */
  const el = {
    days:      $('#days'),
    hours:     $('#hours'),
    minutes:   $('#minutes'),
    seconds:   $('#seconds'),
    epoch:     $('#epoch'),
    target:    $('#target'),
    rewardB:   $('#reward-before'),
    rewardA:   $('#reward-after'),
    fill:      $('#fill'),
    block:     $('#block'),
    left:      $('#remaining-blocks'),
    pct:       $('#progress-pct'),
    netStatus: $('#net-status'),
    log:       $('#log'),
    form:      $('#form'),
    input:     $('#cmd'),
    clock:     $('#clock'),
  };

  /* ----------------------------------------------------------
   * 4. STATO
   * -------------------------------------------------------- */
  const state = {
    halvings: [],                          // array di oggetti epoch
    anchor:   { ...REFERENCE },            // { height, time } da cui stimare
    manualBlock: null,                     // override utente
    price:    null,                        // { USD, EUR, ... }
    online:   false,
    source:   'fallback',
    history:  [],
    histIdx:  -1,
  };

  /* Override manuale persistito */
  try {
    const raw = localStorage.getItem(LS_MANUAL);
    if (raw !== null) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) state.manualBlock = n;
    }
  } catch (_) { /* storage non disponibile */ }

  /* ----------------------------------------------------------
   * 5. LOG
   * -------------------------------------------------------- */
  function logLine(html = '', cls = '') {
    const line = document.createElement('div');
    line.className = 'line' + (cls ? ' ' + cls : '');
    line.innerHTML = html;
    el.log.appendChild(line);

    while (el.log.childElementCount > MAX_LINES) {
      el.log.removeChild(el.log.firstElementChild);
    }
    el.log.scrollTop = el.log.scrollHeight;
    return line;
  }

  function logEcho(cmd) {
    logLine(`<span class="sym">$</span>${esc(cmd)}`, 'echo');
  }

  /* ----------------------------------------------------------
   * 6. CALCOLI
   * -------------------------------------------------------- */

  /** Altezza stimata del blocco corrente. */
  function currentHeight(now = Date.now()) {
    if (state.manualBlock !== null) return state.manualBlock;
    const a = state.anchor;
    return a.height + Math.floor((now - a.time) / BLOCK_MS);
  }

  /** Prossimo halving rispetto a una data altezza. */
  function nextHalving(height) {
    return state.halvings.find((h) => h.block > height) || null;
  }

  /** Halving precedente (o uguale) a una data altezza. */
  function prevHalving(height) {
    let found = null;
    for (const h of state.halvings) {
      if (h.block <= height) found = h;
      else break;
    }
    return found;
  }

  /** Timestamp stimato in cui verrà raggiunto un blocco. */
  function timeForBlock(block) {
    const a = state.anchor;
    return a.time + (block - a.height) * BLOCK_MS;
  }

  /* ----------------------------------------------------------
   * 7. CARICAMENTO DATI
   * -------------------------------------------------------- */
  async function loadHalvings() {
    try {
      const res = await fetch('data/halvings.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      if (!data || !Array.isArray(data.halvings)) throw new Error('schema non valido');

      state.halvings = data.halvings.map((h) => ({
        epoch:     h.epoch,
        block:     h.block,
        date:      h.date,
        timestamp: h.timestamp || null,
        estimated: h.estimated !== false,
        subsidy:   typeof h.subsidy_after === 'number' ? h.subsidy_after : null,
        status:    h.status || 'unknown',
      }));

      state.source = 'data/halvings.json';
      return;
    } catch (_) {
      /* fallback silenzioso */
    }

    state.halvings = FALLBACK.map(([epoch, block, date, subsidy]) => ({
      epoch,
      block,
      date,
      timestamp: null,
      estimated: epoch > 4,
      subsidy,
      status: epoch <= 4 ? 'completed' : 'upcoming',
    }));
    state.source = 'embedded fallback';
  }

  /* ----------------------------------------------------------
   * 8. RENDER
   * -------------------------------------------------------- */
  function setStatus(text, kind) {
    el.netStatus.textContent = text;
    el.netStatus.className = 'status ' + kind;
  }

  function render() {
    const now = Date.now();

    /* Orologio */
    const d = new Date(now);
    el.clock.textContent =
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());

    const height = currentHeight(now);
    const next   = nextHalving(height);

    /* ---- Nessun halving futuro: supply cap raggiunto ---- */
    if (!next) {
      el.days.textContent = el.hours.textContent =
      el.minutes.textContent = el.seconds.textContent = '00';
      el.epoch.textContent = '33';
      el.target.textContent = '—';
      el.block.textContent = fmt(height);
      el.rewardB.textContent = '0';
      el.rewardA.textContent = '0';
      el.fill.style.width = '100%';
      el.pct.textContent = '100.00%';
      el.left.textContent = 'SUPPLY CAP REACHED';
      return;
    }

    /* ---- Countdown ---- */
    const targetTime = timeForBlock(next.block);
    const remaining  = targetTime - now;
    const { d: dd, h, m, s } = splitDuration(remaining);

    el.days.textContent    = pad(dd, 3);
    el.hours.textContent   = pad(h);
    el.minutes.textContent = pad(m);
    el.seconds.textContent = pad(s);

    /* ---- Metadati ---- */
    const prev       = prevHalving(height);
    const fromBlock  = prev ? prev.block : 0;
    const span       = next.block - fromBlock;
    const pct        = Math.min(100, Math.max(0, ((height - fromBlock) / span) * 100));

    const subsidyAfter  = next.subsidy != null
      ? next.subsidy
      : INITIAL_SUBSIDY / Math.pow(2, next.epoch);

    const subsidyBefore = next.epoch >= 1
      ? INITIAL_SUBSIDY / Math.pow(2, next.epoch - 1)
      : INITIAL_SUBSIDY;

    el.epoch.textContent   = pad(next.epoch);
    el.target.textContent  = fmt(next.block);
    el.block.textContent   = fmt(height) + (state.manualBlock !== null ? ' *' : '');
    el.rewardB.textContent = fmtBtc(subsidyBefore);
    el.rewardA.textContent = fmtBtc(subsidyAfter);

    el.fill.style.width = pct.toFixed(3) + '%';
    el.pct.textContent  = pct.toFixed(4) + '%';

    const left = Math.max(0, next.block - height);
    el.left.textContent = fmt(left) + ' block' + (left === 1 ? '' : 's') + ' left';
  }

  /* ----------------------------------------------------------
   * 9. SYNC DI RETE
   * -------------------------------------------------------- */
  async function syncNetwork(verbose = true) {
    if (verbose) logLine('<span class="dim">syncing with network…</span>');
    setStatus('SYNCING', 'syncing');

    const results = await Promise.allSettled([
      fetch(API_HEIGHT, { cache: 'no-store' }),
      fetch(API_PRICES, { cache: 'no-store' }),
    ]);

    let heightOK = false;
    let priceOK  = false;

    /* --- Altezza blocco --- */
    if (results[0].status === 'fulfilled' && results[0].value.ok) {
      try {
        const txt = await results[0].value.text();
        const h   = parseInt(txt.trim(), 10);
        if (Number.isFinite(h) && h > 0) {
          state.anchor = { height: h, time: Date.now() };
          heightOK = true;
        }
      } catch (_) { /* ignora */ }
    }

    /* --- Prezzo --- */
    if (results[1].status === 'fulfilled' && results[1].value.ok) {
      try {
        const p = await results[1].value.json();
        if (p && typeof p.USD === 'number') {
          state.price = p;
          priceOK = true;
        }
      } catch (_) { /* ignora */ }
    }

    state.online = heightOK;

    /* --- Aggiorna badge --- */
    if (state.manualBlock !== null) {
      setStatus('MANUAL', 'manual');
    } else if (heightOK) {
      setStatus('ONLINE', 'online');
    } else {
      setStatus('OFFLINE', 'offline');
    }

    if (verbose) {
      if (heightOK) {
        logLine(
          `<span class="ok">[  OK  ]</span> tip height <span class="hl">${fmt(state.anchor.height)}</span> <span class="dim">(mempool.space)</span>`
        );
      } else {
        logLine('<span class="warn">[ WARN ]</span> network unreachable — using local estimation');
      }

      if (priceOK) {
        const usd = fmt(Math.round(state.price.USD));
        const eur = typeof state.price.EUR === 'number'
          ? ' · € ' + fmt(Math.round(state.price.EUR))
          : '';
        logLine(`<span class="ok">[  OK  ]</span> BTC/USD <span class="accent">$ ${usd}</span>${eur}`);
      }
    }

    render();
    return { heightOK, priceOK };
  }

  /* ----------------------------------------------------------
   * 10. COMANDI
   * -------------------------------------------------------- */
  const COMMANDS = {

    help() {
      const rows = [
        ['help',          'mostra questo elenco'],
        ['status',        'stato corrente del countdown e della rete'],
        ['next',          'dettagli del prossimo halving'],
        ['halvings [n]',  'tabella degli halving (default: tutti)'],
        ['epoch <n>',     'dettagli di un singolo epoch'],
        ['price',         'prezzo BTC (USD / EUR / GBP)'],
        ['sync',          'risincronizza altezza blocco e prezzo'],
        ['setblock <n>',  'imposta manualmente l\'altezza del blocco'],
        ['reset',         'rimuove l\'altezza impostata manualmente'],
        ['date',          'data e ora locale / UTC'],
        ['about',         'informazioni sul progetto'],
        ['clear',         'pulisce lo schermo'],
      ];

      logLine('<span class="head">AVAILABLE COMMANDS</span>');
      logLine('');
      for (const [cmd, desc] of rows) {
        logLine(`  <span class="hl">${cmd.padEnd(16, ' ')}</span><span class="dim">${esc(desc)}</span>`);
      }
      logLine('');
      logLine('<span class="dim">Suggerimenti: TAB per completare, ↑/↓ per la cronologia.</span>');
    },

    status() {
      const now    = Date.now();
      const height = currentHeight(now);
      const next   = nextHalving(height);
      const prev   = prevHalving(height);

      logLine('<span class="head">STATUS REPORT</span>');
      logLine('');
      logLine(`  block height   <span class="hl">${fmt(height)}</span>${state.manualBlock !== null ? ' <span class="warn">(manuale)</span>' : ''}`);
      logLine(`  source         <span class="dim">${state.manualBlock !== null ? 'localStorage' : state.source}</span>`);
      logLine(`  network        <span class="dim">${state.online ? 'mempool.space (online)' : 'offline — stima locale'}</span>`);

      if (prev) {
        logLine(`  prev epoch     <span class="dim">#${pad(prev.epoch)} @ block ${fmt(prev.block)} — ${prev.date}</span>`);
      }

      if (next) {
        const t = timeForBlock(next.block);
        const rem = splitDuration(t - now);
        logLine(`  next epoch     <span class="hl">#${pad(next.epoch)}</span> <span class="dim">@ block ${fmt(next.block)}</span>`);
        logLine(`  estimated      <span class="accent">${new Date(t).toISOString().replace('T', ' ').slice(0, 19)} UTC</span>`);
        logLine(`  remaining      <span class="hl">${rem.d}g ${rem.h}h ${rem.m}m ${rem.s}s</span>`);
        logLine(`  blocks left    <span class="hl">${fmt(Math.max(0, next.block - height))}</span>`);
      } else {
        logLine('  <span class="warn">Nessun halving futuro: supply cap raggiunto.</span>');
      }

      if (state.price) {
        logLine(`  BTC price      <span class="accent">$ ${fmt(Math.round(state.price.USD))}</span>`);
      }
      logLine('');
    },

    next() {
      const height = currentHeight();
      const next   = nextHalving(height);

      if (!next) {
        logLine('<span class="warn">Nessun halving futuro — il supply cap di 21.000.000 BTC è stato raggiunto.</span>');
        return;
      }

      const t     = timeForBlock(next.block);
      const rem   = splitDuration(t - Date.now());
      const prev  = prevHalving(height);
      const from  = prev ? prev.block : 0;
      const pct   = Math.min(100, Math.max(0, ((height - from) / (next.block - from)) * 100));

      const subsidyAfter  = next.subsidy != null ? next.subsidy : INITIAL_SUBSIDY / Math.pow(2, next.epoch);
      const subsidyBefore = next.epoch >= 1 ? INITIAL_SUBSIDY / Math.pow(2, next.epoch - 1) : INITIAL_SUBSIDY;

      logLine('<span class="head">NEXT HALVING</span>');
      logLine('');
      logLine(`  epoch          <span class="hl">#${next.epoch}</span>`);
      logLine(`  target block   <span class="hl">${fmt(next.block)}</span>`);
      logLine(`  est. date      <span class="accent">${next.date}</span>${next.estimated ? ' <span class="dim">(stimata)</span>' : ''}`);
      logLine(`  est. datetime  <span class="dim">${new Date(t).toISOString().replace('T', ' ').slice(0, 19)} UTC</span>`);
      logLine(`  remaining      <span class="hl">${rem.d} giorni ${rem.h} ore ${rem.m} min ${rem.s} sec</span>`);
      logLine(`  blocks left    <span class="hl">${fmt(Math.max(0, next.block - height))}</span>`);
      logLine(`  subsidy        <span class="dim">${fmtBtc(subsidyBefore)} BTC</span> <i>&rarr;</i> <span class="hl">${fmtBtc(subsidyAfter)} BTC</span>`);
      logLine(`  progress       <span class="accent">${pct.toFixed(4)}%</span>`);
      logLine('');
    },

    halvings(args) {
      const limit = args.length ? parseInt(args[0], 10) : NaN;
      const list  = Number.isFinite(limit) && limit > 0
        ? state.halvings.slice(-limit)
        : state.halvings;

      const height = currentHeight();
      const now    = new Date().toISOString().slice(0, 10);

      logLine('<span class="head">EPOCH  BLOCK        DATE         SUBSIDY        STATUS</span>');

      for (const h of list) {
        const sub = h.subsidy != null ? h.subsidy : INITIAL_SUBSIDY / Math.pow(2, h.epoch);
        const isPast = h.block <= height;

        const mark = isPast ? '<span class="ok">✔</span>' : '<span class="dim">·</span>';
        const dateStr = h.date + (h.estimated && !isPast ? '~' : ' ');
        const status = isPast
          ? '<span class="dim">completed</span>'
          : '<span class="accent">upcoming</span>';

        logLine(
          `  ${pad(h.epoch)}   ${fmt(h.block).padStart(9, ' ')}   ${esc(dateStr.padEnd(11, ' '))}  ` +
          `${fmtBtc(sub).padStart(12, ' ')}  ${status}  ${mark}`
        );
      }

      logLine('');
      logLine(`<span class="dim">Oggi: ${now} · height ${fmt(height)} · ${state.halvings.length} epoch totali.</span>`);
    },

    epoch(args) {
      const n = parseInt(args[0], 10);
      if (!Number.isFinite(n)) {
        logLine('<span class="err">Usage: epoch &lt;n&gt;</span>');
        return;
      }

      const h = state.halvings.find((x) => x.epoch === n);
      if (!h) {
        logLine(`<span class="err">Epoch #${esc(n)} non trovato. Intervallo valido: 0–${state.halvings.length - 1}.</span>`);
        return;
      }

      const subAfter  = h.subsidy != null ? h.subsidy : INITIAL_SUBSIDY / Math.pow(2, h.epoch);
      const subBefore = h.epoch >= 1 ? INITIAL_SUBSIDY / Math.pow(2, h.epoch - 1) : INITIAL_SUBSIDY;
      const isPast    = h.block <= currentHeight();

      logLine(`<span class="head">EPOCH #${h.epoch}</span>`);
      logLine('');
      logLine(`  block          <span class="hl">${fmt(h.block)}</span>`);
      logLine(`  date           <span class="accent">${h.date}</span>${h.estimated ? ' <span class="dim">(stimata)</span>' : ''}`);
      if (h.timestamp) logLine(`  timestamp      <span class="dim">${h.timestamp}</span>`);
      logLine(`  subsidy        <span class="dim">${fmtBtc(subBefore)} BTC</span> <i>&rarr;</i> <span class="hl">${fmtBtc(subAfter)} BTC</span>`);
      logLine(`  status         ${isPast ? '<span class="ok">completed</span>' : '<span class="accent">upcoming</span>'}`);
      if (!isPast) {
        const rem = splitDuration(timeForBlock(h.block) - Date.now());
        logLine(`  remaining      <span class="hl">${rem.d}g ${rem.h}h ${rem.m}m ${rem.s}s</span>`);
      }
      logLine('');
    },

    async price() {
      if (!state.price) {
        logLine('<span class="dim">Recupero quotazioni…</span>');
        await syncNetwork(false);
      }

      if (!state.price) {
        logLine('<span class="err">Impossibile recuperare il prezzo (rete non disponibile).</span>');
        return;
      }

      logLine('<span class="head">BTC PRICE</span>');
      logLine('');
      for (const k of ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'AUD', 'JPY']) {
        if (typeof state.price[k] === 'number') {
          logLine(`  ${k.padEnd(4, ' ')}  <span class="accent">${fmt(Math.round(state.price[k]))}</span>`);
        }
      }
      logLine('');
      logLine('<span class="dim">Fonte: mempool.space</span>');
    },

    async sync() {
      await syncNetwork(true);
    },

    setblock(args) {
      const n = parseInt(args[0], 10);
      if (!Number.isFinite(n) || n < 0) {
        logLine('<span class="err">Usage: setblock &lt;height&gt;</span>');
        return;
      }
      state.manualBlock = n;
      try { localStorage.setItem(LS_MANUAL, String(n)); } catch (_) {}
      setStatus('MANUAL', 'manual');
      logLine(`<span class="ok">[  OK  ]</span> block height impostata a <span class="hl">${fmt(n)}</span> <span class="dim">(persistita)</span>`);
      logLine('<span class="dim">Usa "reset" per tornare alla stima automatica.</span>');
      render();
    },

    reset() {
      state.manualBlock = null;
      try { localStorage.removeItem(LS_MANUAL); } catch (_) {}
      setStatus(state.online ? 'ONLINE' : 'OFFLINE', state.online ? 'online' : 'offline');
      logLine('<span class="ok">[  OK  ]</span> altezza blocco ripristinata alla stima automatica.');
      render();
    },

    date() {
      const now = new Date();
      logLine('<span class="head">TIME</span>');
      logLine('');
      logLine(`  local          <span class="hl">${now.toLocaleString()}</span>`);
      logLine(`  UTC            <span class="hl">${now.toISOString().replace('T', ' ').slice(0, 19)} UTC</span>`);
      logLine(`  unix           <span class="dim">${Math.floor(now.getTime() / 1000)}</span>`);
      logLine(`  timezone       <span class="dim">${Intl.DateTimeFormat().resolvedOptions().timeZone}</span>`);
      logLine('');
    },

    about() {
      logLine('<span class="accent">BTC://TERMINAL</span> <span class="dim">v1.0.0</span>');
      logLine('');
      logLine('<span class="dim">Countdown al prossimo halving di Bitcoin con stima dell\'altezza');
      logLine('di blocco basata su un intervallo medio di 10 minuti.</span>');
      logLine('');
      logLine('  <span class="dim">repo</span>    <span class="hl">github.com/&lt;tuo-utente&gt;/bitcoin-halving-countdown</span>');
      logLine('  <span class="dim">fonti</span>   mempool.space · bitcoin/bitcoin');
      logLine('  <span class="dim">licenza</span> MIT');
      logLine('');
      logLine('<span class="warn">Nessuna consulenza finanziaria. Le date future sono stime.</span>');
    },

    clear() {
      el.log.innerHTML = '';
    },

    /* --- Easter egg --- */
    whoami() { logLine('<span class="hl">satoshi</span> <span class="dim">(probabilmente)</span>'); },
    ls()     { logLine('<span class="dim">halvings.json   bitcoin.svg   README.md</span>'); },
    cat(a)   { logLine(a.length ? `<span class="err">cat: ${esc(a[0])}: Permission denied</span>` : '<span class="err">cat: missing operand</span>'); },
    exit()   { logLine('<span class="dim">Non puoi uscire da Bitcoin. 🙂</span>'); },
    sudo()   { logLine('<span class="warn">Nice try. Non sei Satoshi.</span>'); },
    rm()     { logLine('<span class="err">rm: operation not permitted on the blockchain</span>'); },
  };

  /* Alias */
  COMMANDS['?']  = COMMANDS.help;
  COMMANDS['ls'] = COMMANDS.ls;
  COMMANDS['h']  = COMMANDS.help;
  COMMANDS['cls'] = COMMANDS.clear;

  /* ----------------------------------------------------------
   * 11. ESECUZIONE COMANDI
   * -------------------------------------------------------- */
  async function runCommand(raw) {
    const input = raw.trim();
    if (!input) return;

    logEcho(input);

    const parts = input.split(/\s+/);
    const name  = parts[0].toLowerCase();
    const args  = parts.slice(1);

    const fn = COMMANDS[name];

    if (typeof fn !== 'function') {
      logLine(`<span class="err">command not found: ${esc(name)}</span>`);
      logLine('<span class="dim">Digita "help" per l\'elenco dei comandi.</span>');
      logLine('');
      return;
    }

    try {
      await fn(args);
    } catch (err) {
      logLine(`<span class="err">error: ${esc(err && err.message ? err.message : String(err))}</span>`);
    }

    logLine('');
  }

  /* ----------------------------------------------------------
   * 12. EVENTI
   * -------------------------------------------------------- */
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = el.input.value;
    el.input.value = '';

    if (value.trim()) {
      state.history.push(value.trim());
      if (state.history.length > 100) state.history.shift();
    }
    state.histIdx = state.history.length;

    runCommand(value);
  });

  /* Cronologia con frecce */
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!state.history.length) return;
      state.histIdx = Math.max(0, state.histIdx - 1);
      el.input.value = state.history[state.histIdx] || '';
      el.input.setSelectionRange(el.input.value.length, el.input.value.length);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!state.history.length) return;
      state.histIdx = Math.min(state.history.length, state.histIdx + 1);
      el.input.value = state.history[state.histIdx] || '';
      el.input.setSelectionRange(el.input.value.length, el.input.value.length);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const cur = el.input.value.trim().toLowerCase();
      if (!cur) return;
      const matches = Object.keys(COMMANDS).filter((c) => c.startsWith(cur));
      if (matches.length === 1) {
        el.input.value = matches[0] + ' ';
      } else if (matches.length > 1) {
        logLine(`<span class="dim">${matches.map(esc).join('   ')}</span>`);
      }
    } else if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      COMMANDS.clear();
    }
  });

  /* Click sul terminale → focus sull'input */
  document.querySelector('.terminal').addEventListener('click', (e) => {
    if (window.getSelection().toString()) return;
    if (e.target.closest('.log')) return;
    el.input.focus();
  });

  /* ----------------------------------------------------------
   * 13. BOOT
   * -------------------------------------------------------- */
  const BOOT_LINES = [
    ['BTC://TERMINAL  v1.0.0  (build 2024.04)',        'accent', 140],
    ['Copyright (c) 2009-2025 — Satoshi Nakamoto Foundation', 'dim', 60],
    ['',                                               '',       40],
    ['[  OK  ] Initializing proof-of-work engine…',    'ok',     110],
    ['[  OK  ] Loading halving schedule…',             'ok',     110],
    ['[  OK  ] Calibrating block interval (600s)…',    'ok',     110],
    ['',                                               '',       60],
  ];

  async function boot() {
    for (const [text, cls, delay] of BOOT_LINES) {
      logLine(text ? `<span class="${cls}">${esc(text)}</span>` : '', '');
      await sleep(delay);
    }

    logLine(
      `<span class="ok">[  OK  ]</span> <span class="hl">${state.halvings.length}</span> ` +
      `epochs loaded <span class="dim">from ${esc(state.source)}</span>`,
      ''
    );
    logLine('', '');
    logLine('<span class="dim">Type <span class="hl">help</span> to see available commands.</span>', '');
    logLine('', '');
  }

  /* ----------------------------------------------------------
   * 14. INIT
   * -------------------------------------------------------- */
  async function init() {
    await loadHalvings();

    render();
    await boot();

    /* Stato iniziale del badge */
    if (state.manualBlock !== null) setStatus('MANUAL', 'manual');
    else setStatus('OFFLINE', 'offline');

    /* Sync di rete non bloccante */
    syncNetwork(false);

    /* Tick del countdown */
    setInterval(render, 1000);

    /* Ri-sync periodico (ogni 5 minuti) */
    setInterval(() => syncNetwork(false), 5 * 60 * 1000);

    /* Sincronizza quando la tab torna in primo piano */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        render();
        syncNetwork(false);
      }
    });

    el.input.focus();
  }

  document.addEventListener('DOMContentLoaded', init);

})();
