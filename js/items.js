/* Banca item — 30 item, 5 dimensioni, 6 per dimensione.
   Le quote definiscono quanti item per dimensione entrano in ogni sessione (totale 12). */

const DIMENSIONS = [
  { code: 'COMP', label: 'Comprensione',       quota: 2 },
  { code: 'USO',  label: 'Uso operativo',      quota: 3 },
  { code: 'VAL',  label: 'Valutazione critica', quota: 3 },
  { code: 'RESP', label: 'Responsabilità',     quota: 2 },
  { code: 'SVIL', label: 'Sviluppo',           quota: 2 }
];

const ITEMS = [
  // COMP — Comprensione
  { id: 'C1', dim: 'COMP', text: 'Spiegare a un collega, con parole mie, la differenza fra un sistema di AI generativa e un software tradizionale basato su regole.' },
  { id: 'C2', dim: 'COMP', text: "Riconoscere se un'attività del mio lavoro è tecnicamente adatta all'AI oppure no, prima di provare a usarla." },
  { id: 'C3', dim: 'COMP', text: "Spiegare perché lo stesso strumento di AI può dare risposte diverse alla stessa domanda." },
  { id: 'C4', dim: 'COMP', text: 'Distinguere fra un sistema che classifica o prevede a partire da dati storici e uno che genera contenuti nuovi.' },
  { id: 'C5', dim: 'COMP', text: 'Descrivere da dove viene ciò che un assistente AI "sa": i dati con cui è stato addestrato e le informazioni che gli fornisco sul momento.' },
  { id: 'C6', dim: 'COMP', text: 'Spiegare che cosa comporta, in concreto, la frase di un fornitore secondo cui il suo strumento "lavora sui nostri dati".' },

  // USO — Uso operativo
  { id: 'U1', dim: 'USO', text: "Formulare una richiesta includendo contesto, obiettivo, vincoli e formato dell'output desiderato." },
  { id: 'U2', dim: 'USO', text: 'Migliorare un risultato insoddisfacente iterando la richiesta, invece di rinunciare o riscrivere tutto a mano.' },
  { id: 'U3', dim: 'USO', text: "Scomporre un'attività complessa in passaggi, decidendo quali affidare all'AI e quali tenere per me." },
  { id: 'U4', dim: 'USO', text: "Fornire esempi o materiali di riferimento per orientare l'output verso lo standard che mi serve." },
  { id: 'U5', dim: 'USO', text: "Impostare l'uso dell'AI su un'attività ricorrente in modo ripetibile, con istruzioni riutilizzabili anziché riscritte ogni volta." },
  { id: 'U6', dim: 'USO', text: 'Far lavorare l\'AI su un documento o un dato che le fornisco io, non soltanto sulle sue conoscenze generali.' },

  // VAL — Valutazione critica
  { id: 'V1', dim: 'VAL', text: "Verificare l'accuratezza di un contenuto prodotto dall'AI, individuando dati, fonti o citazioni inventati." },
  { id: 'V2', dim: 'VAL', text: 'Riconoscere quando una risposta è plausibile ma inadatta allo scopo: tono, destinatario, contesto aziendale.' },
  { id: 'V3', dim: 'VAL', text: "Decidere quando NON usare l'AI per un compito, motivando la scelta." },
  { id: 'V4', dim: 'VAL', text: "Individuare quando l'AI ha ignorato o frainteso una parte della mia richiesta." },
  { id: 'V5', dim: 'VAL', text: 'Distinguere un output generico e superficiale da uno effettivamente utilizzabile.' },
  { id: 'V6', dim: 'VAL', text: "Stimare quanto lavoro di revisione serve su un output prima che sia pronto all'uso." },

  // RESP — Responsabilità
  { id: 'R1', dim: 'RESP', text: "Distinguere quali informazioni aziendali posso inserire in uno strumento di AI e quali no." },
  { id: 'R2', dim: 'RESP', text: "Individuare i casi in cui un output AI può generare un rischio per l'organizzazione o per terzi (discriminazione, errori decisionali, violazione di riservatezza)." },
  { id: 'R3', dim: 'RESP', text: "Riconoscere quando è necessario dichiarare che un contenuto è stato prodotto con l'AI." },
  { id: 'R4', dim: 'RESP', text: "Verificare che l'uso di uno strumento AI sia conforme alle policy interne prima di adottarlo su un'attività di lavoro." },
  { id: 'R5', dim: 'RESP', text: 'Riconoscere quando una decisione che riguarda persone non va delegata a un sistema di AI.' },
  { id: 'R6', dim: 'RESP', text: 'Tenere traccia di come un output è stato prodotto e verificato, quando serve a giustificare una decisione.' },

  // SVIL — Sviluppo
  { id: 'S1', dim: 'SVIL', text: 'Aggiornarmi in autonomia sull\'evoluzione degli strumenti rilevanti per il mio ruolo.' },
  { id: 'S2', dim: 'SVIL', text: "Ridisegnare un processo o un'attività del mio team integrando l'AI, non solo velocizzare i singoli task." },
  { id: 'S3', dim: 'SVIL', text: "Trasferire ai colleghi una pratica d'uso che ho verificato essere efficace." },
  { id: 'S4', dim: 'SVIL', text: 'Valutare un nuovo strumento AI rispetto a quelli già in uso, invece di adottarlo per curiosità.' },
  { id: 'S5', dim: 'SVIL', text: "Individuare nel mio ambito attività che oggi nessuno affida all'AI ma che potrebbero esserlo." },
  { id: 'S6', dim: 'SVIL', text: "Sperimentare un uso nuovo dell'AI mettendo in conto che possa non funzionare." }
];

const SCALE = [
  { value: 1, label: 'non so farlo / non mi è mai capitato' },
  { value: 2, label: 'ci provo, ma con esiti incerti o con supporto' },
  { value: 3, label: 'lo faccio in autonomia nel mio lavoro corrente' },
  { value: 4, label: 'lo faccio bene e riesco a spiegarlo o insegnarlo ad altri' }
];

const BANDS = [
  {
    min: 12, max: 21, name: 'Esplorativo',
    reading: "L'AI è ancora un territorio occasionale: l'uso è sporadico e dipende dal caso o dal supporto di altri.",
    priority: 'Priorità: alfabetizzazione di base e primi usi guidati su attività reali, con affiancamento.'
  },
  {
    min: 22, max: 31, name: 'Utilizzatore',
    reading: "Usi l'AI su attività concrete, ma il risultato dipende ancora molto dal tentativo e dalla fortuna della singola richiesta.",
    priority: 'Priorità: metodo nella formulazione delle richieste e criteri stabili di verifica degli output.'
  },
  {
    min: 32, max: 40, name: 'Praticante consapevole',
    reading: "Padroneggi l'uso quotidiano e sai quando fidarti e quando no: la resa è stabile sulle attività che conosci.",
    priority: "Priorità: passare dal task al processo — ridisegnare attività ricorrenti e presidiare gli aspetti di responsabilità."
  },
  {
    min: 41, max: 48, name: 'Moltiplicatore',
    reading: "Non solo usi l'AI: la sai spiegare, trasferire e integrare nel lavoro degli altri.",
    priority: "Priorità: consolidare il ruolo di riferimento interno — standard d'uso condivisi, formazione dei colleghi, valutazione di nuovi strumenti."
  }
];

/* ==========================================================================
   Item di calibrazione — asse separato dall'autovalutazione.

   Sono domande a scelta multipla con una sola risposta corretta, mescolate fra
   gli item della scala 1–4. Non entrano in nessun punteggio: né nelle medie di
   dimensione, né nel totale, né nella fascia. Servono a confrontare quanto una
   persona dichiara di saper fare con quanto riconosce in una situazione
   concreta, e l'esito lo vede solo il facilitatore.

   Quote per sessione: 1 COMP + 2 VAL + 1 RESP. L'ordine delle quattro opzioni
   è mescolato a ogni sessione, quindi la lettera non ha significato per il
   partecipante: serve solo a registrare quale opzione ha scelto.
   ========================================================================== */

const CAL_QUOTAS = { COMP: 1, VAL: 2, RESP: 1 };

/** Media di autovalutazione da cui la dichiarazione è considerata alta. */
const CAL_SELF_THRESHOLD = 3;

const CAL_ITEMS = [
  // COMP — Comprensione
  {
    id: 'C-cal-1', dim: 'COMP',
    text: 'Ha posto due volte la stessa domanda a un assistente AI e ha ottenuto due risposte diverse. Qual è la spiegazione corretta?',
    options: [
      { id: 'a', text: 'Il sistema impara dalle mie domande precedenti e affina progressivamente le risposte' },
      { id: 'b', text: 'La generazione ha una componente probabilistica: a ogni richiesta il sistema seleziona fra continuazioni possibili', correct: true },
      { id: 'c', text: 'È un malfunzionamento: un sistema affidabile restituisce sempre lo stesso output' },
      { id: 'd', text: 'Dipende dal carico dei server nel momento della richiesta' }
    ]
  },
  {
    id: 'C-cal-2', dim: 'COMP',
    text: "L'azienda vuole individuare quali clienti rischiano di non rinnovare il contratto nei prossimi tre mesi, partendo dallo storico dei rapporti commerciali. Quale approccio è tecnicamente appropriato?",
    options: [
      { id: 'a', text: 'Un modello di machine learning addestrato sui dati storici dei clienti, che classifica il rischio di abbandono', correct: true },
      { id: 'b', text: "Un assistente di AI generativa a cui si descrive il problema e si chiede di produrre l'elenco dei clienti a rischio" },
      { id: 'c', text: 'Un assistente di AI generativa a cui si incollano i dati e si chiede di individuare le regolarità' },
      { id: 'd', text: "Non è un problema affrontabile con l'AI: dipende da fattori umani non prevedibili" }
    ]
  },
  {
    id: 'C-cal-3', dim: 'COMP',
    text: "Chiede a un assistente AI di uso comune quale sia stato il fatturato della sua azienda nell'ultimo trimestre. Risponde con una cifra precisa e verosimile. Perché è un problema?",
    options: [
      { id: 'a', text: 'Perché si tratta di un dato riservato che non dovrebbe essere in grado di conoscere' },
      { id: 'b', text: "Perché non ha accesso a quel dato, se non gliel'ho fornito io: la cifra è stata generata, non recuperata", correct: true },
      { id: 'c', text: 'Perché il dato potrebbe essere aggiornato al trimestre precedente' },
      { id: 'd', text: "Perché avrebbe dovuto indicare la fonte da cui l'ha tratto" }
    ]
  },

  // VAL — Valutazione critica
  {
    id: 'V-cal-1', dim: 'VAL',
    intro: 'Un assistente AI ha prodotto questo passaggio per una nota interna:',
    quote: "Ai sensi del Regolamento (UE) 2024/1689, gli obblighi di alfabetizzazione all'AI previsti dall'articolo 4 si applicano a partire dal 2 agosto 2026 e riguardano esclusivamente i fornitori di sistemi ad alto rischio.",
    text: 'Che cosa fa prima di utilizzarlo?',
    options: [
      { id: 'a', text: 'Lo utilizzo: il riferimento normativo è puntuale e correttamente citato' },
      { id: 'b', text: 'Adatto il tono, troppo tecnico per una nota interna' },
      { id: 'c', text: 'Verifico date e perimetro di applicazione sul testo del regolamento prima di usarlo', correct: true },
      { id: 'd', text: "Chiedo all'assistente di confermarmi se quanto ha scritto è corretto" }
    ]
  },
  {
    id: 'V-cal-2', dim: 'VAL',
    text: "Un output contiene un'affermazione di cui dubita. Per verificarla, pone la stessa domanda a un secondo assistente AI di un altro fornitore, che conferma. Che valore attribuisce a questa conferma?",
    options: [
      { id: 'a', text: 'Elevato: due sistemi indipendenti convergono sulla stessa risposta' },
      { id: 'b', text: 'Molto limitato: possono condividere le stesse fonti e replicare lo stesso errore; serve una fonte primaria', correct: true },
      { id: 'c', text: 'Elevato se il secondo assistente cita fonti a supporto' },
      { id: 'd', text: 'Nullo: gli assistenti AI non sono utilizzabili per verificare informazioni' }
    ]
  },
  {
    id: 'V-cal-3', dim: 'VAL',
    intro: "Ha fornito a un assistente AI la tabella dei ricavi trimestrali della sua area e gli ha chiesto una sintesi per la riunione. L'output è:",
    quote: "Nel corso dell'esercizio l'area ha registrato ricavi per 5.215 migliaia di euro (Q1 1.240, Q2 1.310, Q3 1.180, Q4 1.395), con una crescita del 12,5% del quarto trimestre rispetto al primo.",
    text: 'Come procede?',
    options: [
      { id: 'a', text: "Utilizzo l'output: i dati glieli ho forniti io, quindi i calcoli sono svolti sui numeri corretti" },
      { id: 'b', text: 'Ricalcolo totale e percentuale: input corretti non garantiscono che le operazioni su di essi lo siano', correct: true },
      { id: 'c', text: "Chiedo all'assistente di ricontrollare i propri calcoli" },
      { id: 'd', text: 'Verifico solo la percentuale di crescita, che è il dato destinato alla slide' }
    ]
  },
  {
    id: 'V-cal-4', dim: 'VAL',
    text: "Ha chiesto a un assistente AI un testo tecnico in un ambito che non padroneggia — una clausola contrattuale, un passaggio normativo, una specifica tecnica. L'output è fluido, coerente e internamente ordinato. Non è in grado di stabilire se sia corretto. Che cosa fa?",
    options: [
      { id: 'a', text: 'Lo utilizzo: la coerenza interna e la precisione della terminologia sono indizi affidabili di correttezza' },
      { id: 'b', text: 'Verifico le parti che comprendo e segnalo le altre come da approfondire' },
      { id: 'c', text: 'Riconosco che non posso verificarlo e lo faccio validare da chi ha la competenza, prima di utilizzarlo', correct: true },
      { id: 'd', text: "Chiedo all'assistente di indicare il proprio livello di attendibilità su ciascun passaggio" }
    ]
  },

  // RESP — Responsabilità
  {
    id: 'R-cal-1', dim: 'RESP',
    text: 'Quale di queste operazioni comporta il rischio maggiore, in assenza di uno strumento aziendale dedicato?',
    options: [
      { id: 'a', text: 'Incollare la bozza di una mia email interna e chiedere di migliorarne la formulazione' },
      { id: 'b', text: "Incollare il bilancio d'esercizio già depositato e chiedere una sintesi" },
      { id: 'c', text: 'Incollare il curriculum di un candidato e chiedere una valutazione del profilo', correct: true },
      { id: 'd', text: 'Incollare un articolo pubblicato e chiedere un riassunto per i colleghi' }
    ]
  },
  {
    id: 'R-cal-2', dim: 'RESP',
    text: "Un responsabile propone di far selezionare a un sistema di AI le candidature da convocare, sulla base delle assunzioni degli ultimi cinque anni. Qual è l'obiezione dirimente?",
    options: [
      { id: 'a', text: 'Il sistema non è in grado di valutare le competenze relazionali' },
      { id: 'b', text: 'Riproduce gli orientamenti impliciti nelle assunzioni passate, e riguarda una decisione su persone che richiede intervento umano', correct: true },
      { id: 'c', text: 'I candidati potrebbero opporsi al trattamento dei loro dati' },
      { id: 'd', text: 'Nessuna: se lo storico è ampio, il sistema è più oggettivo di un selezionatore' }
    ]
  }
];

/** Item di calibrazione per sessione: 4. */
const CAL_TOTAL = Object.keys(CAL_QUOTAS).reduce(function (n, code) { return n + CAL_QUOTAS[code]; }, 0);

/** Dimensioni calibrate, nell'ordine di DIMENSIONS. Le altre restano senza etichetta. */
const CAL_DIMS = DIMENSIONS.filter(function (d) { return CAL_QUOTAS[d.code]; })
  .map(function (d) { return d.code; });

const CAL_BY_ID = {};
CAL_ITEMS.forEach(function (it) { CAL_BY_ID[it.id] = it; });

/** Etichetta di taratura di una dimensione: incrocia la media dichiarata con
 *  l'esito degli item di calibrazione. "Sovrastima" è la priorità formativa.
 *  Non modifica alcun punteggio ed è riservata al facilitatore. */
function calibrationLabel(selfMean, allCorrect) {
  if (selfMean >= CAL_SELF_THRESHOLD) return allCorrect ? 'Confermato' : 'Sovrastima';
  return allCorrect ? 'Sottostima' : 'Coerente';
}
