// Designs und Erscheinungsbild. Jedes Design hat eine helle und eine dunkle Fassung.
// Gespeichert wird lokal (sofort beim Start, auch offline) und im Konto,
// damit dieselbe Person auf jedem Gerät ihr Design bekommt.

const base = {
  light: { '--warn': '#B4462E', '--card': '#FFFFFF', scheme: 'light' },
  dark: { '--warn': '#F08A6E', scheme: 'dark' },
};

export const THEMES = {
  lagune: {
    name: 'Lagune',
    hint: 'Standard',
    light: {
      '--ink': '#12343B', '--ink-2': '#3E5A60', '--muted': '#5D7176',
      '--lagoon': '#128C7E', '--lagoon-ink': '#0C6A5F',
      '--sand': '#ECEFE9', '--line': '#D6DCD5', '--sun': '#F4B63F', '--sun-ink': '#2A2207',
    },
    dark: {
      '--ink': '#E4ECE8', '--ink-2': '#B9C9C4', '--muted': '#8DA29D',
      '--lagoon': '#3CC1AE', '--lagoon-ink': '#6FD8C8',
      '--sand': '#0E2226', '--card': '#16302F', '--line': '#27443F', '--sun': '#F4B63F', '--sun-ink': '#2A2207',
    },
  },
  rose: {
    name: 'Rosé',
    hint: 'Weiß & Rosa',
    light: {
      '--ink': '#3B2230', '--ink-2': '#6B4558', '--muted': '#9A7686',
      '--lagoon': '#D6457A', '--lagoon-ink': '#AE2C5C',
      '--sand': '#FFF5F8', '--line': '#F3DAE4', '--sun': '#F9C3D6', '--sun-ink': '#4A1830',
    },
    dark: {
      '--ink': '#F8E8EF', '--ink-2': '#E2C3D1', '--muted': '#B48FA0',
      '--lagoon': '#F07AA4', '--lagoon-ink': '#F7A3C1',
      '--sand': '#1E1218', '--card': '#2B1A23', '--line': '#452C39', '--sun': '#F4A7C2', '--sun-ink': '#3A1424',
    },
  },
  abendrot: {
    name: 'Abendrot',
    hint: 'Koralle & Mango',
    light: {
      '--ink': '#2F221D', '--ink-2': '#5E4A41', '--muted': '#8A7469',
      '--lagoon': '#D9573A', '--lagoon-ink': '#AE3F26',
      '--sand': '#FBF2EA', '--line': '#EEDCCD', '--sun': '#FFC261', '--sun-ink': '#3A2406',
    },
    dark: {
      '--ink': '#F6E9E1', '--ink-2': '#DCC4B7', '--muted': '#AA9184',
      '--lagoon': '#F28160', '--lagoon-ink': '#F7A58B',
      '--sand': '#1D1512', '--card': '#2A1F1A', '--line': '#45332B', '--sun': '#FFC261', '--sun-ink': '#3A2406',
    },
  },
  ozean: {
    name: 'Ozean',
    hint: 'Tiefblau & Himmel',
    light: {
      '--ink': '#10233F', '--ink-2': '#3A4F6E', '--muted': '#5F7290',
      '--lagoon': '#2560C8', '--lagoon-ink': '#1A479C',
      '--sand': '#EDF2F8', '--line': '#D5DEEA', '--sun': '#8ED2F5', '--sun-ink': '#0A2540',
    },
    dark: {
      '--ink': '#E4ECF7', '--ink-2': '#BCCBE0', '--muted': '#8C9DB7',
      '--lagoon': '#6A9CF2', '--lagoon-ink': '#9BBDF7',
      '--sand': '#0B1424', '--card': '#152238', '--line': '#26375A', '--sun': '#8ED2F5', '--sun-ink': '#0A2540',
    },
  },
  salbei: {
    name: 'Salbei',
    hint: 'Grün & Creme',
    light: {
      '--ink': '#25301F', '--ink-2': '#4D5A45', '--muted': '#76806D',
      '--lagoon': '#5A8A5C', '--lagoon-ink': '#436B45',
      '--sand': '#F1F2EA', '--line': '#DCE0D0', '--sun': '#E8D49A', '--sun-ink': '#2E2708',
    },
    dark: {
      '--ink': '#E8EDE2', '--ink-2': '#C4CDBA', '--muted': '#94A08A',
      '--lagoon': '#86B888', '--lagoon-ink': '#A8D1A9',
      '--sand': '#141A11', '--card': '#1F281A', '--line': '#33402B', '--sun': '#E8D49A', '--sun-ink': '#2E2708',
    },
  },
};

export const MODES = { auto: 'Automatisch', light: 'Hell', dark: 'Dunkel' };

const KEY = 'companion-settings';
const CSS_KEY = 'companion-theme';

const defaults = { theme: 'lagune', mode: 'auto', start: 'home' };

export function getSettings() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; }
}

function storeLocal(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* egal */ }
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

/** Setzt die Farben des aktuellen Designs auf die Seite. */
export function applyTheme(settings = getSettings()) {
  const theme = THEMES[settings.theme] || THEMES.lagune;
  const dark = settings.mode === 'dark' || (settings.mode === 'auto' && media.matches);
  const vars = { ...base[dark ? 'dark' : 'light'], ...theme[dark ? 'dark' : 'light'] };
  const root = document.documentElement;
  const { scheme, ...cssVars } = vars;
  for (const [k, v] of Object.entries(cssVars)) root.style.setProperty(k, v);
  root.style.colorScheme = scheme;
  root.dataset.theme = settings.theme;
  // Statusleiste/Browserleiste passend färben
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = cssVars['--sand'];
  // für den nächsten Start sofort verfügbar (siehe Inline-Skript in index.html)
  try { localStorage.setItem(CSS_KEY, JSON.stringify({ vars: cssVars, scheme })); } catch { /* egal */ }
}

media.addEventListener?.('change', () => applyTheme());

let remoteSaver = null;
/** Die App meldet hier, wie Einstellungen ins Konto gespeichert werden. */
export function setRemoteSaver(fn) { remoteSaver = fn; }

export function updateSettings(patch) {
  const next = { ...getSettings(), ...patch };
  storeLocal(next);
  applyTheme(next);
  remoteSaver?.(next);
  return next;
}

/** Einstellungen aus dem Konto übernehmen (gleiches Design auf allen Geräten). */
export function adoptRemote(remote) {
  if (!remote || typeof remote !== 'object') return;
  const next = { ...getSettings(), ...remote };
  storeLocal(next);
  applyTheme(next);
}
