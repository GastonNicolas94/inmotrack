"use client";

import { useLinkStatus } from "next/link";

export function NavLinkPendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className="nav-link-pending-indicator"
      data-pending={pending}
    />
  );
}
