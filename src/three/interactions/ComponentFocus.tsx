/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { Object3D } from "three";

export interface ComponentFocus {
  register(roots: ReadonlyMap<string, Object3D>): () => void;
  get(id: string): Object3D | undefined;
}

const ComponentFocusContext = createContext<ComponentFocus | null>(null);

export function ComponentFocusProvider({ children }: { children: ReactNode }) {
  const roots = useRef(new Map<string, Object3D>());
  const value = useMemo<ComponentFocus>(
    () => ({
      register(registration) {
        registration.forEach((root, id) => roots.current.set(id, root));
        return () => {
          registration.forEach((root, id) => {
            if (roots.current.get(id) === root) roots.current.delete(id);
          });
        };
      },
      get: (id) => roots.current.get(id),
    }),
    [],
  );
  return (
    <ComponentFocusContext.Provider value={value}>
      {children}
    </ComponentFocusContext.Provider>
  );
}

export function useComponentFocus(): ComponentFocus {
  const context = useContext(ComponentFocusContext);
  if (!context) throw new Error("ComponentFocusProvider is required");
  return context;
}
