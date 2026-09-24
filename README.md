# BTC://TERMINAL — Bitcoin Halving Countdown

Un countdown **in tempo reale** al prossimo halving di Bitcoin, racchiuso in un
terminale retro in stile CRT con fosfori verdi e accenti Bitcoin-orange.

Nessuna dipendenza. Nessun build step. Solo HTML, CSS e JavaScript vanilla.

```
┌──────────────────────────────────────────────────────────┐
│  user@bitcoin: ~/halving — bash            ● 14:32:07    │
├──────────────────────────────────────────────────────────┤
│  $ ./countdown --next-halving --live                     │
│                                                          │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│   │   998    │ │    14    │ │    07    │ │    33    │    │
│   │   DAYS   │ │  HOURS   │ │ MINUTES  │ │ SECONDS  │    │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                          │
│  EPOCH 05   TARGET BLOCK 1,050,000   3.125 → 1.5625 BTC  │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  HEIGHT 869,412   180,588 blocks left   46.02%   ● ONLINE│
├──────────────────────────────────────────────────────────┤
│  [  OK  ] Initializing proof-of-work engine…             │
│  [  OK  ] 34 epochs loaded from data/halvings.json       │
│  Type help to see available commands.                    │
│                                                          │
│  user@bitcoin:~$ █                                       │
└──────────────────────────────────────────────────────────┘
```

---

## ✨ Caratteristiche

- **Countdown live** — giorni / ore / minuti / secondi al prossimo halving
- **Stima dinamica dell'altezza blocco** — basata su 10 minuti per blocco
- **Sync opzionale con l'API di mempool.space** — altezza blocco reale + prezzo BTC
- **Barra di progresso** dell'epoch corrente
- **Terminale interattivo** con 12+ comandi, cronologia (↑/↓) e tab-completion
- **Persistenza locale** dell'altezza blocco impostata manualmente
- **Offline-first** — funziona anche senza rete grazie al fallback integrato
- **Zero dipendenze** — nessun framework, nessun bundler, nessun npm install
- **Responsive** e rispettoso di `prefers-reduced-motion`

---

## 📁 Struttura del progetto

```
bitcoin-halving-countdown/
│
├── index.html              # Markup del terminale
├── style.css               # Estetica CRT / phosphor-green
├── script.js               # Logica, countdown e CLI
├── README.md               # Questo file
│
├── assets/
│   └── bitcoin.svg         # Logo / favicon
│
└── data/
    └── halvings.json       # Programma completo dei 34 halving
```

---

## 🚀 Avvio rapido

### Opzione 1 — Server locale (consigliato)

`fetch('data/halvings.json')` richiede un server HTTP: aprendo il file con
`file://` il browser blocca la richiesta e lo script userà il fallback integrato.

```bash
git clone https://github.com/<tuo-utente>/bitcoin-halving-countdown.git
cd bitcoin-halving-countdown

# Python 3
python3 -m http.server 8000

# oppure Node
npx serve .

# oppure PHP
php -S localhost:8000
```

Poi apri <http://localhost:8000>.

### Opzione 2 — GitHub Pages

1. Pusha il repository su GitHub
2. Vai in **Settings → Pages**
3. Source: `Deploy from a branch` → `main` → `/ (root)`
4. Salva — il sito sarà online su `https://<tuo-utente>.github.io/bitcoin-halving-countdown/`

### Opzione 3 — Doppio click

Apri `index.html` direttamente nel browser. Il countdown funziona, ma i dati
verranno letti dal fallback integrato in `script.js` invece che da `data/halvings.json`.

---

## 💻 Comandi disponibili

| Comando | Descrizione |
|---|---|
| `help` | Mostra l'elenco dei comandi |
| `status` | Report completo: altezza, epoch, tempo rimanente, prezzo |
| `next` | Dettagli del prossimo halving |
| `halvings [n]` | Tabella degli halving (opzionale: ultimi `n`) |
| `epoch <n>` | Dettagli di un singolo epoch (0–33) |
| `price` | Prezzo BTC in USD / EUR / GBP / … |
| `sync` | Risincronizza altezza blocco e prezzo |
| `setblock <n>` | Imposta manualmente l'altezza del blocco (persistita) |
| `reset` | Rimuove l'altezza manuale |
| `date` | Data e ora locale / UTC / unix |
| `about` | Informazioni sul progetto |
| `clear` | Pulisce lo schermo (anche `Ctrl/Cmd + L`) |

**Scorciatoie**

- `Tab` — completa il comando
- `↑` / `↓` — naviga la cronologia
- `Ctrl/Cmd + L` — pulisce lo schermo

**Easter egg**: prova `whoami`, `sudo`, `rm`, `exit`, `ls`.

---

## 🧮 Come funziona la stima

L'altezza del blocco corrente non può essere letta senza un nodo o un'API, quindi
il terminale procede in due modi:

**1. Ancoraggio a un blocco noto** (sempre attivo)

```js
const REFERENCE = { height: 840_000, time: Date.UTC(2024, 3, 20, 0, 9, 27) };

height = REFERENCE.height + floor((now - REFERENCE.time) / 600_000);
```

Il blocco **#840.000** (4° halving, 20 aprile 2024) ha un timestamp certo. Da lì
si estrapola a 10 minuti per blocco.

**2. Sync con mempool.space** (quando la rete è disponibile)

L'ancora viene spostata sull'altezza reale del tip, con un timestamp fresco.
Questo riduce l'errore cumulato perché i blocchi reali non impiegano esattamente
10 minuti l'uno (l'average a lungo termine è leggermente inferiore).

**3. Override manuale**

Con `setblock <altezza>` puoi forzare l'altezza se hai letto il dato da un
explorer. Il valore viene salvato in `localStorage`.

> ⚠️ **Nota**: le date future in `data/halvings.json` sono **stime**. Il
> protocollo Bitcoin non ha date programmate — gli halving avvengono a
> specifiche altezze di blocco.

---

## 🗂️ Formato di `data/halvings.json`

```json
{
  "meta": {
    "halving_interval_blocks": 210000,
    "initial_subsidy_btc": 50,
    "reference_block": 840000,
    "reference_timestamp": "2024-04-20T00:09:27Z",
    "avg_block_time_seconds": 600
  },
  "halvings": [
    {
      "epoch": 5,
      "block": 1050000,
      "date": "2028-04-17",
      "timestamp": null,
      "estimated": true,
      "subsidy_after": 1.5625,
      "status": "upcoming"
    }
  ]
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `epoch` | number | Indice dell'halving (0–33) |
| `block` | number | Altezza del blocco in cui avviene |
| `date` | string | Data (`YYYY-MM-DD`) — stimata se `estimated: true` |
| `timestamp` | string\|null | Timestamp ISO 8601 esatto, se noto |
| `estimated` | boolean | `true` se la data è una stima |
| `subsidy_after` | number | Ricompensa per blocco **dopo** l'halving, in BTC |
| `status` | string | `genesis` \| `completed` \| `upcoming` |

---

## 🔌 API esterne utilizzate

| Endpoint | Scopo |
|---|---|
| `https://mempool.space/api/blocks/tip/height` | Altezza blocco corrente |
| `https://mempool.space/api/v1/prices` | Prezzo BTC in fiat |

Entrambe le chiamate sono **non bloccanti** e hanno fallback silenziosi: se
falliscono, il sito continua a funzionare con la stima locale.

---

## 🛠️ Personalizzazione

### Cambiare i colori

Tutto passa da variabili CSS in `style.css`:

```css
:root {
  --green: #3dff88;   /* fosfori verdi   */
  --amber: #f7931a;   /* Bitcoin orange  */
  --text:  #b6f7cd;   /* testo           */
  --muted: #4d7d5f;   /* testo secondario */
}
```

### Aggiungere un comando

In `script.js`, dentro l'oggetto `COMMANDS`:

```js
COMMANDS.mioComando = (args) => {
  logLine('<span class="hl">Ciao dal mio comando!</span>');
};
```

Il comando sarà subito disponibile e comparirà nel tab-completion.

### Disattivare l'effetto CRT

In `style.css`, aggiungi `display: none` a `.crt`, oppure rimuovi la regola
`prefers-reduced-motion` per lasciare che il browser decida.

---

## 🌐 Compatibilità

| Browser | Supporto |
|---|---|
| Chrome / Edge | ✅ Ultime 2 versioni |
| Firefox | ✅ Ultime 2 versioni |
| Safari | ✅ 15+ |
| Mobile (iOS/Android) | ✅ Layout responsive |

---

## 📜 Licenza

MIT — vedi il file `LICENSE`.

---

## ⚠️ Disclaimer

Questo progetto è **a scopo informativo ed educativo**.

- Non è consulenza finanziaria
- Le date future degli halving sono **stime**, non date garantite
- I dati provengono da API pubbliche di terze parti e potrebbero non essere accurati
- Nessuna chiave privata, nessun wallet, nessuna transazione

---

## 🙏 Crediti

- [mempool.space](https://mempool.space) per le API pubbliche
- [Bitcoin Core](https://github.com/bitcoin/bitcoin) per il protocollo
- Ispirato ai terminali CRT degli anni '80 e a `bitcoin-cli`

---

<p align="center">
  <sub>Fatto con ☕ e proof-of-work</sub>
</p>
