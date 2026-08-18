# Auto-assessment competenze AI

Auto-assessment individuale delle competenze di intelligenza artificiale. Interfaccia in italiano,
applicazione statica (HTML + CSS + JavaScript, nessuna dipendenza, nessun backend): si apre
facendo doppio clic su `index.html` o pubblicandola su GitHub Pages.

Due assi distinti: l'**autovalutazione** su scala 1–4, che produce punteggio, fascia e radar, e gli
**item di calibrazione** a scelta multipla, che non toccano nessun punteggio e servono al
facilitatore per vedere dove la dichiarazione e il riconoscimento non coincidono.

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

### Item di calibrazione

Accanto all'autovalutazione c'è un secondo asse: **9 item a scelta multipla** con una sola risposta
corretta, di cui **4 per sessione**, che misurano il riconoscimento in una situazione concreta
invece della padronanza dichiarata.

| Codice | Dimensione | Item in banca | Item per sessione |
|---|---|---|---|
| COMP | Comprensione | 3 (C-cal-1…3) | 1 |
| VAL | Valutazione critica | 4 (V-cal-1…4) | 2 |
| RESP | Responsabilità | 2 (R-cal-1…2) | 1 |

USO e SVIL non hanno item di calibrazione: restano senza etichetta di taratura, non vengono stimate.
L'**ordine delle quattro opzioni è mescolato a ogni sessione**, quindi la lettera registrata sul
database (`a`…`d`) indica l'opzione della banca, non la posizione mostrata.

## Questionario

- Una sola lista scrollabile di **16 domande**: i 12 item della scala e i 4 di calibrazione,
  intrecciati (uno di calibrazione ogni tre item della scala, in posizione casuale dentro il blocco:
  mai in apertura, mai due di seguito).
- Item della scala: radice comune «**Sono in grado di…**», scala **1–4** con ancoraggi sempre
  visibili nella barra sticky:
  1. non so farlo / non mi è mai capitato
  2. ci provo, ma con esiti incerti o con supporto
  3. lo faccio in autonomia nel mio lavoro corrente
  4. lo faccio bene e riesco a spiegarlo o insegnarlo ad altri
- Item di calibrazione: quattro opzioni, **modificabili fino a «Calcola il risultato»**; dopo il
  calcolo si bloccano e compare la nota che non sono più modificabili. Nessun timer, nessuna
  penalizzazione e **nessun riscontro** sull'esito: né durante la compilazione, né nella schermata
  dei risultati. «Azzera le risposte» ripulisce solo la scala.
- Nessun calcolo prima che tutte le 16 risposte siano presenti: le domande mancanti vengono
  segnalate inline (bordo, etichetta «Risposta mancante») e riepilogate con link di salto.

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

Gli item di calibrazione **non entrano in questi numeri**: non nelle medie di dimensione, non nel
totale, non nella fascia. Nessun bonus, nessun malus, nessuna correzione dei punteggi. Sono un asse
separato, e sul radar non aggiungono una seconda serie né spostano i vertici.

### Taratura

Per le tre dimensioni calibrate si incrocia la media dichiarata con l'esito degli item di
calibrazione di quella dimensione (che devono essere **tutti** corretti: su VAL, 1 su 2 non basta):

| Autovalutazione | Item di calibrazione | Etichetta |
|---|---|---|
| ≥ 3,0 | tutti corretti | **Confermato** |
| ≥ 3,0 | non tutti corretti | **Sovrastima** — priorità formativa |
| < 3,0 | tutti corretti | **Sottostima** |
| < 3,0 | non tutti corretti | **Coerente** |

Le etichette sono **riservate al facilitatore**: il partecipante non le vede da nessuna parte.
Compaiono solo per le compilazioni concluse con tutte le risposte di calibrazione registrate;
altrimenti restano vuote, senza stime di riserva. Le dimensioni senza item di calibrazione (USO,
SVIL) non hanno etichetta.

### Alert automatici

Non compaiono nella schermata del partecipante — che resta punteggio, profilo, dimensioni e radar —
ma vengono calcolati e salvati con la compilazione: servono al facilitatore, che ne vede la frequenza
sul gruppo.

1. `media USO − media VAL ≥ 1` → *«Usi l'AI più di quanto la verifichi»*: profilo di rischio,
   intervento prioritario sulla verifica degli output.
2. `media RESP ≤ 2` → **gap di conformità**: la formazione su dati, rischi, trasparenza e policy va
   trattata come obbligatoria (obbligo di alfabetizzazione AI, art. 4 del Regolamento UE 2024/1689).

## File

```
index.html            intro, registrazione, questionario, risultati + sprite delle icone
facilitatore.html     login e statistiche di gruppo
css/style.css         design system: palette IFAB, card arrotondate, tipografia Geist
img/logo-ifab.svg     logo IFAB nel footer; la dicitura completa è nei tracciati del file
js/config.js          URL e chiave anon del progetto Supabase (da compilare)
js/items.js           banca item, dimensioni con quote, scala, fasce, item di calibrazione
js/db.js              client REST Supabase: scritture, login, letture aggregate
js/radar.js           radar su canvas con asse fisso 0–4, condiviso fra le due pagine
js/app.js             registrazione, estrazione, validazione, scoring, alert, calibrazione
js/facilitator.js     aggregati, tabelle compilazioni e partecipanti, cancellazioni, export CSV
supabase/schema.sql   tabelle, indici, trigger, policy RLS, funzioni di scrittura, viste
```

Il font Geist arriva da Google Fonts; senza rete la pagina ripiega su Segoe UI / Arial e resta
identica nella struttura. Tutto il resto è locale.

## Salvataggio su Supabase

Il flusso è: **registrazione** (nome e cognome) → questionario → risultati. I dati vengono scritti
progressivamente, così restano tracciate anche le compilazioni interrotte:

| Momento | Chiamata |
|---|---|
| registrazione | `register_participant(nome, cognome)` → id |
| avvio questionario | `start_session(id, item_ids, user_agent, cal_item_ids)` → id sessione |
| ogni risposta della scala | `save_answer(...)` (debounce 800 ms, un retry) |
| ogni item di calibrazione | `save_calibration(...)` (subito, senza debounce; una nuova scelta sullo stesso item aggiorna la riga) |
| calcolo del risultato | `save_answers(...)` completo + reinvio della calibrazione + `complete_session(totale, fascia, medie, alert)` |

Tabelle: `participants`, `sessions`, `answers`, `calibrations` (più le viste `v_sessioni_complete`,
`v_medie_item` e `v_calibrazione_item` per le query dalla dashboard). Gli item di calibrazione
estratti stanno in `sessions.cal_item_ids`, così restano noti anche se il partecipante abbandona
prima di risponderci. Il client è scritto a mano su PostgREST e GoTrue: nessuna libreria, nessun
bundler.

Le scritture passano da funzioni `SECURITY DEFINER` e non da insert diretti, per due ragioni: la
validazione sta sul server (nome e cognome non vuoti, 12 item per sessione, valori 1–4, sessione
conclusa non più modificabile) e le tabelle possono restare completamente chiuse alla chiave
pubblica. Un upsert diretto non funzionerebbe comunque: PostgREST lo esegue come
`INSERT … ON CONFLICT` e Postgres pretende in quel caso anche una policy di lettura — che
significherebbe rendere visibili a chiunque le risposte di tutti.

### Configurazione in tre passi

1. **Schema**: apri il SQL Editor del progetto Supabase e lancia `supabase/schema.sql`
   (idempotente, si può rilanciare). Se il progetto è già configurato, va rilanciato comunque: lì
   stanno le policy di cancellazione della pagina facilitatore e, con gli item di calibrazione, la
   tabella `calibrations`, la colonna `sessions.cal_item_ids` e la nuova firma di `start_session`
   (che ha un argomento in più: la versione a tre argomenti viene rimossa). Fino al rilancio l'app
   nuova non riesce ad aprire le sessioni, quindi conviene farlo **prima** di pubblicare.
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
dei due alert, item con la media più bassa, elenco delle compilazioni (anche quelle in corso),
elenco dei partecipanti registrati ed export CSV.

### Taratura, lato facilitatore

- card **Taratura**: per ciascuna dimensione calibrata la media dichiarata, la percentuale di
  risposte corrette e la distribuzione delle quattro etichette, con la *sovrastima* evidenziata e una
  riga di priorità formativa;
- card **Domande di calibrazione**: percentuale di risposte corrette per singolo item, dalla più
  sbagliata alla più facile;
- colonna **Taratura** nella tabella delle compilazioni: una lettera per dimensione (C, V, R),
  colorata secondo l'etichetta, con la legenda sotto la tabella;
- **radar**: valori e asse restano quelli dell'autovalutazione; un anello rosso marca le dimensioni
  in cui la sovrastima è l'etichetta prevalente (almeno metà delle compilazioni etichettate).

### Export CSV

Le colonne storiche non sono state toccate; in coda sono state aggiunte:
`cal_item_estratti` (i codici estratti, separati da `|`), una colonna **per ogni item della banca di
calibrazione** con `1` corretto / `0` sbagliato / vuoto se non estratto, e
`taratura_COMP`, `taratura_VAL`, `taratura_RESP` con l'etichetta.

### Cancellazioni

Dalla stessa pagina si eliminano i dati. La cancellazione è **fisica e immediata**: le righe escono
dal database, non vengono nascoste con un flag, e non esiste un annulla.

| Cosa elimini | Che cosa sparisce con lui | Che cosa resta |
|---|---|---|
| una **compilazione** (tabella *Compilazioni*) | le sue risposte | il partecipante e le sue altre compilazioni |
| un **partecipante** (tabella *Partecipanti*) | tutte le sue compilazioni e tutte le risposte | nulla di suo |
| **tutto l'archivio** (*Svuota l'archivio*) | partecipanti, compilazioni, risposte | solo l'account del facilitatore, che sta in Authentication |

In entrambe le tabelle si può usare il cestino di riga oppure selezionare più righe con le caselle e
premere il pulsante di gruppo. Ogni azione passa da un dialogo di conferma che **elenca nome per
nome** ciò che sta per sparire; per lo svuotamento totale bisogna scrivere `ELIMINA` per intero.
Finita la cancellazione i dati vengono riletti, così aggregati e radar si ricalcolano subito senza le
righe rimosse; il conteggio in verde è quello riferito dal database, non quello atteso.

Le righe figlie cadono per le foreign key `on delete cascade`, quindi non restano risposte orfane.
L'export CSV è l'unico backup e va fatto **prima**.

## Dati, privacy, sicurezza

Vengono registrati **nome, cognome, risposte, punteggi, alert e risposte di calibrazione**. Nessun
altro dato personale, nessuna email, nessuna password per i partecipanti.

Il modello di sicurezza è quello standard di un'app statica su Supabase:

- la chiave *anon* è pubblica per definizione: sta nel JavaScript e quindi anche in questa repo.
  Ciò che protegge i dati non è il segreto della chiave ma RLS e privilegi;
- le quattro tabelle sono **chiuse** a quella chiave: nessun accesso diretto, né in lettura né in
  scrittura. Si passa solo dalle sei funzioni, che non restituiscono dati altrui;
- la risposta corretta degli item di calibrazione sta in `js/items.js`, quindi nel browser: chi legge
  il codice la vede, ed è il client a dire al database se la scelta era corretta. È lo stesso livello
  di fiducia dei valori 1–4 della scala e non espone dati di nessun altro; se l'esattezza dell'esito
  diventasse critica, la risposta corretta va spostata in una tabella lato server;
- la lettura è consentita solo agli utenti autenticati (il facilitatore);
- **anche la cancellazione** è riservata agli utenti autenticati (`for delete to authenticated` più
  il privilegio `delete`, che alla chiave anon resta revocato): un partecipante non può cancellare
  nulla, nemmeno le proprie risposte. Verificato sul progetto: con la chiave anon una DELETE
  risponde `42501 permission denied`;
- una sessione conclusa non è più modificabile: `complete_session`, `save_answer` e
  `save_calibration` rifiutano;
- resta possibile, per chi estragga la chiave dal codice, creare partecipanti e sessioni finte
  (è inevitabile senza autenticazione dei partecipanti): sono dati in più, non dati letti o
  alterati. Se diventasse un problema, il passo successivo è un CAPTCHA o un codice sessione
  distribuito dal facilitatore.

## Personalizzazione

- **Item**: modificare `ITEMS` in `js/items.js` (mantenendo `dim` fra i codici esistenti).
- **Quote per sessione**: campo `quota` in `DIMENSIONS`; il totale degli item per sessione si adegua
  automaticamente, ma le soglie delle fasce in `BANDS` vanno riviste di conseguenza.
- **Testi delle fasce**: `BANDS` in `js/items.js`.
- **Item di calibrazione**: `CAL_ITEMS` in `js/items.js`. Ogni item ha `id`, `dim`, `text`, quattro
  `options` di cui **una sola** con `correct: true`, e facoltativamente `intro` (contesto) e `quote`
  (il passaggio da valutare). Gli id finiscono nel database e nelle colonne del CSV: cambiarli fa
  perdere il collegamento con le risposte già raccolte.
- **Quote di calibrazione**: `CAL_QUOTAS`; il conteggio delle domande per sessione (16) e la legenda
  della colonna *Taratura* si adeguano da sé. Aggiungendo una dimensione, servono item in banca per
  la quota richiesta.
- **Soglia di taratura**: `CAL_SELF_THRESHOLD` (3,0) e la funzione `calibrationLabel`, sempre in
  `js/items.js`.
- **Colori**: variabili CSS in cima a `css/style.css`.

## Pubblicazione su GitHub Pages

Settings → Pages → *Deploy from a branch* → branch `main`, cartella `/ (root)`.
