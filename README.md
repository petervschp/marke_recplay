# Marker Recorder MVP+

Jednoduché Expo/React Native MVP pre Android:
- nahrávanie zvuku,
- pridávanie markerov počas nahrávania,
- prehrávanie od zvoleného markeru,
- automatické zastavenie na ďalšom markeri,
- tlačidlá na skok na predchádzajúci a ďalší marker,
- knižnica uložených nahrávok,
- výber aktívnej nahrávky,
- premenovanie a mazanie nahrávok.

## Čo pribudlo

### Knižnica nahrávok
- každá dokončená nahrávka sa uloží do zoznamu,
- ku každej nahrávke sa ukladajú markery, dĺžka a čas vytvorenia,
- zoznam sa drží trvalo cez AsyncStorage,
- vieš prepnúť aktívnu nahrávku,
- aktívnu nahrávku vieš premenovať alebo zmazať.

### Prehrávanie
- markery sú naviazané na konkrétnu nahrávku,
- po výbere nahrávky sa načíta správny audio súbor aj jej markery,
- prehrávanie sa zastaví na nasledujúcom markeri.

## Inštalácia

```bash
npm install
npx expo start
```

Pre Android build:

```bash
npx expo run:android
```

## Závislosti navyše

Projekt po novom používa aj:

```bash
npx expo install @react-native-async-storage/async-storage expo-file-system
```

## Poznámky

- metadata nahrávok sa ukladajú do AsyncStorage,
- pri mazaní sa appka pokúsi zmazať aj audio súbor z lokálneho disku,
- ak sa zmazanie súboru nepodarí, nahrávka sa aj tak odstráni zo zoznamu a appka na to upozorní.

## Ďalšie vhodné rozšírenia

1. editácia názvov markerov,
2. filtrovanie a vyhľadávanie v knižnici,
3. export markerov do JSON/CSV,
4. import existujúcich audio súborov,
5. waveform a jemnejší scrubber,
6. prehrávanie na lock screene / headset ovládanie.
