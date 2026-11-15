# Travel Buddy

Unsere Reise-App für Unterkünfte und Tickets. Läuft im Browser, lässt sich zum Home-Bildschirm hinzufügen und funktioniert offline, auch die angehängten Tickets.

- **Tickets**: Flüge, Fähren, Busse, Transfers. Oben steht immer die nächste Abfahrt mit „Da sein“-Zeit, Countdown, Pier/Terminal (öffnet Google Maps) und einem Knopf, der alle Tickets im Vollbild zeigt.
- **Unterkünfte**: Link aus Booking.com, Agoda, Airbnb oder Hostelworld einfügen, Name und Reisedaten werden aus dem Link übernommen (Airbnb-Links enthalten keinen Namen). Lücken zwischen Unterkünften werden angezeigt.
- **Offline**: Daten und alle Dateien werden auf dem Handy gespeichert, sobald die App einmal online war. Bearbeiten geht nur mit Internet.
- **Teilen** (Android): In der Booking/Agoda-App „Teilen“ → „Travel Buddy“ legt direkt eine neue Unterkunft an.

Vorschau ohne Datenbank: `…/travelbuddy/?demo`

## Einrichtung

1. **Datenbank**: `supabase/migrations/0001_init.sql` im Supabase SQL Editor ausführen. Legt Tabellen, Zugriffsregeln und den privaten Speicher `documents` an.
2. **Freischalten**: eure beiden Google-Adressen eintragen:
   ```sql
   insert into public.members (email, name) values ('du@gmail.com', 'Robin'), ('sie@gmail.com', '…');
   ```
3. **Zugangsdaten**: Projekt-URL und Publishable Key in `js/config.js` eintragen.
4. **Google-Login**: In Supabase unter *Authentication → Sign In / Providers → Google* aktivieren (Client-ID und Secret aus der Google Cloud Console). Unter *Authentication → URL Configuration* die Site-URL `https://mank3nntihn.github.io/travelbuddy/` setzen und als Redirect-URL eintragen.
5. **Hosting**: In GitHub unter *Settings → Pages* als Quelle „GitHub Actions“ wählen. Jeder Push auf `main` veröffentlicht die Seite.

## Aufbau

Reines HTML/CSS/JavaScript ohne Build-Schritt.

| Datei | Inhalt |
| --- | --- |
| `index.html` | Gerüst, Icons |
| `css/app.css` | Gestaltung (hell/dunkel) |
| `js/app.js` | Seiten, Formulare, Ticket-Viewer |
| `js/data.js` | Supabase, Offline-Cache, Dateien |
| `js/links.js` | Erkennung von Booking/Agoda/Airbnb-Links |
| `js/time.js` | Ortszeiten und Zeitzonen |
| `sw.js` | Service Worker (Offline) |

Zeiten von Tickets werden als Ortszeit plus Zeitzone gespeichert: „09:00 ab Phuket“ bleibt 09:00 Thai-Zeit, egal wo das Handy gerade eingestellt ist.
