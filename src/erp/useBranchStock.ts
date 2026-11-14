import { useEffect, useState } from 'react';
import { cacheRead, cacheWrite } from '../offline';
import { erp, erpEnabled } from './client';
import type { BranchQty } from './types';

/** Per-branch stock for a product handle. enabled=false when EXPO_PUBLIC_ERP_API is unset (render nothing). */
export function useBranchStock(handle: string | undefined) {
  // instant/offline value from the cache, replaced when the gateway answers; reset whenever the handle changes
  const initial = (h: string | undefined) => (erpEnabled && h ? cacheRead<BranchQty[]>('erp:stock:' + h) : null);
  const [data, setData] = useState<BranchQty[] | null>(() => initial(handle));
  const [loading, setLoading] = useState(erpEnabled && !!handle);
  const [seen, setSeen] = useState(handle);
  if (seen !== handle) {
    setSeen(handle);
    setData(initial(handle));
    setLoading(erpEnabled && !!handle);
  }

  useEffect(() => {
    if (!erpEnabled || !handle) return;
    const key = 'erp:stock:' + handle;
    let live = true;
    erp.branchStock({ handle })
      .then((r) => { if (!live || !r) return; setData(r); cacheWrite(key, r); })
      .catch(() => { /* keep cached value; stock is advisory */ })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [handle]);

  return { data, loading, enabled: erpEnabled };
}
