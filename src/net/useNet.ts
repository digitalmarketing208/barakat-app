import { useSyncExternalStore } from 'react';
import { NetState, netState, subscribeNet } from './status';

/** Live connectivity state: { offline, limited, kind, savedData }. */
export const useNet = (): NetState => useSyncExternalStore(subscribeNet, netState, netState);
/** True while the device has no connection (screens can hide online-only actions). */
export const useIsOffline = (): boolean => useSyncExternalStore(subscribeNet, isOff, isOff);
const isOff = () => netState().offline;
