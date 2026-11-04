import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/big-shoulders-stencil/800.css";
import "./style.css";
import { createScreen } from "./screen.js";
import { begin, readSettings } from "./start.js";

const settings = readSettings();
const screen = createScreen({ courts: settings.courts, theme: settings.theme });

async function preview() {
  const fixtures = import.meta.glob("../preview/data.json");
  const load = fixtures["../preview/data.json"];
  if (!load) throw new Error("preview/data.json is missing");
  const [{ runPreview }, { default: data }] = await Promise.all([import("./preview.js"), load()]);
  runPreview(screen, data);
}

if (import.meta.env.DEV && new URLSearchParams(location.search).has("apercu")) preview();
else begin(settings, screen);
