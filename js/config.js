/* Configurazione Supabase.
 *
 * Sostituisci i due valori con quelli del tuo progetto:
 *   Supabase → Project Settings → API → Project URL e anon public key.
 *
 * La chiave "anon" è pubblica per definizione: sta nel codice del browser e
 * quindi anche in questa repo. La protezione non è il segreto della chiave ma
 * le policy RLS di supabase/schema.sql, che con questa chiave permettono di
 * scrivere le proprie risposte e NON di leggere quelle degli altri.
 *
 * Lasciando i valori segnaposto l'app funziona comunque: calcola tutto in
 * locale e avvisa che il salvataggio non è configurato.
 */

window.AIAA_CONFIG = {
  supabaseUrl: 'https://bpsjetopgkaiicmtsxrw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwc2pldG9wZ2thaWljbXRzeHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NzUwMDUsImV4cCI6MjEwMjU1MTAwNX0._gu8Wt7__AZslZdUNPuhKaYCxDCxbRvlobVmI48qOvs'
};
