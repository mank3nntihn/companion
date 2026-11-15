// Alle Module der App. Ein neues Modul:
//   1. Ordner js/modules/<id>/ mit index.js anlegen (Vorlage: travel/index.js)
//   2. hier importieren und in die Liste aufnehmen
//   3. Tabellen per SQL-Migration in supabase/migrations/ anlegen
//
// Ein Modul ist ein Objekt mit:
//   id, name, description, icon      Kachel auf der Übersicht
//   title()                          Überschrift im Modul (optional)
//   tabs: [{id, label, icon}]        Unterseiten in der unteren Leiste (optional)
//   render(sub)                      zeichnet die Unterseite in #view
//   onAdd(sub)                       Plus-Knopf (optional)
//   handleAction(action, el)         Klicks auf [data-action], true wenn erledigt
//   handleChange(event)              Änderungen in Formularen, true wenn erledigt
//   handleShare(url)                 geteilter Link (optional)
//   card()                           HTML-Zusammenfassung für die Kachel (optional)
//   refreshEvery                     ms, wie oft die Ansicht neu gezeichnet wird (optional)

import travel from './travel/index.js';

export const modules = [travel];

export const findModule = (id) => modules.find((m) => m.id === id);
