"""Banca item, dimensioni, scala e fasce di profilo.

Stessi contenuti di ``js/items.js``: le due implementazioni (statica e Python)
condividono il modello, quindi ogni modifica al testo degli item va replicata
nell'altro file.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Dimension:
    code: str
    label: str
    quota: int  # item estratti per sessione


@dataclass(frozen=True)
class Item:
    id: str
    dim: str
    text: str


@dataclass(frozen=True)
class Anchor:
    value: int
    label: str


@dataclass(frozen=True)
class Band:
    lo: int
    hi: int
    name: str
    reading: str
    priority: str


DIMENSIONS: tuple[Dimension, ...] = (
    Dimension("COMP", "Comprensione", 2),
    Dimension("USO", "Uso operativo", 3),
    Dimension("VAL", "Valutazione critica", 3),
    Dimension("RESP", "Responsabilità", 2),
    Dimension("SVIL", "Sviluppo", 2),
)

ITEMS: tuple[Item, ...] = (
    # COMP — Comprensione
    Item("C1", "COMP", "Spiegare a un collega, con parole mie, la differenza fra un sistema di AI generativa e un software tradizionale basato su regole."),
    Item("C2", "COMP", "Riconoscere se un'attività del mio lavoro è tecnicamente adatta all'AI oppure no, prima di provare a usarla."),
    Item("C3", "COMP", "Spiegare perché lo stesso strumento di AI può dare risposte diverse alla stessa domanda."),
    Item("C4", "COMP", "Distinguere fra un sistema che classifica o prevede a partire da dati storici e uno che genera contenuti nuovi."),
    Item("C5", "COMP", 'Descrivere da dove viene ciò che un assistente AI "sa": i dati con cui è stato addestrato e le informazioni che gli fornisco sul momento.'),
    Item("C6", "COMP", 'Spiegare che cosa comporta, in concreto, la frase di un fornitore secondo cui il suo strumento "lavora sui nostri dati".'),
    # USO — Uso operativo
    Item("U1", "USO", "Formulare una richiesta includendo contesto, obiettivo, vincoli e formato dell'output desiderato."),
    Item("U2", "USO", "Migliorare un risultato insoddisfacente iterando la richiesta, invece di rinunciare o riscrivere tutto a mano."),
    Item("U3", "USO", "Scomporre un'attività complessa in passaggi, decidendo quali affidare all'AI e quali tenere per me."),
    Item("U4", "USO", "Fornire esempi o materiali di riferimento per orientare l'output verso lo standard che mi serve."),
    Item("U5", "USO", "Impostare l'uso dell'AI su un'attività ricorrente in modo ripetibile, con istruzioni riutilizzabili anziché riscritte ogni volta."),
    Item("U6", "USO", "Far lavorare l'AI su un documento o un dato che le fornisco io, non soltanto sulle sue conoscenze generali."),
    # VAL — Valutazione critica
    Item("V1", "VAL", "Verificare l'accuratezza di un contenuto prodotto dall'AI, individuando dati, fonti o citazioni inventati."),
    Item("V2", "VAL", "Riconoscere quando una risposta è plausibile ma inadatta allo scopo: tono, destinatario, contesto aziendale."),
    Item("V3", "VAL", "Decidere quando NON usare l'AI per un compito, motivando la scelta."),
    Item("V4", "VAL", "Individuare quando l'AI ha ignorato o frainteso una parte della mia richiesta."),
    Item("V5", "VAL", "Distinguere un output generico e superficiale da uno effettivamente utilizzabile."),
    Item("V6", "VAL", "Stimare quanto lavoro di revisione serve su un output prima che sia pronto all'uso."),
    # RESP — Responsabilità
    Item("R1", "RESP", "Distinguere quali informazioni aziendali posso inserire in uno strumento di AI e quali no."),
    Item("R2", "RESP", "Individuare i casi in cui un output AI può generare un rischio per l'organizzazione o per terzi (discriminazione, errori decisionali, violazione di riservatezza)."),
    Item("R3", "RESP", "Riconoscere quando è necessario dichiarare che un contenuto è stato prodotto con l'AI."),
    Item("R4", "RESP", "Verificare che l'uso di uno strumento AI sia conforme alle policy interne prima di adottarlo su un'attività di lavoro."),
    Item("R5", "RESP", "Riconoscere quando una decisione che riguarda persone non va delegata a un sistema di AI."),
    Item("R6", "RESP", "Tenere traccia di come un output è stato prodotto e verificato, quando serve a giustificare una decisione."),
    # SVIL — Sviluppo
    Item("S1", "SVIL", "Aggiornarmi in autonomia sull'evoluzione degli strumenti rilevanti per il mio ruolo."),
    Item("S2", "SVIL", "Ridisegnare un processo o un'attività del mio team integrando l'AI, non solo velocizzare i singoli task."),
    Item("S3", "SVIL", "Trasferire ai colleghi una pratica d'uso che ho verificato essere efficace."),
    Item("S4", "SVIL", "Valutare un nuovo strumento AI rispetto a quelli già in uso, invece di adottarlo per curiosità."),
    Item("S5", "SVIL", "Individuare nel mio ambito attività che oggi nessuno affida all'AI ma che potrebbero esserlo."),
    Item("S6", "SVIL", "Sperimentare un uso nuovo dell'AI mettendo in conto che possa non funzionare."),
)

SCALE: tuple[Anchor, ...] = (
    Anchor(1, "non so farlo / non mi è mai capitato"),
    Anchor(2, "ci provo, ma con esiti incerti o con supporto"),
    Anchor(3, "lo faccio in autonomia nel mio lavoro corrente"),
    Anchor(4, "lo faccio bene e riesco a spiegarlo o insegnarlo ad altri"),
)

BANDS: tuple[Band, ...] = (
    Band(
        12, 21, "Esplorativo",
        "L'AI è ancora un territorio occasionale: l'uso è sporadico e dipende dal caso o dal supporto di altri.",
        "Priorità: alfabetizzazione di base e primi usi guidati su attività reali, con affiancamento.",
    ),
    Band(
        22, 31, "Utilizzatore",
        "Usi l'AI su attività concrete, ma il risultato dipende ancora molto dal tentativo e dalla fortuna della singola richiesta.",
        "Priorità: metodo nella formulazione delle richieste e criteri stabili di verifica degli output.",
    ),
    Band(
        32, 40, "Praticante consapevole",
        "Padroneggi l'uso quotidiano e sai quando fidarti e quando no: la resa è stabile sulle attività che conosci.",
        "Priorità: passare dal task al processo — ridisegnare attività ricorrenti e presidiare gli aspetti di responsabilità.",
    ),
    Band(
        41, 48, "Moltiplicatore",
        "Non solo usi l'AI: la sai spiegare, trasferire e integrare nel lavoro degli altri.",
        "Priorità: consolidare il ruolo di riferimento interno — standard d'uso condivisi, formazione dei colleghi, valutazione di nuovi strumenti.",
    ),
)

ITEMS_PER_SESSION = sum(d.quota for d in DIMENSIONS)  # 12
MIN_TOTAL = ITEMS_PER_SESSION * SCALE[0].value        # 12
MAX_TOTAL = ITEMS_PER_SESSION * SCALE[-1].value       # 48

ITEMS_BY_ID: dict[str, Item] = {it.id: it for it in ITEMS}
DIMENSION_BY_CODE: dict[str, Dimension] = {d.code: d for d in DIMENSIONS}
