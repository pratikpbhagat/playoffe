'use client';

import { createContext, useState } from 'react';
import type { ReactNode } from 'react';

interface PermEntry {
  enabled: boolean;
  canRead: boolean;
  canWrite: boolean;
}

interface PermissionContextValue {
  permissions: Record<string, PermEntry>; // key: "role:feature:sub_feature"
  featureFlags: Record<string, boolean>;   // key: feature_module
  isLoaded: boolean;
}

export const PermissionContext = createContext<PermissionContextValue>({
  permissions: {},
  featureFlags: {},
  isLoaded: false,
});

interface PermissionProviderProps {
  children: ReactNode;
  initialPermissions: Record<string, PermEntry>;
  initialFeatureFlags: Record<string, boolean>;
}

export function PermissionProvider({
  children,
  initialPermissions,
  initialFeatureFlags,
}: PermissionProviderProps) {
  // Data is always provided server-side by layout.tsx via getPermissionsData().
  // No client-side fetch needed — permissions don't change during a session
  // without a full navigation (which re-runs the server component).
  const [permissions] = useState(initialPermissions);
  const [featureFlags] = useState(initialFeatureFlags);

  return (
    <PermissionContext.Provider value={{ permissions, featureFlags, isLoaded: true }}>
      {children}
    </PermissionContext.Provider>
  );
}
