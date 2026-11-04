// Hall display. It holds no tournament data and no game rules: a data source
// drives it only through the object createScreen returns (see README.md).
export function createScreen(options = {}) {
  const CONFIG = { courts: 5, clubs: ["CSJBAD57", "Cercle St Jean - Badminton"], theme: "auto", ...options };
  const STALE_MS = 15000, LOST_MS = 45000;
  const VICTORY_MS = 7200, MAX_VICTORY_WAIT_MS = 120000, MAX_VICTORIES_SHOWN = 3;
  const SOFT_FIT = .88, MIN_FIT = .6, SLIDE_PX_PER_S = 45, SLIDE_PAUSES_S = 5;

  const LINES = `<svg class="lines" viewBox="0 0 610 1340" preserveAspectRatio="none" aria-hidden="true">
    <rect class="out" x="1.5" y="1.5" width="607" height="1337"/>
    <line class="in" x1="46" y1="0" x2="46" y2="1340"/><line class="in" x1="564" y1="0" x2="564" y2="1340"/>
    <line class="in" x1="0" y1="76" x2="610" y2="76"/><line class="in" x1="0" y1="1264" x2="610" y2="1264"/>
    <line class="in" x1="0" y1="472" x2="610" y2="472"/><line class="in" x1="0" y1="868" x2="610" y2="868"/>
    <line class="in" x1="305" y1="0" x2="305" y2="472"/><line class="in" x1="305" y1="868" x2="305" y2="1340"/>
  </svg>`;
  const ARC = `<svg class="arc" viewBox="0 0 610 1340" preserveAspectRatio="none" aria-hidden="true">
    <path class="a" pathLength="1" d=""/><path class="b" pathLength="1" d=""/></svg>`;
  const MARK = `<span class="jump" role="img" aria-label="Joueur du club"></span>`;
  const REASONS = { wo: "Forfait", ab: "Abandon" };
  const IDLE = {
    before: "Les matchs n'ont pas encore commencé",
    live: "Prochains matchs bientôt affichés",
    after: "Fin des matchs. Merci et à bientôt !",
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const random = (n) => Math.floor(Math.random() * n);
  const clockText = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function isChristmas(d = new Date()) {
    if (location.hash === "#noel" || CONFIG.theme === "noel") return true;
    if (location.hash === "#classique" || CONFIG.theme === "classique") return false;
    return d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 6);
  }
  const NOEL = isChristmas();
  if (NOEL) document.documentElement.dataset.season = "noel";

  function short(full) {
    const parts = String(full ?? "").trim().split(/\s+/);
    const first = parts.findIndex((p) => p !== p.toUpperCase());
    const family = parts.slice(0, first < 0 ? parts.length : first).join(" ");
    const given = first < 0 ? "" : parts.slice(first).join(" ");
    return { family, given };
  }
  const isOurs = (p) => {
    const info = String(p?.i ?? "").trim();
    return CONFIG.clubs.some((club) => info.endsWith(club));
  };
  const players = (m) => [...(m.a ?? []), ...(m.b ?? [])];
  const hasOurs = (m) => players(m).some(isOurs);

  // A long name shrinks a little, then slides to show its end and comes back.
  // Without motion it shrinks further and the CSS ellipsis takes over.
  function fit(el) {
    const track = el.querySelector(".track");
    el.style.fontSize = "";
    el.classList.remove("slides");
    if (!track || track.offsetWidth <= el.clientWidth) return;
    const size = parseFloat(getComputedStyle(el).fontSize);
    const ratio = el.clientWidth / track.offsetWidth;
    const still = reducedMotion();
    el.style.fontSize = `${size * Math.max(still ? MIN_FIT : SOFT_FIT, ratio)}px`;
    const excess = track.offsetWidth - el.clientWidth;
    if (still || excess <= 0) return;
    el.style.setProperty("--shift", `${-excess}px`);
    el.style.setProperty("--slide", `${(excess * 2) / SLIDE_PX_PER_S + SLIDE_PAUSES_S}s`);
    el.classList.add("slides");
  }
  const fitAll = (root) => root.querySelectorAll(".name, .call .line").forEach(fit);

  function playerRow(p) {
    const { family, given } = short(p.n);
    const ours = isOurs(p);
    return `<div class="who ${ours ? "ours" : ""}">${ours ? MARK : ""}<span class="name"><span class="track">${esc(family)} <i>${esc(given)}</i></span></span><span class="info">${esc(String(p.i ?? "").replaceAll(" - ", " · "))}</span></div>`;
  }
  const pairRow = (list, cls) => `<div class="pair ${cls} ${list.length === 1 ? "solo" : ""}">${list.map(playerRow).join("")}</div>`;

  const courts = Array.from({ length: CONFIG.courts }, (_, i) => ({ no: i + 1, match: null, state: "free", el: null }));
  const courtOf = (no) => courts[no - 1];
  let queue = [];
  let phase = "live";

  function setRows(sets) {
    return sets.map((s, i) => `<div class="set ${i === sets.length - 1 ? "now" : ""}"><b>${s[0]}</b><b>${s[1]}</b></div>`).join("");
  }

  function netBand(c) {
    const m = c.match;
    const done = c.state === "done";
    const label = done ? REASONS[m.reason] ?? "Terminé" : m.dur == null ? "En cours" : `${m.dur} min`;
    const detail = done ? m.final ?? "" : m.dur == null ? "" : "En cours";
    const clock = `<div class="clockbox"><span class="elapsed ${m.reason ? "reason" : ""}">${esc(label)}</span>${detail ? `<span class="status">${esc(detail)}</span>` : ""}</div>`;
    return m.sets && !done
      ? `<div class="net">${clock}<div class="sets">${setRows(m.sets)}</div></div>`
      : `<div class="net noscore">${clock}</div>`;
  }

  function renderCourt(c) {
    const el = c.el;
    el.className = `court ${c.state} ${c.match && hasOurs(c.match) ? "club" : ""}`;
    if (c.state === "free") {
      el.innerHTML = `${LINES}<div class="top"><span class="num">${c.no}</span></div><svg class="deer freeDeer" aria-hidden="true"><use href="#cerf"/></svg><div class="freeMark">Libre</div>`;
      return;
    }
    const m = c.match;
    const result = (side) => {
      if (c.state !== "done" || m.winner == null) return "";
      if (m.winner !== side) return "lost";
      return `win ${(side === 0 ? m.a : m.b).some(isOurs) ? "ourspair" : ""}`;
    };
    el.innerHTML = `${LINES}${ARC}
      <div class="top"><span class="num">${c.no}</span><span></span>
        <div class="meta"><span class="tag">${esc(m.draw)} <span>${m.draw ? "· " : ""}N° ${esc(m.num)}</span></span>
        <span class="time">${esc(m.round)}</span></div></div>
      <div class="play">${pairRow(m.a ?? [], "a " + result(0))}${netBand(c)}${pairRow(m.b ?? [], "b " + result(1))}</div>`;
    fitAll(el);
  }

  function callRow(m, first) {
    const names = (pair) => (pair ?? []).map((x) => {
      const { family, given } = short(x.n);
      const name = `${esc(family)} <i>${esc(given)}</i>`;
      return isOurs(x) ? `<span class="mine">${MARK}${name}</span>` : name;
    }).join(" / ");
    return `<div class="call ${first ? "first" : ""}">
      <div class="ref"><span>${esc(m.draw)} · ${esc(m.round)}</span><b>N° ${esc(m.num)}</b></div>
      <div class="who"><span class="line"><span class="track">${names(m.a)}</span></span><span class="vs">contre</span><span class="line"><span class="track">${names(m.b)}</span></span></div>
    </div>`;
  }

  function renderQueue(animate) {
    const band = document.querySelector(".assembly");
    band.classList.toggle("idle", queue.length === 0);
    $("first").innerHTML = queue[0] ? callRow(queue[0], true) : `<p class="idleText">${esc(IDLE[phase])}</p>`;
    $("queue").innerHTML = queue.slice(1, 4).map((m) => callRow(m, false)).join("");
    if (animate) $("first").firstElementChild?.classList.add("enter");
    fitAll(band);
  }

  function rally(c, side) {
    const paths = c.el.querySelectorAll(".arc path");
    const from = side === 0 ? 1180 : 160, to = 1340 - from;
    const x = 90 + random(430), end = 90 + random(430);
    paths.forEach((p, i) => {
      p.setAttribute("d", `M${x} ${from} Q${i ? 40 : -40} 670 ${end} ${to}`);
      p.classList.remove("go");
      p.getBoundingClientRect();
      p.classList.add("go");
    });
  }

  function setScore(no, sets, side) {
    const c = courtOf(no);
    if (!c?.match || c.state !== "live") return;
    const before = c.match.sets;
    c.match.sets = sets;
    if (!before || before.length !== sets.length) { renderCourt(c); return; }
    if (side == null) return;
    rally(c, side);
    const cell = c.el.querySelectorAll(".set.now b")[side];
    cell.textContent = sets[sets.length - 1][side];
    cell.classList.remove("flip");
    cell.getBoundingClientRect();
    cell.classList.add("flip");
  }

  function setCourt(no, match) {
    const c = courtOf(no);
    if (!c) return;
    c.match = match ? { ...match } : null;
    c.state = match ? "live" : "free";
    renderCourt(c);
  }

  // Each match ends once, whatever the feed repeats. A forfeit or retirement is
  // recorded on the court but never celebrated.
  const ended = new Set();
  function endMatch(no, { winner = null, final = null, reason = null } = {}) {
    const c = courtOf(no);
    const m = c?.match;
    if (!m || ended.has(m.num)) return;
    ended.add(m.num);
    Object.assign(m, { winner, final, reason });
    c.state = "done";
    renderCourt(c);
    const pair = winner == null ? null : winner === 0 ? m.a : m.b;
    if (pair?.some(isOurs) && !reason) celebrate({ court: c.no, m, pair });
  }

  let pending = [];
  let celebrating = false;

  function celebrate(entry) {
    pending.push({ ...entry, at: Date.now() });
    if (!celebrating) nextVictory();
  }

  // Wins that pile up share one screen, so the courts are never hidden for long.
  function nextVictory() {
    const fresh = pending.filter((e) => Date.now() - e.at < MAX_VICTORY_WAIT_MS);
    pending = [];
    celebrating = fresh.length > 0;
    if (!celebrating) return;
    const box = $("victory");
    const shown = fresh.slice(0, MAX_VICTORIES_SHOWN);
    const hiddenCount = fresh.length - shown.length;
    const word = fresh.length > 1 ? "VICTOIRES" : "VICTOIRE";
    const letters = [...word].map((l, i) => `<span style="--i:${i}">${l}</span>`).join("");
    const names = shown.map((e) => `<span>${esc(e.pair.map((p) => p.n).join(" & "))}</span>`).join("");
    const only = fresh[0];
    const detail = fresh.length === 1
      ? `Terrain ${only.court} · ${esc(only.m.draw)}${only.m.final ? ` · ${esc(only.m.final)}` : ""}`
      : hiddenCount ? `Et ${hiddenCount} autre${hiddenCount > 1 ? "s" : ""}` : "";
    box.className = "victory";
    box.innerHTML = `<svg class="deer v-bg" aria-hidden="true"><use href="#cerf"/></svg><canvas id="fx" aria-hidden="true"></canvas><div class="v-body">
      <svg class="deer v-deer" role="img" aria-label="Le cerf, totem du club"><use href="#cerf"/></svg>
      <h2 class="v-title" aria-label="${word}">${letters}</h2>
      <p class="v-names ${fresh.length > 1 ? "many" : ""}">${names}</p>
      ${detail ? `<p class="v-line">${detail}</p>` : ""}
      <p class="v-cheer">Allez Augny !</p></div>`;
    box.hidden = false;
    if (!reducedMotion()) launchShuttle(box.querySelector("#fx"));
    setTimeout(() => box.classList.add("out"), VICTORY_MS - 700);
    setTimeout(() => { box.hidden = true; box.innerHTML = ""; nextVictory(); }, VICTORY_MS);
  }

  // The shuttle crosses the hall along the logo's trajectory, then bursts into feathers.
  function launchShuttle(canvas) {
    const w = canvas.width = innerWidth, h = canvas.height = innerHeight;
    const ctx = canvas.getContext("2d");
    const start = performance.now();
    const flight = 560, life = VICTORY_MS - 500;
    const hit = { x: w * .5, y: h * .46 };
    const curve = (t, lift) => {
      const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), d = t * t;
      return { x: a * -w * .08 + b * w * .2 + d * hit.x, y: a * h * .98 + b * (h * .02 + lift) + d * hit.y };
    };
    const colours = NOEL ? ["#ffffff", "#c8102e", "#0f5c43", "#ffffff"] : ["#ffffff", "#0080f4", "#ffffff"];
    const feathers = [];
    function burst(count, speed) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2, v = speed * (.25 + Math.random());
        feathers.push({ x: hit.x, y: hit.y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, r: Math.random() * 6, spin: (Math.random() - .5) * .16,
          size: (9 + Math.random() * 15) * h / 1080 * 1.6, sway: Math.random() * 6, colour: colours[i % colours.length], born: performance.now() });
      }
    }
    function feather(f, alpha) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.r);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.colour;
      ctx.beginPath();
      ctx.moveTo(0, -f.size);
      ctx.quadraticCurveTo(f.size * .62, -f.size * .1, 0, f.size * .72);
      ctx.quadraticCurveTo(-f.size * .62, -f.size * .1, 0, -f.size);
      ctx.fill();
      ctx.fillRect(-.8, f.size * .5, 1.6, f.size * .7);
      ctx.restore();
    }
    let burstDone = false;
    function frame(now) {
      if (!canvas.isConnected) return;
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      if (t < flight + 200) {
        const head = 1 - Math.pow(1 - Math.min(t / flight, 1), 2.4);
        const fade = t > flight ? 1 - (t - flight) / 200 : 1;
        [[0, 9, "#ffffff"], [h * .05, 5, "#0080f4"], [h * .1, 3, "#cfe5ff"]].forEach(([lift, width, stroke]) => {
          ctx.globalAlpha = fade;
          ctx.strokeStyle = stroke;
          ctx.lineWidth = width * h / 1080 * 1.6;
          ctx.lineCap = "round";
          ctx.beginPath();
          for (let i = 0; i <= 40; i++) {
            const p = curve(head * i / 40, lift * (1 - i / 40));
            i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
          }
          ctx.stroke();
        });
        if (t < flight) {
          const tip = curve(head, 0), tail = curve(Math.max(0, head - .02), 0);
          const size = h * .03;
          ctx.save();
          ctx.translate(tip.x, tip.y);
          ctx.rotate(Math.atan2(tip.y - tail.y, tip.x - tail.x));
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(-size * .2, -size * .24);
          ctx.lineTo(-size * 1.8, -size * .72);
          ctx.lineTo(-size * 1.8, size * .72);
          ctx.lineTo(-size * .2, size * .24);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, size * .34, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
      if (t >= flight && !burstDone) { burstDone = true; burst(240, h * .03); }
      if (t > flight && t < flight + 900) {
        const k = (t - flight) / 900, ease = 1 - Math.pow(1 - k, 3);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = (1 - k) * h * .06;
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, ease * Math.hypot(w, h) * .55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      for (const f of feathers) {
        const age = (now - f.born) / 1000;
        f.vx *= .972;
        f.vy = f.vy * .972 + h * .00016;
        f.x += f.vx + Math.sin(age * 2.4 + f.sway) * h * .0016;
        f.y += f.vy;
        f.r += f.spin;
        feather(f, Math.min(1, (life - t) / 900));
      }
      if (t < life) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // A hotspot can stay "connected" with no traffic, so the link is judged on the age of the last data.
  const openedAt = Date.now();
  let lastData = null;

  function watchLink() {
    const age = Date.now() - (lastData ?? openedAt);
    const offline = !navigator.onLine || age > LOST_MS;
    const state = offline ? "lost" : lastData == null ? "connecting" : age > STALE_MS ? "unstable" : "live";
    $("link").dataset.state = state;
    $("linkText").textContent = { live: "En direct", unstable: "Réseau instable", lost: "Hors ligne", connecting: "Connexion…" }[state];
    const alert = $("alert");
    alert.hidden = !offline;
    if (!offline) return;
    const minutes = Math.floor(age / 60000);
    const since = minutes ? `depuis ${minutes} min · ` : "";
    alert.innerHTML = lastData == null
      ? `Connexion impossible <span>${since}vérifiez le partage de connexion · reprise automatique</span>`
      : `Connexion perdue <span>${since}dernières données à ${clockText(new Date(lastData))} · reprise automatique dès le retour du réseau</span>`;
  }

  function startChristmas() {
    const garland = $("garland");
    const colours = ["#e8112d", "#ffd23f", "#3ddc84", "#ffffff"];
    garland.innerHTML = Array.from({ length: 46 }, (_, i) => {
      const sag = Math.abs(Math.sin(i * Math.PI / 6));
      return `<i style="--c:${colours[i % 4]};--d:${(i % 5) * 300}ms;--y:calc(${(sag * 1.3).toFixed(2)} * var(--u))"></i>`;
    }).join("");
    garland.hidden = false;
    if (reducedMotion()) return;
    const canvas = $("snow");
    canvas.hidden = false;
    const w = canvas.width = innerWidth, h = canvas.height = innerHeight;
    const ctx = canvas.getContext("2d");
    const flakes = Array.from({ length: 70 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: h / 1080 * (1.5 + Math.random() * 3.5), v: h / 1080 * (.5 + Math.random()), p: Math.random() * 6 }));
    ctx.fillStyle = "#ffffff";
    (function fall(now) {
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.v;
        f.x += Math.sin(now / 1400 + f.p) * .5;
        if (f.y > h) { f.y = -8; f.x = Math.random() * w; }
        ctx.globalAlpha = .75;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(fall);
    })(performance.now());
  }

  // Unattended TV: ask the browser to keep the display on, and ask again after
  // the lock is dropped. It needs HTTPS; without it the screen simply runs on.
  async function keepAwake() {
    if (!navigator.wakeLock || document.visibilityState !== "visible") return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => setTimeout(keepAwake, 1000));
    } catch { /* refused by the browser or power settings */ }
  }

  function clock() { $("clock").textContent = clockText(new Date()); }

  document.documentElement.style.setProperty("--courts", CONFIG.courts);
  const host = $("courts");
  for (const c of courts) {
    c.el = document.createElement("section");
    host.append(c.el);
    renderCourt(c);
  }
  renderQueue(false);
  if (NOEL) startChristmas();
  clock();
  watchLink();
  setInterval(clock, 10000);
  setInterval(watchLink, 1000);
  setInterval(() => {
    for (const c of courts) {
      if (c.state !== "live" || c.match.dur == null) continue;
      c.match.dur++;
      c.el.querySelector(".elapsed").textContent = `${c.match.dur} min`;
    }
  }, 60000);
  addEventListener("online", watchLink);
  addEventListener("offline", watchLink);
  document.addEventListener("visibilitychange", keepAwake);
  keepAwake();
  document.fonts?.ready.then(() => { fitAll(document.body); });

  return {
    courts: CONFIG.courts,
    isOurs,
    setHeader({ title = "", drift = "" }) {
      $("title").textContent = title;
      $("drift").textContent = drift;
      $("drift").hidden = !drift;
    },
    setPhase(next) { phase = next; renderQueue(false); },
    setCourt,
    setScore,
    endMatch,
    setQueue(list, animate = false) { queue = list; renderQueue(animate); },
    heartbeat() { lastData = Date.now(); watchLink(); },
  };
}
