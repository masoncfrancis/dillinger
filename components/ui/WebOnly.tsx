"use client";

import { useEffect, useState } from "react";
import { getDesktopBridge } from "@/lib/desktop";

export function WebOnly({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDesktop(Boolean(getDesktopBridge()?.isDesktop));
  }, []);

  if (isDesktop !== false) return null;
  return <>{children}</>;
}
