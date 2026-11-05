/**
 * Lets any row in the logger register itself as a scroll target, so "Save" can scroll straight to
 * the first missing item (e.g. an unrated dimension inside a card).
 */
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import type { ScrollViewInstance, ViewInstance } from 'react-native';

interface ScrollTargets {
  register: (id: string, node: ViewInstance | null) => void;
  scrollTo: (id: string) => void;
}

const Ctx = createContext<ScrollTargets>({ register: () => undefined, scrollTo: () => undefined });

export function ScrollTargetsProvider({
  scrollRef,
  contentRef,
  children,
}: {
  scrollRef: RefObject<ScrollViewInstance | null>;
  contentRef: RefObject<ViewInstance | null>;
  children: ReactNode;
}) {
  const nodes = useRef(new Map<string, ViewInstance>());
  const register = useCallback((id: string, node: ViewInstance | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);
  const scrollTo = useCallback(
    (id: string) => {
      const node = nodes.current.get(id);
      const content = contentRef.current;
      if (!node || !content) return;
      try {
        node.measureLayout(content, (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }));
      } catch {
        // Measuring can fail while a row is mid-layout; the issue message is still shown.
      }
    },
    [contentRef, scrollRef],
  );
  const value = useMemo(() => ({ register, scrollTo }), [register, scrollTo]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScrollTargets(): ScrollTargets {
  return useContext(Ctx);
}

/** Ref callback that registers a view under `id`. */
export function useTargetRef(id: string) {
  const { register } = useScrollTargets();
  return useCallback((node: ViewInstance | null) => register(id, node), [register, id]);
}
