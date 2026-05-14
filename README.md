# Marker Recorder – čistá JS webapka

Statická webaplikácia bez backendu:
- nahrávanie zvuku cez mikrofón,
- pridávanie markerov počas nahrávania,
- lokálne uloženie nahrávok a markerov do IndexedDB,
- prehrávanie po markerových segmentoch,
- prechod na predchádzajúci / ďalší marker,
- premenovanie a mazanie nahrávok aj markerov.

## Dôležité

Mikrofón v prehliadači funguje iba cez:
- `https://...`
- alebo lokálne cez `http://localhost`

To znamená, že na mobile je najpraktickejšie testovať appku cez **GitHub Pages** alebo iný HTTPS hosting.

## Súbory

- `index.html` – rozhranie
- `styles.css` – štýly
- `app.js` – logika aplikácie

## Lokálne spustenie

Najjednoduchšie:

```bash
python -m http.server 8000
```

Potom otvor:

```text
http://localhost:8000
```

## GitHub Pages

1. Vytvor nový Git repozitár.
2. Nahraj tieto súbory do koreňa repo.
3. Pushni ich na GitHub.
4. V GitHub repozitári otvor:
   - **Settings → Pages**
5. Ako source vyber:
   - **Deploy from a branch**
   - branch napr. `main`
   - folder `/ (root)`
6. Po deployi otvor pridelenú URL cez `https://...`

## Poznámky k ukladaniu

- Nahrávky sa ukladajú do **IndexedDB v konkrétnom prehliadači a zariadení**.
- Ak otestuješ appku v Chrome na mobile, dáta budú len tam.
- Pri vymazaní dát prehliadača môžeš o nahrávky prísť.

## Budúci smer

Táto verzia je dobrý základ na ďalšie rozšírenie:
- PWA manifest a service worker,
- export/import nahrávok,
- waveform,
- lepšia správa knižnice,
- synchronizácia na server.
