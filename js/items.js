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
