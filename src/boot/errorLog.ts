// Local, on-device error log (no third-party service). Last 40 errors are kept in AsyncStorage under "errorLog".
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LoggedError = { at: string; where: string; message: string; stack?: string; fatal?: boolean };
const KEY = 'errorLog';
const MAX = 40;
let chain: Promise<unknown> = Promise.resolve();

export function logError(error: unknown, where = 'app', fatal = false) {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error ?? 'unknown'));
  const entry: LoggedError = { at: new Date().toISOString(), where, message: String(e.message).slice(0, 500), stack: e.stack?.slice(0, 1500), fatal };
  if (__DEV__) console.warn(`[errorLog] ${where}: ${entry.message}`);
  // Writes are chained so two errors in a row cannot overwrite each other.
  chain = chain.then(async () => {
    const raw = await AsyncStorage.getItem(KEY);
    const list: LoggedError[] = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  }).catch(() => { /* logging must never throw */ });
}

export async function getErrorLog(): Promise<LoggedError[]> {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export const clearErrorLog = () => AsyncStorage.removeItem(KEY).catch(() => {});

type RNErrorUtils = { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void };
let installed = false;
/** Also record errors thrown outside React rendering (event handlers, timers). The default handler still runs. */
export function installGlobalErrorLog() {
  if (installed) return;
  installed = true;
  const eu = (globalThis as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
  if (!eu) return;
  const prev = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => { logError(e, 'global', !!fatal); prev?.(e, fatal); });
}
