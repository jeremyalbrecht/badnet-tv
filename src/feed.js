// Turns the ScorBad feed into calls on the screen API. There is no server: the
// TV connects straight to the Socket.IO feed. The feed sends changes, not a full
// state, so `createTracker` keeps the picture and `connectFeed` only moves bytes.
const HOLD_MS = 7000, CLUB_HOLD_MS = 12000, NO_RESULT_MS = 4000, SETTLED_MS = 10000;
const PING_MS = 10000, RETRY_MIN_MS = 2000, RETRY_MAX_MS = 30000;
const URL = "wss://socket.scorbad.fr/socket.io/?EIO=3&transport=websocket";

const text = (html) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const courtNumber = (value, courts) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= courts ? n : null;
};

export function parseSets(score) {
  return String(score ?? "").trim().split(/\s+/).filter(Boolean)
    .map((set) => set.split("-").map(Number))
    .filter((set) => set.length === 2 && set.every(Number.isFinite));
}

// "<p>MARTIN Léa<span>Sen - N2 - OFPBAD54</span></p>..."
export function parsePairHtml(html) {
  return [...String(html ?? "").matchAll(/<p>([^<]*)<span>([^<]*)<\/span><\/p>/g)]
    .map((m) => ({ n: m[1].trim(), i: m[2].trim() }));
}

// One organiser row from event_updatelive.
export function parseRow(html) {
  const num = Number(html.match(/class="live-nummatch">(\d+)/)?.[1]);
  if (!num) return null;
  const sides = html.split(/class="live-pair /).slice(1).map((part) =>
    [...part.matchAll(/class="[^"]*\bplayer\b[^"]*"[^>]*>([^<]*)<\/a>/g)].map((m) => {
      const [n, ...info] = m[1].split(" - ");
      return { n: n.trim(), i: info.join(" - ").trim() };
    }));
  return {
    num,
    status: html.match(/class="line-match ?([^"]*)"/)?.[1].trim() ?? "",
    court: Number(html.match(/class="live-terrain">(\d+)/)?.[1] ?? 0),
    draw: text(html.match(/live-drawname[^>]*>([^<]*)/)?.[1]),
    round: text(html.match(/class="live-step">([^<]*)/)?.[1]),
    a: sides[0] ?? [],
    b: sides[1] ?? [],
  };
}

export function createTracker(screen, { eventId, courts, send = () => {}, setTimer = setTimeout, now = Date.now, saved = {}, save = () => {} }) {
  const id = Number(eventId);
  const onCourt = new Map();    // match number -> { court, match, pair1, pair2, left }
  const results = new Set();
  const details = new Map(saved.details ?? []);   // player name -> "Sen - N2 - OFPBAD54"
  let upcoming = new Map(saved.upcoming ?? []);
  let nextNumber = saved.nextNumber ?? 0;
  let connectedAt = now();
  let subscribed = new Set();
  let title = "", drift = saved.drift ?? "";

  const persist = () => save({ details: [...details], upcoming: [...upcoming], nextNumber, drift });
  const showHeader = () => screen.setHeader({ title, drift });
  const enrich = (p) => ({ ...p, i: details.get(p.n) ?? p.i });

  function player(p) {
    if (!p) return null;
    const n = `${p.familyname} ${p.firstname}`;
    const age = p.member?.catage?.nameshort;
    return { n, i: details.get(n) ?? [age, p.team].filter(Boolean).join(" - ") };
  }
  const side = (pair) => [player(pair?.player1), player(pair?.player2)].filter(Boolean);

  function showQueue(animate) {
    const list = [...upcoming.values()]
      .filter((m) => m.num >= nextNumber && !results.has(m.num))
      .sort((x, y) => x.num - y.num)
      .map((m) => ({ ...m, a: m.a.map(enrich), b: m.b.map(enrich) }));
    screen.setQueue(list, animate);
  }

  function subscribe(m) {
    if (subscribed.has(m.number)) return;
    subscribed.add(m.number);
    send(["livescore", { eventid: id, match: m.number, base: m.baseid, court: m.court }]);
  }

  function onMatch(m) {
    if (m.eventid !== id) return;
    if (m.eventname && m.eventname !== title) { title = m.eventname; showHeader(); }
    const court = courtNumber(m.court, screen.courts);
    if (!court || results.has(m.number)) return;
    subscribe(m);
    if (upcoming.delete(m.number)) { showQueue(true); persist(); }
    const known = onCourt.get(m.number);
    const score = m.score ? parseSets(m.score.score) : null;
    if (known?.court === court) return;
    for (const [num, other] of onCourt) if (other.court === court) onCourt.delete(num);
    const flipped = score && String(m.score.pair_left) !== String(m.pair1?.id);
    const justStarted = now() - connectedAt > SETTLED_MS;
    const match = {
      num: m.number, draw: m.label, round: m.round,
      dur: m.score?.length ?? (justStarted ? 0 : null),
      a: side(m.pair1), b: side(m.pair2),
      sets: score ? score.map((s) => (flipped ? [s[1], s[0]] : s)) : null,
    };
    onCourt.set(m.number, { court, match, pair1: String(m.pair1?.id), pair2: String(m.pair2?.id) });
    screen.setCourt(court, match);
  }

  function onScore(s) {
    const known = onCourt.get(s.match);
    if (!known) return;
    const flipped = String(s.pair_left) !== known.pair1;
    const sets = parseSets(s.score).map((x) => (flipped ? [x[1], x[0]] : x));
    const before = known.match.sets?.at(-1);
    const last = sets.at(-1);
    const changed = before && last ? [0, 1].find((i) => last[i] !== before[i]) : undefined;
    known.match.sets = sets;
    known.match.dur = s.length ?? known.match.dur;
    if (sets.length) screen.setScore(known.court, sets, changed ?? null);
  }

  function clearLater(num, hold) {
    setTimer(() => {
      const known = onCourt.get(num);
      if (!known) return;
      onCourt.delete(num);
      screen.setCourt(known.court, null);
    }, hold);
  }

  function onFin(f) {
    const known = onCourt.get(f.match);
    if (!known || results.has(f.match)) return;
    results.add(f.match);
    const winner = String(f.pair_win) === known.pair1 ? 0 : String(f.pair_win) === known.pair2 ? 1 : null;
    const pair = winner === 0 ? known.match.a : winner === 1 ? known.match.b : [];
    screen.endMatch(known.court, { winner, final: f.score ?? null });
    clearLater(f.match, pair.some(screen.isOurs) ? CLUB_HOLD_MS : HOLD_MS);
  }

  // delmatch comes just before fin. Without fin, the match was simply withdrawn.
  function onDelete(d) {
    setTimer(() => {
      if (!results.has(d.match) && onCourt.has(d.match)) clearLater(d.match, 0);
    }, NO_RESULT_MS);
  }

  function onCurrent(items) {
    for (const { html } of items) {
      if (!html || typeof html !== "object") continue;
      for (const p of [...parsePairHtml(html.pair1), ...parsePairHtml(html.pair2)]) details.set(p.n, p.i);
      const known = onCourt.get(html.num);
      if (!known) continue;
      known.match.a = known.match.a.map(enrich);
      known.match.b = known.match.b.map(enrich);
      if (html.duration != null) known.match.dur = html.duration;
      screen.setCourt(known.court, known.match);
    }
    persist();
  }

  function onRows(rows) {
    let changed = false;
    for (const row of rows) {
      if (typeof row.html !== "string") continue;
      const parsed = parseRow(row.html);
      if (!parsed) continue;
      for (const p of [...parsed.a, ...parsed.b]) if (p.i) details.set(p.n, p.i);
      const waiting = !parsed.court && parsed.status !== "match-end";
      if (waiting) { upcoming.set(parsed.num, parsed); changed = true; }
      else if (upcoming.delete(parsed.num)) changed = true;
    }
    if (changed) showQueue(false);
    persist();
  }

  function onUpdate(p) {
    if (p.data?.late && p.data.late !== drift) { drift = p.data.late; showHeader(); }
    if (Array.isArray(p.data?.matchs)) onRows(p.data.matchs);
  }

  return {
    opened() {
      connectedAt = now();
      subscribed = new Set();
      send(["join_matchlive"]);
      send(["matchs"]);
      send(["join_event", String(id)]);
    },
    handle(name, payload) {
      if (!payload || typeof payload !== "object") return;
      if (name === "matchlive" || name === "match" || name === "dispatchmatch") { onMatch(payload); return; }
      if ((payload.event ?? payload.eventid) !== id) return;
      if (name === "score" || name === "back") onScore(payload);
      else if (name === "fin") onFin(payload);
      else if (name === "delmatch") onDelete(payload);
      else if (name === "event_updatelive") onUpdate(payload);
      else if (name === "event_nextmatchs" && Array.isArray(payload.data?.matchs)) onRows(payload.data.matchs);
      else if (name === "event_currentmatchs" && Array.isArray(payload.matchs)) onCurrent(payload.matchs);
      else if (name === "event_nextmatchnum") {
        nextNumber = Number(payload.num) || nextNumber;
        showQueue(true);
        persist();
      }
    },
    start() { showHeader(); showQueue(false); },
  };
}

export function connectFeed(tracker, screen) {
  let socket, ping, retry = RETRY_MIN_MS;
  const emit = (event) => { if (socket?.readyState === WebSocket.OPEN) socket.send(`42${JSON.stringify(event)}`); };

  function open() {
    socket = new WebSocket(URL);
    socket.onmessage = ({ data }) => {
      const message = String(data);
      retry = RETRY_MIN_MS;
      screen.heartbeat();
      if (message === "40") tracker.opened();
      else if (message.startsWith("42")) {
        try { tracker.handle(...JSON.parse(message.slice(2))); } catch (error) { console.error(error); }
      }
    };
    // Our own pings prove the hotspot works even when no match is moving.
    ping = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send("2"); }, PING_MS);
    socket.onclose = () => {
      clearInterval(ping);
      setTimeout(open, retry);
      retry = Math.min(retry * 2, RETRY_MAX_MS);
    };
  }
  open();
  return emit;
}
