"use client";
import { useEffect } from "react";

/** Prefill a page's query box from ?q= (used by the Learn page's "Try it" links). */
export function usePrefill(set: (q: string) => void) {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) set(q);
  }, [set]);
}
