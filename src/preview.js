// Dev only, never in the production build: replays a real snapshot through the same
// API a live data source will use. Hash shortcuts show each state on demand.
export function runPreview(screen, { LIVE, QUEUE }) {
  const TARGET = 15, CAP = 21, SETS_TO_WIN = 2, TICK_MS = 1500, TICKS_PER_FINISH = 14, FIRST_FINISH_TICK = 6;
  const CLUB_HOLD_MS = 12000, HOLD_MS = 7000, FREE_MS = 3500, SCORED_COURT = 5;
  const random = (n) => Math.floor(Math.random() * n);
  const mode = location.hash.slice(1);

  screen.setHeader({ title: "Mussibad 17", drift: "Avance de 6 min" });

  if (mode === "avant" || mode === "fin") {
    screen.setPhase(mode === "avant" ? "before" : "after");
    setInterval(screen.heartbeat, TICK_MS);
    screen.heartbeat();
    return;
  }

  const courts = new Map();
  let nextNumber = 600;
  const queue = QUEUE.map((m) => ({ ...m }));
  for (const m of LIVE) {
    const match = { ...m, sets: m.score ? [m.score] : null };
    courts.set(m.court, match);
    screen.setCourt(m.court, match);
  }
  if (mode === "vide") queue.length = 0;
  screen.setQueue(queue.slice(0, 4));

  const setWon = (a, b) => (Math.max(a, b) >= TARGET && Math.abs(a - b) >= 2) || Math.max(a, b) >= CAP;

  function release(no, match, hold) {
    setTimeout(() => {
      queue.push({ ...match, sets: undefined });
      courts.delete(no);
      screen.setCourt(no, null);
      setTimeout(() => {
        const next = queue.shift();
        if (!next) return;
        // A replayed fixture needs a new number: the screen ends each match only once.
        const replay = { ...next, court: no, dur: 0, num: nextNumber++, sets: no === SCORED_COURT ? [[0, 0]] : null };
        courts.set(no, replay);
        screen.setCourt(no, replay);
        screen.setQueue(queue.slice(0, 4), true);
      }, FREE_MS);
    }, hold);
  }

  function finish(no, winner, reason = null) {
    const m = courts.get(no);
    const final = m.sets ? m.sets.map((s) => s.join("-")).join(" ") : ["15-12 15-10", "15-13 11-15 15-9", "16-14 15-11"][random(3)];
    const clubWin = winner != null && !reason && (winner === 0 ? m.a : m.b).some((p) => p.i.endsWith("CSJBAD57"));
    courts.delete(no);
    screen.endMatch(no, { winner, final: reason ? null : final, reason });
    release(no, m, clubWin ? CLUB_HOLD_MS : HOLD_MS);
  }

  function point(no, m) {
    const set = m.sets[m.sets.length - 1];
    const side = random(2);
    set[side]++;
    screen.setScore(no, m.sets.map((s) => [...s]), side);
    if (!setWon(set[0], set[1])) return;
    const wins = [0, 1].map((s) => m.sets.filter(([a, b]) => setWon(a, b) && (s === 0 ? a > b : b > a)).length);
    if (Math.max(...wins) === SETS_TO_WIN) finish(no, wins[0] > wins[1] ? 0 : 1);
    else {
      m.sets.push([0, 0]);
      screen.setScore(no, m.sets.map((s) => [...s]), null);
    }
  }

  let ticks = 0;
  function tick() {
    if (!navigator.onLine || (mode === "coupure" && ticks >= 5)) return;
    screen.heartbeat();
    ticks++;
    const live = [...courts.entries()];
    const scored = live.filter(([, m]) => m.sets);
    if (scored.length) point(...scored[random(scored.length)]);
    if (mode === "forfait" && ticks === 3) { finish(1, 1, "wo"); return; }
    if (mode === "rafale" && ticks === 3) { finish(1, 0); finish(2, 0); return; }
    if (ticks === FIRST_FINISH_TICK && courts.has(1)) { finish(1, 0); return; }
    const unscored = live.filter(([no, m]) => !m.sets && courts.has(no));
    if (ticks % TICKS_PER_FINISH === 0 && unscored.length) {
      finish(unscored[random(unscored.length)][0], random(3) ? random(2) : null);
    }
  }

  screen.heartbeat();
  setInterval(tick, TICK_MS);
}
