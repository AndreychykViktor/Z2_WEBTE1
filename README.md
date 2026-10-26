# Obedové menu v okolí fakulty

Zadanie č. 2 – WEBTE1, ZS 2026/2027
Autor: Viktor Andreychyk

Webová stránka načíta stránky jedální a bufetov v okolí FEI STU, spracuje z nich denné menu
a prehľadne ho zobrazí podľa dní v týždni. Všetko beží iba na strane klienta (HTML, CSS, JavaScript).

## Spustenie

Stránka používa `fetch()`, preto ju treba otvoriť cez webový server (nie cez `file://`):

- na školskom serveri, alebo
- lokálne napr. vstavaným serverom WebStormu (pravý klik na `index.html` → *Open in Browser*),
  prípadne `python3 -m http.server` v koreňovom priečinku projektu.

### Proxy

Adresa proxy oznámená na cvičení sa nastavuje v súbore `js/config.js` (vlastnosť `proxyUrl`).
Zástupný reťazec `{url}` sa nahradí zakódovanou adresou stránky reštaurácie, napr.:

```js
proxyUrl: 'https://adresa-proxy/?url={url}'
```

Kým je adresa prázdna, režim „Živá stránka“ zobrazí pri každej reštaurácii chybové hlásenie
a predvolene sa používajú lokálne kópie. Prepínač „Zdroj dát“ prepína medzi živou stránkou
(cez proxy) a lokálnou kópiou.

## Reštaurácie

| Reštaurácia | Stránka | Štruktúra |
|---|---|---|
| Eat & Meet (ŠD Átriaky) | https://www.eatandmeet.sk/tyzdenne-menu | Bootstrap záložky `div#day-1 … #day-7`, bloky `.menu-body` |
| Reštaurácia DRAG (Staré Grunty 64) | https://www.restauracia-drag.sk/denne-menu | záložky `div.tab-pane#pondelok … #piatok`, polievka za nadpisom `.menu_box_title`, jedlá v tabuľke, cena v `td.text-right` |
| FiitFood (FIIT STU) | http://www.freefood.sk/menu/ (sekcia `#fiit-food`) | zoznamy `ul.daily-offer > li`, `ul.day-offer > li` |

Lokálne kópie sú v priečinku `local/` (Eat & Meet a FiitFood uložené 14. 10. 2026, DRAG 26. 10. 2026). Sú zjednodušené – bez skriptov,
štýlov a obrázkov – ale so zachovanou štruktúrou menu (značky, triedy, id), takže ich spracúva
ten istý parser ako živé stránky.

## Štruktúra projektu

```
index.html            hlavná stránka (denné menu)
o-projekte.html       podstránka „O projekte“
css/fonts.css         @font-face pre písmo Poppins (.woff2)
css/style.css         vlastné štýly
js/config.js          konfigurácia (proxy, kľúče localStorage)
js/utils.js           pomocné funkcie (dni, dátumy, ceny, alergény, hmotnosti)
js/restaurants.js     zoznam reštaurácií + parser pre každú z nich
js/storage.js         ukladanie dát do localStorage
js/loader.js          načítanie (Fetch API) a spracovanie (DOMParser)
js/app.js             ovládanie a vykresľovanie (jQuery)
local/                lokálne kópie stránok reštaurácií
fonts/                písmo Poppins (.woff2) + licencia OFL.txt
vendor/               Bootstrap 5.3.3, Bootstrap Icons 1.11.3, jQuery 3.7.1
img/                  favicon
docs/                 výpisy z validátorov HTML a CSS
```

Pridanie ďalšej reštaurácie: do poľa `RESTAURANTS` v `js/restaurants.js` stačí doplniť objekt
s `id`, `name`, `url`, `localCopy`, `address` a vlastnou funkciou `parse(doc)`, ktorá vráti pole
položiek v jednotnej štruktúre (`MenuUtils.createItem`).

## Použité knižnice

- **Bootstrap 5.3.3** (CSS + JS) – MIT licencia
- **Bootstrap Icons 1.11.3** – MIT licencia
- **jQuery 3.7.1** – MIT licencia

Nepoužívajú sa JavaScriptové frameworky ani knižnice na scrapovanie.

## Písmo a licencia

Písmo **Poppins** (Indian Type Foundry, https://github.com/itfoundry/Poppins) je priložené
lokálne vo formáte `.woff2` (podmnožiny latin a latin-ext, rezy 400, 500, 600, 700) a načítava sa
cez `@font-face` v súbore `css/fonts.css`.
Licencia: **SIL Open Font License, Version 1.1** – plné znenie je v súbore `fonts/OFL.txt`.

## Validácia

HTML bolo overené na https://validator.w3.org/ a CSS na https://jigsaw.w3.org/css-validator/ –
bez chýb. Výpisy a screenshoty sú v priečinku `docs/`.

