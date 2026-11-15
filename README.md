# Hafen

Unsere gemeinsame App. Läuft im Browser, lässt sich zum Home-Bildschirm hinzufügen und funktioniert offline. Auf der Startseite stehen alle Module als Kacheln, mit einer kurzen Vorschau, was gerade ansteht.

## Module

### Travel Buddy
- **Tickets**: Flüge, Fähren, Busse, Transfers. Oben steht immer die nächste Abfahrt mit „Da sein“-Zeit, Countdown, Pier/Terminal (öffnet Google Maps) und einem Knopf, der alle Tickets im Vollbild zeigt.
- **Unterkünfte**: Link aus Booking.com, Agoda, Airbnb oder Hostelworld einfügen, Name und Reisedaten werden aus dem Link übernommen (Airbnb-Links enthalten keinen Namen). Lücken zwischen Unterkünften werden angezeigt.
- **Offline**: Daten und alle Dateien werden auf dem Handy gespeichert, sobald die App einmal online war. Bearbeiten geht nur mit Internet.
- **Teilen** (Android): In der Booking/Agoda-App „Teilen“ → „Hafen“ legt direkt eine neue Unterkunft an.

Vorschau ohne Datenbank: `…/travelbuddy/?demo`

## Einrichtung

1. **Datenbank**: `supabase/migrations/0001_init.sql` und `0002_username_login.sql` im Supabase SQL Editor ausführen (beim Projekt `travelbuddy` schon erledigt).
2. **Konten anlegen**: im SQL Editor pro Person
   ```sql
   select private.create_user('robin', 'ein-sicheres-passwort');
   ```
   Das Konto ist damit sofort angelegt und freigeschaltet. Benutzernamen: a–z, 0–9, Punkt, Minus, Unterstrich. Das Passwort lässt sich später in der App unter *Konto & Offline* ändern. Eine Registrierung in der App gibt es bewusst nicht.
3. **Zugangsdaten**: Projekt-URL und Publishable Key stehen in `js/config.js`.
4. **Hosting**: In GitHub unter *Settings → Pages* als Quelle „GitHub Actions“ wählen. Jeder Push auf `main` veröffentlicht die Seite.

Intern macht die App aus dem Benutzernamen eine Adresse `name@travelbuddy.local`, weil Supabase eine E-Mail braucht. Es werden nie Mails verschickt.

## Aufbau

Reines HTML/CSS/JavaScript ohne Build-Schritt.

| Pfad | Inhalt |
| --- | --- |
| `index.html` | Gerüst, Icons |
| `css/app.css` | Gestaltung (hell/dunkel) |
| `js/config.js` | App-Name, Reise-Name, Supabase-Zugang |
| `js/app.js` | Hülle: Anmeldung, Startseite, Navigation, Konto-Menü |
| `js/core/` | Gemeinsames: Daten und Offline-Cache, Router, UI-Bausteine, Zeitzonen |
| `js/modules/index.js` | Liste aller Module |
| `js/modules/travel/` | Modul Travel Buddy |
| `sw.js` | Service Worker (Offline) |
| `supabase/migrations/` | Datenbank-Schema |

Adressen: `#/` ist die Startseite, `#/travel/tickets` und `#/travel/stays` sind die Seiten von Travel Buddy.

### Neues Modul hinzufügen

1. Ordner `js/modules/<id>/` mit `index.js` anlegen. Welche Felder ein Modul hat, steht oben in `js/modules/index.js`, als Vorlage dient `js/modules/travel/index.js`.
2. Modul in `js/modules/index.js` importieren und in die Liste aufnehmen.
3. Tabellen als neue Datei in `supabase/migrations/` anlegen, mit derselben Zugriffsregel wie die anderen Tabellen (`private.is_member()`), und im Modul per `db.registerTable()` anmelden.
4. Neue JS-Dateien in `sw.js` unter `SHELL` eintragen, damit sie offline verfügbar sind.

Zeiten von Tickets werden als Ortszeit plus Zeitzone gespeichert: „09:00 ab Phuket“ bleibt 09:00 Thai-Zeit, egal wo das Handy gerade eingestellt ist.
