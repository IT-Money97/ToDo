# Für immer – gemeinsame Hochzeitsplanung

Eine installierbare, responsive Web-App für die gemeinsame Hochzeitsplanung auf iPhone, iPad und Desktop. Aufgaben, Unteraufgaben, Termine, Bereiche und geplante/bezahlte Kosten werden in Supabase gespeichert und live für beide Mitglieder synchronisiert.

## Funktionen

- Anmeldung per E-Mail-Link – kein Passwort erforderlich
- Privater Hochzeitsbereich mit Einladung per Link/Code
- Ein gemeinsamer Hochzeitsbereich pro Konto, mit maximal zwei Mitgliedern
- Aufgaben und beliebig verschachtelte Unteraufgaben mit Bereich, Notizen, Termin und Kosten
- Aufgaben abhaken und Kosten als bezahlt markieren
- Übersicht mit Countdown, Fortschritt und nächsten Terminen
- Budgetübersicht mit Kosten je Bereich sowie bezahlt/offen
- Installierbare PWA; auf dem iPhone in Safari über **Teilen → Zum Home-Bildschirm**
- Row Level Security (RLS) auf allen Tabellen; nur Mitglieder sehen die Daten des gemeinsamen Bereichs

## Online schalten: Supabase + Vercel

### 1. Supabase-Projekt anlegen

1. Erstelle ein Projekt unter [supabase.com](https://supabase.com/).
2. Öffne im Projekt **SQL Editor → New query**, füge den Inhalt von [`supabase/schema.sql`](./supabase/schema.sql) ein und führe ihn aus. Das erstellt Tabellen, Zugriffsschutz, Einladungscode-Funktionen und Echtzeit-Synchronisierung.
3. Unter **Project Settings → API** kopiere die **Project URL** und den **Publishable key** (bei älteren Projekten heißt er `anon` key). **Niemals** den `service_role`-Key in die App, in GitHub oder in Vercel-Frontend-Variablen eintragen.
4. Unter **Authentication → URL Configuration** setze deine spätere Vercel-Adresse als **Site URL** und ergänze sie bei **Redirect URLs**. Während der Entwicklung ergänze `http://localhost:5173/**`.
5. Stelle unter **Authentication → Providers → Email** sicher, dass E-Mail-Links aktiviert sind. Passe bei Bedarf den E-Mail-Text und Versandlimits im Supabase-Dashboard an.

### 2. Lokal starten

```powershell
npm install
Copy-Item .env.example .env.local
```

Trage die Supabase Project URL und den Publishable/anon Key in `.env.local` ein und starte:

```powershell
npm run dev
```

`.env.local` ist lokal und wird nicht in Git eingecheckt.

### 3. Auf Vercel veröffentlichen

1. Melde dich bei [vercel.com](https://vercel.com/) an und importiere das GitHub-Repository `IT-Money97/ToDo`.
2. Vercel erkennt Vite über [`vercel.json`](./vercel.json); Build-Befehl `npm run build`, Ausgabeordner `dist`.
3. Hinterlege in Vercel unter **Project Settings → Environment Variables** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` für **Production**, **Preview** und (falls gewünscht) **Development**.
4. Deploye das Projekt. Trage danach die veröffentlichte `https://…vercel.app`-Adresse wie in Schritt 1 beschrieben in Supabase als **Site URL** und **Redirect URL** ein und deploye erneut.
5. Öffne die Vercel-Adresse auf beiden iPhones, melde euch jeweils mit eurer E-Mail an. Eine Person erstellt die Planung und teilt den Link unter **Einstellungen**; die zweite Person öffnet den Link, meldet sich an und tritt mit dem vorausgefüllten Einladungscode bei.

**iPhone:** Link in Safari öffnen → Teilen → **Zum Home-Bildschirm**. Die App passt sich an iPhone- und iPad-Bildschirme an.

## Prüfen

```powershell
npm run build
```

Für die Freigabe nicht den Supabase `service_role`-Key verwenden. Die öffentliche Publishable/anon-Anwendung ist durch RLS geschützt; Änderungen an Policies und Datenzugriff sollten vor einer erweiterten Nutzung geprüft werden.
