import assert from "node:assert";
import { test } from "vitest";
import { createTracker, parsePairHtml, parseRow, parseSets } from "../src/feed.js";

function harness() {
  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  const timers = [];
  const screen = {
    courts: 5,
    isOurs: (p) => p.i.endsWith("CSJBAD57"),
    setHeader: record("header"), setCourt: record("court"), setScore: record("score"),
    endMatch: record("end"), setQueue: record("queue"),
  };
  const sent = [];
  const tracker = createTracker(screen, { eventId: "7", send: (e) => sent.push(e), setTimer: (fn) => timers.push(fn) });
  return { calls, tracker, sent, timers, of: (name) => calls.filter((c) => c[0] === name) };
}

const player = (familyname, firstname, team) => ({ familyname, firstname, team, member: { catage: { nameshort: "Sénior" } } });
const match = (over = {}) => ({
  eventid: 7, eventname: "Tournoi", number: 10, baseid: 0, court: 2, label: "DH S01", round: "Poule A",
  pair1: { id: 1, player1: player("MARTIN", "Léa", "Club A") },
  pair2: { id: 2, player1: player("DUPONT", "Paul", "Club B") }, ...over,
});

test("parses set scores", () => {
  assert.deepStrictEqual(parseSets("13-15 15-13 0-0"), [[13, 15], [15, 13], [0, 0]]);
  assert.deepStrictEqual(parseSets(""), []);
});

test("parses pair html and organiser rows", () => {
  assert.deepStrictEqual(parsePairHtml("<p>MARTIN Léa<span>Sen - N2 - OFPBAD54</span></p>"), [{ n: "MARTIN Léa", i: "Sen - N2 - OFPBAD54" }]);
  const row = parseRow(`<div class="line-match match-warm"><span class="live-terrain">0</span><span class="live-nummatch">589</span>
    <span class="badge live-drawname" style="x">DH S08</span><span class="live-step">A Tr 5</span>
    <div class="live-pair live-pair-h"><a class="ic-click player player-1" href="#">PETIT Hugo - +55-V5 - P10 - OFPBAD54</a></div>
    <div class="live-pair live-pair-v"><a class="ic-click player player-2" href="#">DURAND Inès - Sen - P11 - BNV54</a></div></div>`);
  assert.strictEqual(row.num, 589);
  assert.strictEqual(row.draw, "DH S08");
  assert.strictEqual(row.status, "match-warm");
  assert.deepStrictEqual(row.a, [{ n: "PETIT Hugo", i: "+55-V5 - P10 - OFPBAD54" }]);
});

test("ignores other tournaments and courts that are not in the hall", () => {
  const h = harness();
  h.tracker.handle("matchlive", match({ eventid: 8 }));
  h.tracker.handle("matchlive", match({ court: 9 }));
  h.tracker.handle("matchlive", match({ court: "Minipoêles" }));
  assert.strictEqual(h.of("court").length, 0);
});

test("a repeated match does not redraw its court and subscribes once", () => {
  const h = harness();
  h.tracker.handle("matchlive", match());
  h.tracker.handle("match", match());
  assert.strictEqual(h.of("court").length, 1);
  assert.strictEqual(h.sent.filter((e) => e[0] === "livescore").length, 1);
});

test("keeps sides stable when players change ends", () => {
  const h = harness();
  h.tracker.handle("matchlive", match());
  h.tracker.handle("score", { event: 7, match: 10, pair_left: "2", pair_right: "1", score: "5-3" });
  assert.deepStrictEqual(h.of("score")[0][2], [[3, 5]]);
});

test("a repeated fin ends the match once and names the winner", () => {
  const h = harness();
  h.tracker.handle("matchlive", match());
  const fin = { event: 7, match: 10, pair_win: "2", score: "11-15 7-15" };
  h.tracker.handle("fin", fin);
  h.tracker.handle("fin", fin);
  assert.deepStrictEqual(h.of("end"), [["end", 2, { winner: 1, final: "11-15 7-15" }]]);
  h.timers.forEach((run) => run());
  assert.deepStrictEqual(h.of("court").at(-1), ["court", 2, null]);
});

test("delmatch without fin frees the court without a result", () => {
  const h = harness();
  h.tracker.handle("matchlive", match());
  h.tracker.handle("delmatch", { event: 7, match: 10 });
  h.timers.shift()();
  h.timers.shift()();
  assert.strictEqual(h.of("end").length, 0);
  assert.deepStrictEqual(h.of("court").at(-1), ["court", 2, null]);
});

test("club codes learned from rows reach later matches", () => {
  const h = harness();
  h.tracker.handle("event_currentmatchs", { event: 7, matchs: [{ html: { num: 1, pair1: "<p>MARTIN Léa<span>Sen - N2 - CSJBAD57</span></p>", pair2: "" } }] });
  h.tracker.handle("matchlive", match());
  assert.strictEqual(h.of("court")[0][2].a[0].i, "Sen - N2 - CSJBAD57");
});

test("schedule drift comes from event_updatelive", () => {
  const h = harness();
  h.tracker.handle("event_updatelive", { event: 7, data: { late: "Avance de 6 min" } });
  assert.strictEqual(h.of("header").at(-1)[1].drift, "Avance de 6 min");
});
