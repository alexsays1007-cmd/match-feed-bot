import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data");
const statePath = path.join(dataDir, "state.json");

export function loadState() {
  if (!fs.existsSync(statePath)) return { sent: [] };
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { sent: [] };
  }
}

export function saveState(state) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function rememberKeys(keys) {
  const state = loadState();
  const sent = new Set(state.sent || []);
  for (const key of keys) sent.add(key);
  state.sent = [...sent].slice(-1000);
  saveState(state);
}

export function unseen(items) {
  const state = loadState();
  const sent = new Set(state.sent || []);
  return items.filter((item) => !sent.has(item.key));
}

export function updateRuntime(patch) {
  const state = loadState();
  state.runtime = { ...(state.runtime || {}), ...patch };
  saveState(state);
  return state.runtime;
}

export function getRuntime() {
  return loadState().runtime || {};
}

export function clearSent() {
  const state = loadState();
  state.sent = [];
  saveState(state);
}
