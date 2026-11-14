import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { BRANCHES, Branch, distanceKm } from './branches';

export type Located = Branch & { km: number | null };

// Returns branches sorted by distance when location is allowed, else in the original order.
export function useNearest() {
  const [state, setState] = useState<{ list: Located[]; status: 'loading' | 'ok' | 'denied' }>({
    list: BRANCHES.map((b) => ({ ...b, km: null })), status: 'loading',
  });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') { if (alive) setState((s) => ({ ...s, status: 'denied' })); return; }
        const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        const { latitude, longitude } = pos.coords;
        const list = BRANCHES.map((b) => ({ ...b, km: distanceKm(latitude, longitude, b.lat, b.lng) })).sort((a, b) => a.km - b.km);
        if (alive) setState({ list, status: 'ok' });
      } catch {
        if (alive) setState((s) => ({ ...s, status: 'denied' }));
      }
    })();
    return () => { alive = false; };
  }, []);
  return state;
}
