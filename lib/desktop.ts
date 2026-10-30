"use client";

export function getDesktopBridge(): Window["dillingerDesktop"] {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.dillingerDesktop;
}
