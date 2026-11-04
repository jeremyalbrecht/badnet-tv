import { connectFeed, createTracker } from "./feed.js";

// Start screen and settings. Settings live in the address, and in this TV's
// storage so a reload or power cut comes straight back to the live screen.
const KEY = "ecran-salle";
const THEMES = ["auto", "classique", "noel"];
const DEFAULT_COURTS = 5, MAX_COURTS = 12, MENU_MS = 5000;

function eventFrom(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : text.match(/[?&](?:eventid|event)=(\d+)/)?.[1] ?? null;
}

function readStored() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}
function store(value) {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* blocked storage: the address still holds the settings */ }
}

export function readSettings() {
  const query = new URLSearchParams(location.search);
  const stored = readStored();
  const courts = Number(query.get("terrains") ?? stored.courts ?? DEFAULT_COURTS);
  const theme = query.get("theme") ?? stored.theme;
  return {
    eventId: eventFrom(query.get("event") ?? stored.eventId),
    courts: Number.isInteger(courts) && courts >= 1 && courts <= MAX_COURTS ? courts : DEFAULT_COURTS,
    theme: THEMES.includes(theme) ? theme : "auto",
  };
}

function showForm(settings) {
  const form = document.getElementById("start");
  form.elements.tournament.value = settings.eventId ?? "";
  form.elements.courts.value = settings.courts;
  form.elements.theme.value = settings.theme;
  form.hidden = false;
  form.elements.tournament.focus();
}

function bindForm(settings) {
  const form = document.getElementById("start");
  const error = document.getElementById("startError");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const eventId = eventFrom(form.elements.tournament.value);
    if (!eventId) {
      error.hidden = false;
      form.elements.tournament.focus();
      return;
    }
    const next = { eventId, courts: Number(form.elements.courts.value), theme: form.elements.theme.value };
    store(next);
    location.assign(`${location.pathname}?event=${eventId}&terrains=${next.courts}&theme=${next.theme}`);
  });
  form.elements.tournament.addEventListener("input", () => { error.hidden = true; });
  const menu = document.getElementById("menu");
  let hide;
  addEventListener("pointermove", () => {
    if (!form.hidden) return;
    menu.hidden = false;
    clearTimeout(hide);
    hide = setTimeout(() => { menu.hidden = true; }, MENU_MS);
  });
  menu.addEventListener("click", () => showForm(settings));
  addEventListener("keydown", (event) => { if (event.key === "Escape" && form.hidden) showForm(settings); });
}

export function begin(settings, screen) {
  bindForm(settings);
  if (!settings.eventId) { showForm(settings); return; }
  store(settings);
  const savedKey = `${KEY}-${settings.eventId}`;
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(savedKey)) ?? {}; } catch { /* starts empty */ }
  let send = () => {};
  const tracker = createTracker(screen, {
    eventId: settings.eventId,
    send: (event) => send(event),
    saved,
    save: (state) => { try { sessionStorage.setItem(savedKey, JSON.stringify(state)); } catch { /* keeps running */ } },
  });
  tracker.start();
  send = connectFeed(tracker, screen);
}
