# Local-First-Deployment für Financiero

**Stand:** 27. Juli 2026  
**Ziel:** Zugriff vom Handy und Laptop, keine Verarbeitung von Bankdaten durch Cloud-Dienste,
später optional Nutzung durch Freunde.

## Kurzentscheidung

Für den eigenen Betrieb ist die beste Zielarchitektur ein dedizierter Rechner im eigenen Netz:

```text
Handy / Laptop
      │
      │ WireGuard-VPN
      ▼
Caddy (HTTPS, nur VPN)
      │
      ▼
Financiero (Next.js)
      ├── PostgreSQL          nur internes Netz
      ├── FinTS-Sidecar       nur Loopback/intern ──► Bank
      └── Ollama/llama.cpp    nur Loopback/intern
```

Für Freunde ist **nicht** eine gemeinsame Instanz der nächste sinnvolle Schritt. Empfohlen wird
zunächst eine getrennte Instanz je Person oder Haushalt, jeweils mit eigener Datenbank und eigenen
Schlüsseln. Eine zentrale Mehrbenutzerinstanz ist technisch und rechtlich ein anderes Produkt.

## Was „lokal“ in diesem Fall bedeutet

Im Heimnetz bleiben die Daten physisch im eigenen Netz. Beim Zugriff von unterwegs fließen
verschlüsselte Datenpakete zwangsläufig über das Internet zum Handy. Das erreichbare Schutzziel ist
daher:

- keine Verarbeitung durch Vercel, Neon, OpenRouter oder andere Cloud-Anbieter;
- keine öffentlich erreichbare App, Datenbank, FinTS- oder LLM-Schnittstelle;
- nur Ende-zu-Ende-verschlüsselter Zugang über ein privates VPN;
- ausgehender Verkehr nur zum absichtlich angesprochenen FinTS-Endpunkt der Bank und während
  kontrollierter Updates.

Für einen Freund ist eine Instanz auf dem Rechner des Betreibers nicht „lokal beim Freund“. Der
Betreiber verwahrt dann technisch dessen Bankdaten und Zugangszustände.

## Aktueller Stand der App

Die App ist aktuell eine Single-User-Anwendung:

- `src/lib/session.ts` enthält keine wirksame Anmeldung.
- Bankverbindungen, Konten und Umsätze haben keine `userId`- oder `tenantId`-Spalte.
- Alle Abfragen arbeiten über den gesamten Datenbestand.
- `docker-compose.yml` ist eine Entwicklungsdatei und veröffentlicht PostgreSQL auf Port 5432.

Eine zentrale Freigabe für Freunde wäre deshalb heute ein Datenleck zwischen allen Benutzern.

Die in diesem Arbeitsschritt ergänzte lokale Konfiguration verhindert vorerst unbeabsichtigten
Cloud-Verkehr:

- `STRICT_LOCAL_MODE=true`
- `LLM_ENABLED=false`
- `ENABLE_BANKING_ENABLED=false`
- externe Google-Händlerlogos standardmäßig deaktiviert
- Next-Telemetrie deaktiviert
- Google-Fonts durch lokale System-Fonts ersetzt

FinTS bleibt erlaubt, weil die Verbindung zur eigenen Bank der fachlich notwendige Datenweg ist.

## FinTS-Produktregistrierung

Die Nummer `D052FC36C269123F1F375A630` ist eine 25-stellige
FinTS-Produktregistrierungsnummer, kein Bank-Credential. Sie wird jetzt serverseitig aus
`FINTS_PRODUCT_ID` gelesen und bei Erstverbindung, Wiederfreigabe und Sync verwendet.
`FINTS_PRODUCT_VERSION=0.1.0` wird separat übertragen.

Die [FinTS-Leitstelle](https://www.fints.org/de/hersteller/produktregistrierung) verlangt die
Registrierungsnummer bei jeder Dialoginitialisierung im Element „Produktbezeichnung“. Die
[FinTS-FAQ](https://www.fints.org/de/hersteller/faq-produktregistrierung) stellt klar:

- Registrierung erfolgt einmal pro Produkt, nicht pro Nutzer oder Version.
- Die Produktversion wird dennoch separat übertragen.
- Die registrierte fachliche Anwendung muss für den Nutzer erkennbar sein.
- Eine Nummer der Kategorie „FinTS-Bibliothek oder -Kernel“ darf nur für interne Tests verwendet
  werden.

Vor einem Betrieb für Freunde sollte deshalb im Zuteilungsschreiben geprüft werden, ob Produktname
und Kategorie zu „Financiero“ als Web-Server/Web-App passen. Andernfalls sollte die FinTS-Leitstelle
die Einordnung schriftlich bestätigen.

## Lokales LLM

### Empfehlung

Für einen ersten lokalen Betrieb ist Ollama am einfachsten. Die bestehende App verwendet bereits
`/v1/chat/completions`. Ollama unterstützt laut offizieller
[OpenAI-Kompatibilitätsdokumentation](https://docs.ollama.com/api/openai-compatibility) Streaming,
Tools und `response_format`; strukturierte JSON-Ausgaben sind ebenfalls
[dokumentiert](https://docs.ollama.com/capabilities/structured-outputs).

Ollama muss ausschließlich lokal laufen:

- `OLLAMA_NO_CLOUD=1` oder `disable_ollama_cloud: true`; siehe
  [Ollama FAQ](https://docs.ollama.com/faq).
- Bindung nur an `127.0.0.1:11434` beziehungsweise ein nicht veröffentlichtes Container-Netz.
- Port 11434 nie über LAN, VPN oder Internet freigeben; die
  [lokale Ollama-API](https://docs.ollama.com/api/authentication) verlangt keine Authentifizierung.
- Keine Modelle mit `:cloud` verwenden.

Nach Installation und einem lokalen Modell kann die bestehende App zunächst so umgestellt werden:

```dotenv
LLM_ENABLED=true
OPENROUTER_BASE_URL=http://127.0.0.1:11434/v1
OPENROUTER_API_KEY=ollama
CHAT_MODEL=qwen3:8b
CLASSIFY_MODEL=qwen3:8b
```

Der Name `OPENROUTER_*` sollte später in neutrale `LLM_*`-Variablen migriert werden. Der strikte
Modus blockiert bereits jetzt nicht-lokale LLM-URLs.

### Modell und Hardware

Ein sinnvoller Startpunkt ist Qwen3 8B in 4-Bit-Quantisierung. Qwen nennt Deutsch unter den
unterstützten Sprachen und hebt Tool Calling hervor
([offizielle Qwen3-Ankündigung](https://qwenlm.github.io/blog/qwen3/)). Grobe Staffelung:

- 16 GB gemeinsamer Speicher: 8B-Modell, eine Anfrage zur Zeit;
- 32 GB: 14B-Modell oder mehr Kontext/Parallelität;
- größere Modelle: dedizierte GPU beziehungsweise deutlich mehr gemeinsamer Speicher.

Auf Apple Silicon sollte Ollama für GPU-Beschleunigung nativ laufen. Auf einem Linux-GPU-Server kann
es im internen Container-Netz laufen. `llama.cpp` ist die kontrollierbarere Alternative und bietet
ebenfalls einen [OpenAI-kompatiblen lokalen Server](https://github.com/ggml-org/llama.cpp).

### App-seitige Leitplanken

- Salden, Summen, Zeiträume und Prognosen bleiben deterministischer Anwendungscode.
- Das LLM erhält nur die für die konkrete Antwort nötigen, möglichst aggregierten Daten.
- Keine PIN, TAN, FinTS-Zustände oder vollständigen IBANs in Prompts.
- Nur lesende, fest definierte Tools; kein SQL-, Shell-, URL- oder Zahlungswerkzeug.
- Buchungstexte gelten als fremdgesteuerter Inhalt und damit als mögliche Prompt-Injection.
- Antworten und Tool-Argumente werden gegen Schemas validiert.
- Der aktuelle Klassifizierungsblock mit bis zu 100 Händlern sollte für 8B/14B-Modelle auf etwa
  10–25 reduziert und mit Retry/Fallback getestet werden.

Ein klassisches RAG-System ist für die vorhandenen Funktionen zunächst unnötig. Die strukturierten
Daten liegen bereits in PostgreSQL; sichere, mandantengebundene Abfragen sind präziser.

## Fernzugriff und HTTPS

[WireGuard](https://www.wireguard.com/quickstart/) ist die bevorzugte Lösung, weil Server und
Schlüsselverwaltung vollständig selbst betrieben werden können. Pro Gerät wird ein eigener Peer
angelegt; verloren gegangene Geräte lassen sich einzeln sperren. Öffentlich erreichbar ist nur der
WireGuard-UDP-Port, nicht die Web-App.

Vor Next.js gehört ein Reverse Proxy. Das empfiehlt auch die offizielle
[Next.js-Self-Hosting-Dokumentation](https://nextjs.org/docs/app/guides/self-hosting). Caddy kann
HTTPS über eine interne CA bereitstellen; für weitere Geräte muss deren Root-Zertifikat installiert
werden ([Caddy Local HTTPS](https://caddyserver.com/docs/running#local-https-with-systemd)).

Tailscale ist komfortabler, wenn der Anschluss wegen CGNAT nicht eingehend erreichbar ist. Es
bringt jedoch einen externen Kontroll- und gegebenenfalls Relay-Dienst mit. Für das strengste
Schutzziel ist direktes WireGuard oder ein selbst betriebener Control Plane vorzuziehen.

## Wenn zuhause kein Rechner permanent läuft

Ohne irgendein eingeschaltetes, vertrauenswürdiges Gerät kann Financiero nicht gleichzeitig
jederzeit erreichbar, FinTS-synchronisierbar, lokal-LLM-fähig und frei von fremder
Serverinfrastruktur sein. Rechnen und Speichern muss entweder der Laptop, ein kleiner Heimrechner,
das Handy selbst oder ein fremder Server übernehmen.

| Variante | Datenhoheit | Verfügbarkeit | FinTS / lokales LLM | Einordnung |
|---|---|---|---|---|
| Laptop nur bei Bedarf | sehr hoch | nur wenn wach und online | vollständig auf dem Laptop | bester Sofortstart |
| Router-Wake-on-LAN + Laptop | sehr hoch | nach kurzer Startzeit | vollständig nach dem Aufwecken | guter Kompromiss |
| kleiner Mini-PC oder NAS | sehr hoch | dauerhaft | FinTS dauerhaft, LLM je nach Hardware | beste Dauerlösung |
| Handy-PWA mit Offline-Lesestand | hoch | letzter Datenstand jederzeit | kein zuverlässiger Hintergrund-Sync | Ergänzung, kein Serverersatz |
| eigener VPS | deutlich geringer | dauerhaft | technisch möglich, aber fremde Infrastruktur | mit strikter Vorgabe ungeeignet |

### Sofortlösung ohne neue Hardware

Der Laptop bleibt maßgeblicher Host für App, PostgreSQL, FinTS und Ollama. Das Handy verbindet
sich bei Bedarf über Router-WireGuard oder Tailscale. Solange der Laptop ausgeschaltet ist, bleiben
Sync und Assistent bewusst nicht verfügbar. Ein Router mit Wake-on-LAN kann einen per Ethernet
verbundenen Laptop aus dem Standby aufwecken. Tailscale kann einen ausgeschalteten Rechner nicht
selbst wecken; zudem läuft Tailscale auf macOS laut
[Unattended-Dokumentation](https://tailscale.com/docs/how-to/run-unattended) nicht unabhängig von
einem angemeldeten Benutzer.

Ein sinnvoller späterer Split benötigt keinen leistungsstarken Dauer-LLM-Server:

```text
kleiner Mini-PC oder vorhandenes NAS
  ├── App, PostgreSQL und FinTS dauerhaft
  └── lokale Warteschlange für KI-Aufgaben

Laptop nur bei Bedarf
  └── Ollama und Abarbeitung der Warteschlange
```

Damit bleiben Salden und deterministische Auswertungen erreichbar, während Chat und
KI-Klassifizierung klar als vorübergehend nicht verfügbar angezeigt werden.

### Rolle einer installierbaren Web-App

Financiero besitzt bereits ein Web-App-Manifest und mobile Symbole und kann bei sicherem HTTPS als
App-Verknüpfung auf dem Home-Bildschirm erscheinen. Aktuell ist sie dennoch ein Online-Client:
Es gibt noch keinen Service Worker und keinen verschlüsselten Offline-Lesecache.

Eine zukünftige Local-first-PWA kann einen reduzierten, verschlüsselten letzten Datenstand in
IndexedDB halten. Sie ersetzt den Backend-Host aber nicht:

- Service Worker sind keine Dauerprozesse und dürfen vom Browser beendet werden
  ([W3C Service Worker Lifetime](https://www.w3.org/TR/service-workers/#service-worker-lifetime)).
- Periodischer Hintergrund-Sync wird vom Browser nach Nutzung, Akku und Netzlage geplant und ist
  nicht garantiert
  ([Chrome Periodic Background Sync](https://developer.chrome.com/docs/capabilities/periodic-background-sync)).
- Browser-Speicher bleibt grundsätzlich „best effort“ und ist kein Backup
  ([WebKit Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)).
- PIN, TAN, FinTS-Zustände und Sitzungstokens gehören weder in IndexedDB noch in einen
  Service-Worker-Cache.

Ein rein statisch öffentlich gehostetes Frontend könnte ohne Finanzdaten betrieben werden, müsste
für FinTS und aktuelle Daten aber weiterhin den lokalen Host erreichen. Die aktuelle
serverseitige Next.js-/PostgreSQL-Architektur vollständig auf das Handy zu verlagern wäre eine
eigene native beziehungsweise Local-first-Neuentwicklung.

### Warum ein VPS oder eine öffentliche Web-App die Vorgabe nicht erfüllt

Ein selbst administrierter VPS ist nicht lokal: Bankdaten und Entschlüsselungsschlüssel befinden
sich während der Verarbeitung im Arbeitsspeicher fremder Infrastruktur. Festplattenverschlüsselung
schützt Backups und ausgeschaltete Datenträger, nicht den laufenden Prozess. Auch eine
„Confidential VM“ bleibt Verarbeitung im Rechenzentrum eines Dritten.

Eine klassische Web-App auf Vercel mit verwalteter Datenbank wäre bequem und hoch verfügbar,
würde aber Next.js-Ausführung, Datenbank, Logs und Backups auf Cloud-Anbieter verteilen. Unter der
genannten Lizenz- und Datenhoheitsvorgabe scheidet sie deshalb aus. Vertretbar wäre höchstens ein
VPS als reines WireGuard-Relay ohne Anwendung, Datenbank oder Bankdaten; der Laptop müsste
trotzdem online sein.

## Mehrbenutzerbetrieb

Vor einer gemeinsamen Instanz sind mindestens erforderlich:

1. echte Anmeldung, bevorzugt Passkeys;
2. `tenant_id` auf jeder sensiblen Tabelle;
3. Ableitung des Tenants ausschließlich aus der serverseitigen Sitzung;
4. PostgreSQL Row-Level Security und `FORCE ROW LEVEL SECURITY`;
5. eine App-Datenbankrolle, die weder Eigentümer noch Superuser noch `BYPASSRLS` ist;
6. mandantenbezogene Verschlüsselungsschlüssel, Exporte, Löschung und Backups;
7. Tests, die Cross-Tenant-Zugriff auf jeder Route und Server Action verhindern.

PostgreSQL verwendet bei aktivierter Row Security ohne passende Policy „default deny“. Eigentümer,
Superuser und `BYPASSRLS` umgehen sie jedoch standardmäßig; siehe
[PostgreSQL Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Selbst bei korrekter Mandantentrennung bleibt eine Instanz pro Freund oder Haushalt die
risikoärmere Architektur.

## Betriebssicherheit

- dedizierter, regelmäßig aktualisierter Host mit Vollverschlüsselung;
- zufällige Produktionspasswörter; Datenbank nicht auf einen Host-Port veröffentlichen;
- App, DB, Sidecar und LLM in getrennten Diensten und Netzen;
- FinTS-Sidecar und LLM nie direkt erreichbar;
- Verschlüsselungsschlüssel außerhalb der Datenbank speichern;
- verschlüsselte Backups auf zweitem Datenträger plus Offline-Kopie;
- monatlicher Test-Restore;
- keine PIN, TAN, Prompts, FinTS-Zustände oder Umsätze in Logs;
- ausgehende Firewall-Regeln und ein dokumentiertes Update-Fenster;
- bei einem Heimserver nach Möglichkeit USV und automatischer Wiederanlauf.

## Rechtliche Grenze bei Freunden

FinTS-Produktregistrierung und BaFin-Registrierung sind getrennte Fragen. Nach
[§ 1 Abs. 34 ZAG](https://www.gesetze-im-internet.de/zag_2018/__1.html) ist ein
Kontoinformationsdienst ein Online-Dienst, der konsolidierte Informationen über Zahlungskonten
bereitstellt. [§ 34 ZAG](https://www.gesetze-im-internet.de/zag_2018/__34.html) nennt eine
Registrierungspflicht bei gewerbsmäßigem Betrieb oder einem Umfang, der einen kaufmännisch
eingerichteten Geschäftsbetrieb erfordert. [§ 51 ZAG](https://www.gesetze-im-internet.de/zag_2018/__51.html)
regelt unter anderem Zustimmung, Zweckbindung und den Schutz personalisierter Sicherheitsmerkmale.

Kostenlosigkeit oder Heimhosting schließen diese Regeln nicht automatisch aus. Ob ein kleiner
privater Freundeskreis die Schwelle erreicht, ist eine Einzelfallfrage. Vor einer zentralen
Freunde-Instanz sollten FinTS-Leitstelle und bei Bedarf BaFin oder ein Fachanwalt die konkrete
Ausgestaltung schriftlich einordnen. Dies ist keine Rechtsberatung.

## Empfohlene Reihenfolge

1. FinTS nur mit dem eigenen Konto lokal testen.
2. Ollama lokal installieren, Cloud-Funktionen deaktivieren und die Chat-/Klassifizierungs-Evals
   bestehen lassen.
3. Dedizierten Host, WireGuard, Caddy, interne Netze und Backups aufsetzen.
4. Egress-Audit durchführen: im Normalbetrieb darf nur der FinTS-Sidecar die Bank erreichen.
5. Freunde zunächst mit getrennten Instanzen versorgen.
6. Eine gemeinsame Instanz erst nach Auth-, Tenant-, RLS- und Rechtsklärung entwickeln.
