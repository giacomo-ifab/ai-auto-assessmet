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
index.html        le tre viste (intro, questionario, risultati) e lo sprite delle icone
css/style.css     design system: palette IFAB, card arrotondate, tipografia Geist
js/items.js       banca item, dimensioni con quote, scala, fasce di profilo
js/app.js         estrazione, validazione, scoring, alert, radar su canvas
```

Il font Geist arriva da Google Fonts; senza rete la pagina ripiega su Segoe UI / Arial e resta
identica nella struttura. Tutto il resto è locale.

## Dati e privacy

Nessuna risposta lascia il browser: non c'è né invio a server né salvataggio persistente. Chiudere
la pagina cancella la sessione; l'esito si conserva con «Stampa / salva PDF».

## Personalizzazione

- **Item**: modificare `ITEMS` in `js/items.js` (mantenendo `dim` fra i codici esistenti).
- **Quote per sessione**: campo `quota` in `DIMENSIONS`; il totale degli item per sessione si adegua
  automaticamente, ma le soglie delle fasce in `BANDS` vanno riviste di conseguenza.
- **Testi delle fasce**: `BANDS` in `js/items.js`.
- **Colori**: variabili CSS in cima a `css/style.css`.

## Pubblicazione su GitHub Pages

Settings → Pages → *Deploy from a branch* → branch `main`, cartella `/ (root)`.
