'use client';

import { createContext, useContext } from 'react';

export interface ActiveReferee {
  id: string;
  referee_name: string;
  last_active_at?: string | null;
  matches_scored_count?: number;
}

export const ActiveRefereesContext = createContext<ActiveReferee[]>([]);

export function useActiveReferees() {
  return useContext(ActiveRefereesContext);
}
