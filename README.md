# Écran de salle

Hall display for Badnet tournaments, in Augny Badminton colours. It is a single
static page: the TV connects directly to the ScorBad Socket.IO feed, with no server.

## Use

Open `dist/index.html`, enter the tournament number or Badnet link, the number of
courts and the theme, then press Démarrer. Settings survive a reload. Move the
mouse or press Échap to change them. A bookmark also works:

    ?event=51180&terrains=5&theme=auto

Themes are `auto` (Christmas from 1 December to 6 January), `classique` and `noel`.

## Develop

    python3 build.py   # writes dist/index.html
    npm test           # tracker tests, no dependencies

| File | Role |
|---|---|
| `src/page.html` | Markup and styles |
| `src/screen.js` | Display, driven only through `window.EcranSalle` |
| `src/feed.js` | Feed connection and match tracking, testable in Node |
| `src/start.js` | Start screen and settings |
| `src/preview.js` | Simulation for design previews, never in `dist/` |

`assets/snapshot-raw.json` holds real player names and stays out of git. When it
is present, `build.py` also writes the local `index.html` preview, with these
shortcuts: `#noel`, `#classique`, `#coupure`, `#avant`, `#fin`, `#vide`,
`#forfait`, `#rafale`.

## Feed

`socket.scorbad.fr` is undocumented and can change without notice.

- It accepts connections from any origin, over WebSocket with `EIO=3`.
- `fin` gives the winner and final score, including for results entered at the GEO.
- It sends changes, not a full state. A screen opened mid-tournament catches up on
  courts, but rebuilds the upcoming list only as rows arrive.
- It does not expose the assembly point list. `Prochains matchs` is built from
  organiser rows and `event_nextmatchnum`, and it can be sparse.
- Courts with a name instead of a number, or above the configured count, are ignored.

## Data source API

`window.EcranSalle`:

| Call | Use |
|---|---|
| `heartbeat()` | On any traffic. It keeps `En direct` on. |
| `setHeader({ title, drift })` | Tournament name and schedule drift |
| `setPhase("before" \| "live" \| "after")` | Wording of the empty band |
| `setCourt(no, match \| null)` | `match`: `{ num, draw, round, dur, a, b, sets }`; `a` and `b` are lists of `{ n, i }` |
| `setScore(no, sets, side)` | Live score; `side` 0 or 1 flips the cell, null redraws |
| `endMatch(no, { winner, final, reason })` | Once per match. `reason` is `"wo"` or `"ab"` and never celebrates |
| `setQueue(list, animate)` | Upcoming matches |
