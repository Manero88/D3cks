# 3Decks (D3cks)

Het kaartspel met drie decks, als webapp. Host een spel, deel de code van vier letters en speel met 3 tot 8 spelers. Lege plekken vul je met bots, of je speelt alleen tegen bots.

## Lokaal draaien

Je hebt Node 18 of nieuwer nodig.

```
npm install
npm start
```

Open daarna http://localhost:3000. Open een tweede tabblad of een privévenster om een tweede speler te testen.

## Testen

```
npm test
```

- `test/engine.test.js` speelt 2400 potjes met 3 tot 8 bots en controleert de regelscenario's.
- `test/server.test.js` speelt via de echte server een potje met host, joiner en bot, en test verbinding verliezen en terugkomen.

## Hoe het in elkaar zit

| Bestand | Wat het doet |
|---|---|
| `engine.js` | De spelregels en de bots. Geen netwerk, geen scherm. |
| `server.js` | Webserver en WebSocket-server. Houdt per spelcode één spel bij en controleert elke zet. |
| `public/index.html` | De drie schermen (start, lobby, speltafel) en alle opmaak. |
| `public/app.js` | Toont wat de server stuurt, stuurt jouw zetten terug en speelt de animaties af. |

De server is de baas over het spel. Elke speler krijgt alleen zijn eigen hand te zien. Van de anderen krijgt de browser alleen aantallen en de open kaarten, dus meekijken via de browser kan niet.

Spellen staan in het geheugen van de server. Na een herstart zijn lopende spellen weg.

## Gedrag om te weten

- Meedoen kan alleen in de lobby. Is het spel gestart, dan is de code dicht.
- Valt iemand weg, dan wacht het spel 15 seconden op zijn beurt en speelt daarna een bot voor hem. Komt hij terug (pagina opnieuw openen is genoeg), dan speelt hij zelf weer verder.
- Verlaat iemand het spel bewust, dan neemt een bot zijn plek over.
- Verlaat de host het spel, dan wordt een andere speler host.
- Een kamer zonder verbonden spelers wordt na 10 minuten opgeruimd.

## Online zetten (Render)

De app heeft een server nodig die WebSockets aankan. Statische hosts zoals Netlify zijn daarom niet genoeg. Render heeft een gratis laag die werkt:

1. Zet deze map in een GitHub-repository.
2. Maak een account op render.com en koppel GitHub.
3. Kies **New > Web Service**, selecteer de repository, build command `npm install`, start command `npm start`, plan **Free**.
4. Na het deployen staat het spel op een adres dat eindigt op `onrender.com`.

`render.yaml` bevat dezelfde instellingen, zodat Render ze ook zelf kan inlezen.

Let op bij de gratis laag: de server valt in slaap na 15 minuten zonder verkeer en heeft daarna ongeveer een minuut nodig om wakker te worden. Tijdens een potje gebeurt dat niet. De eerste speler van de avond moet dus even wachten.

## Instellingen

Omgevingsvariabelen, allemaal optioneel:

| Naam | Standaard | Betekenis |
|---|---|---|
| `PORT` | 3000 | Poort van de server |
| `BOT_DELAY` | 1000 | Denktijd van een bot in ms |
| `AWAY_DELAY` | 15000 | Wachttijd op een speler zonder verbinding in ms |
| `ROOM_TTL` | 600000 | Na hoeveel ms een lege kamer wordt opgeruimd |
