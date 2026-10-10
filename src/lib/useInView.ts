import { useEffect, useRef, useState } from "react";

/** True once the element has scrolled into view (or always, if IntersectionObserver is missing). */
export function useInView<T extends Element>(options: IntersectionObserverInit = { threshold: 0.2 }, once = true) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        if (once) io.disconnect();
      } else if (!once) setInView(false);
    }, options);
    io.observe(el);
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [ref, inView] as const;
}
