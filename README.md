# Auto-assessment competenze AI

Auto-assessment individuale delle competenze di intelligenza artificiale. Interfaccia in italiano,
applicazione statica (HTML + CSS + JavaScript, nessuna dipendenza, nessun backend): si apre
facendo doppio clic su `index.html` o pubblicandola su GitHub Pages.

L'aspetto segue il design system dell'app **Workshop AI Adoption** di IFAB Foundation: fondo grigio
chiaro, card bianche arrotondate con bordo sottile, navy `#21344d` per i titoli, blu `#1b98e0` come
unico accento, font Geist.

## Struttura del modello

**5 dimensioni**, banca di **30 item** (6 per dimensione), **12 item per sessione** con quote fisse:

| Codice | Dimensione | Item in banca | Item per sessione |
|---|---|---|---|
| COMP | Comprensione | 6 (C1–C6) | 2 |
| USO | Uso operativo | 6 (U1–U6) | 3 |
| VAL | Valutazione critica | 6 (V1–V6) | 3 |
| RESP | Responsabilità | 6 (R1–R6) | 2 |
| SVIL | Sviluppo | 6 (S1–S6) | 2 |

L'estrazione è casuale a ogni nuova sessione (`crypto.getRandomValues` quando disponibile) e
rispetta le quote; l'ordine di presentazione è mescolato e **la dimensione di appartenenza non è
visibile** durante la compilazione.

## Questionario

- Radice comune: «**Sono in grado di…**».
- Lista unica scrollabile dei 12 item; scala **1–4** con ancoraggi sempre visibili nella barra sticky:
  1. non so farlo / non mi è mai capitato
  2. ci provo, ma con esiti incerti o con supporto
  3. lo faccio in autonomia nel mio lavoro corrente
  4. lo faccio bene e riesco a spiegarlo o insegnarlo ad altri
- Nessun calcolo prima che tutte le 12 risposte siano presenti: gli item mancanti vengono
  segnalati inline (bordo, etichetta «Risposta mancante») e riepilogati con link di salto.

## Scoring

- Media 1–4 per ciascuna dimensione, a 2 decimali, più percentuale sul massimo.
- Punteggio totale: somma dei 12 item, **12–48**.
- Fasce di profilo, ognuna con riga di lettura e priorità di intervento:

| Punteggio | Profilo |
|---|---|
| 12–21 | Esplorativo |
| 22–31 | Utilizzatore |
| 32–40 | Praticante consapevole |
| 41–48 | Moltiplicatore |

- **Radar** sulle 5 dimensioni con **asse fisso 0–4** (canvas nativo, nessuna CDN): la scala non si
  adatta ai dati, così profili diversi sono confrontabili fra loro.

### Alert automatici

1. `media USO − media VAL ≥ 1` → *«Usi l'AI più di quanto la verifichi»*: profilo di rischio,
   intervento prioritario sulla verifica degli output.
2. `media RESP ≤ 2` → **gap di conformità**: la formazione su dati, rischi, trasparenza e policy va
   trattata come obbligatoria (obbligo di alfabetizzazione AI, art. 4 del Regolamento UE 2024/1689).

## File

```
index.html            intro, registrazione, questionario, risultati + sprite delle icone
facilitatore.html     login e statistiche di gruppo
css/style.css         design system: palette IFAB, card arrotondate, tipografia Geist
js/config.js          URL e chiave anon del progetto Supabase (da compilare)
js/items.js           banca item, dimensioni con quote, scala, fasce di profilo
js/db.js              client REST Supabase: scritture, login, letture aggregate
js/radar.js           radar su canvas con asse fisso 0–4, condiviso fra le due pagine
js/app.js             registrazione, estrazione, validazione, scoring, alert
js/facilitator.js     aggregati, tabella compilazioni, export CSV
supabase/schema.sql   tabelle, indici, trigger, policy RLS, viste
```

Il font Geist arriva da Google Fonts; senza rete la pagina ripiega su Segoe UI / Arial e resta
identica nella struttura. Tutto il resto è locale.

## Salvataggio su Supabase

Il flusso è: **registrazione** (nome e cognome) → questionario → risultati. I dati vengono scritti
progressivamente, così restano tracciate anche le compilazioni interrotte:

| Momento | Chiamata |
|---|---|
| registrazione | `register_participant(nome, cognome)` → id |
| avvio questionario | `start_session(id, item_ids)` → id sessione |
| ogni risposta | `save_answer(...)` (debounce 800 ms, un retry) |
| calcolo del risultato | `save_answers(...)` completo + `complete_session(totale, fascia, medie, alert)` |

Tabelle: `participants`, `sessions`, `answers` (più le viste `v_sessioni_complete` e `v_medie_item`
per le query dalla dashboard). Il client è scritto a mano su PostgREST e GoTrue: nessuna libreria,
nessun bundler.

Le scritture passano da funzioni `SECURITY DEFINER` e non da insert diretti, per due ragioni: la
validazione sta sul server (nome e cognome non vuoti, 12 item per sessione, valori 1–4, sessione
conclusa non più modificabile) e le tabelle possono restare completamente chiuse alla chiave
pubblica. Un upsert diretto non funzionerebbe comunque: PostgREST lo esegue come
`INSERT … ON CONFLICT` e Postgres pretende in quel caso anche una policy di lettura — che
significherebbe rendere visibili a chiunque le risposte di tutti.

### Configurazione in tre passi

1. **Schema**: apri il SQL Editor del progetto Supabase e lancia `supabase/schema.sql`
   (idempotente, si può rilanciare).
2. **Chiavi**: in `js/config.js` inserisci *Project URL* e *anon public key*
   (Project Settings → API).
3. **Facilitatore**: Authentication → Users → *Add user* con email e password; disattiva la
   registrazione pubblica (Providers → Email → *Allow new users to sign up* off). Quelle
   credenziali servono per entrare in `facilitatore.html`.

Senza il passo 2 l'app resta usabile: calcola il profilo e avvisa in home che nulla viene salvato.

## Pagina facilitatore

`facilitatore.html` chiede le credenziali Supabase e mostra gli aggregati calcolati dai dati letti
in una sola richiesta: partecipanti, tasso di completamento, punteggio medio, medie per dimensione
con radar di gruppo (stesso asse 0–4 del profilo individuale), distribuzione delle fasce, frequenza
dei due alert, item con la media più bassa, elenco delle compilazioni (anche quelle in corso) ed
export CSV.

## Dati, privacy, sicurezza

Vengono registrati **nome, cognome, risposte, punteggi e alert**. Nessun altro dato personale,
nessuna email, nessuna password per i partecipanti.

Il modello di sicurezza è quello standard di un'app statica su Supabase:

- la chiave *anon* è pubblica per definizione: sta nel JavaScript e quindi anche in questa repo.
  Ciò che protegge i dati non è il segreto della chiave ma RLS e privilegi;
- le tre tabelle sono **chiuse** a quella chiave: nessun accesso diretto, né in lettura né in
  scrittura. Si passa solo dalle cinque funzioni, che non restituiscono dati altrui;
- la lettura è consentita solo agli utenti autenticati (il facilitatore);
- una sessione conclusa non è più modificabile: `complete_session` e `save_answer` rifiutano;
- resta possibile, per chi estragga la chiave dal codice, creare partecipanti e sessioni finte
  (è inevitabile senza autenticazione dei partecipanti): sono dati in più, non dati letti o
  alterati. Se diventasse un problema, il passo successivo è un CAPTCHA o un codice sessione
  distribuito dal facilitatore.

## Personalizzazione

- **Item**: modificare `ITEMS` in `js/items.js` (mantenendo `dim` fra i codici esistenti).
- **Quote per sessione**: campo `quota` in `DIMENSIONS`; il totale degli item per sessione si adegua
  automaticamente, ma le soglie delle fasce in `BANDS` vanno riviste di conseguenza.
- **Testi delle fasce**: `BANDS` in `js/items.js`.
- **Colori**: variabili CSS in cima a `css/style.css`.

## Pubblicazione su GitHub Pages

Settings → Pages → *Deploy from a branch* → branch `main`, cartella `/ (root)`.
