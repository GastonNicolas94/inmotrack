"use client";

import { useEffect } from "react";
import { passwordEmailCallbackPath } from "@/lib/supabase/invitation";

export function PasswordEmailLanding() {
  useEffect(() => {
    const callback = passwordEmailCallbackPath(window.location.hash);
    if (callback) window.location.replace(callback);
  }, []);

  return null;
}
