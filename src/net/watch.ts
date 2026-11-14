import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { NetKind, fireReconnect, setNet } from './status';

const kindOf = (t?: Network.NetworkStateType): NetKind => {
  const T = Network.NetworkStateType;
  if (t === T.WIFI || t === T.ETHERNET) return 'wifi';
  if (t === T.CELLULAR) return 'cellular';
  if (t === T.NONE) return 'none';
  if (t === undefined || t === T.UNKNOWN) return 'unknown';
  return 'other';
};

const apply = (s: Network.NetworkState) => {
  const offline = s.isConnected === false || s.type === Network.NetworkStateType.NONE;
  setNet({ offline, limited: !offline && s.isInternetReachable === false, kind: kindOf(s.type) });
};

/** Re-read the connection state now. */
export const recheckNet = () => Network.getNetworkStateAsync().then(apply).catch(() => { /* keep the last known state */ });

/** User asked to retry: refresh the state, then let every screen re-request. */
export const retryNow = async () => { await recheckNet(); fireReconnect(); };

let started = false;
/** Start following connectivity changes (idempotent). */
export function startNetWatch() {
  if (started) return;
  started = true;
  recheckNet();
  try { Network.addNetworkStateListener(apply); } catch { /* module unavailable (web): state stays "online" */ }
  AppState.addEventListener('change', (s) => { if (s === 'active') recheckNet(); });
}
