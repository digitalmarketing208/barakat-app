import raw from './data/branches.json';

export type Branch = { name: string; addr: string; tel: string; lat: number; lng: number; hours: string; fri: string };
export const BRANCHES = raw as Branch[];

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// Saudi Arabia is UTC+3 all year, so open/closed does not depend on the phone's own time zone.
export function ksaNow(d = new Date()) {
  const k = new Date(d.getTime() + 3 * 3600 * 1000);
  return { day: k.getUTCDay(), minutes: k.getUTCHours() * 60 + k.getUTCMinutes() };
}

export function hoursFor(b: Branch, day: number) { return day === 5 ? b.fri : b.hours; }

export function isOpen(b: Branch, d = new Date()) {
  const { day, minutes } = ksaNow(d);
  const [o, c] = hoursFor(b, day).split('-').map(toMin);
  return minutes >= o && minutes < c;
}

export const fmt12 = (hhmm: string, ar: boolean) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? (ar ? 'م' : 'PM') : (ar ? 'ص' : 'AM');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
};
