import { MenuPendientesService } from "@/services/menu-pendientes.service";

/** Server component: streams independently of the authenticated dashboard shell. */
export async function PendingCollectionsBadge() {
  const count = await MenuPendientesService.contar().catch(() => null);
  if (!count || count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="sidebar-label inline-flex min-w-5 items-center justify-center rounded bg-brand-soft px-1 py-0.5 text-[10px] font-bold tabular-nums text-primary"
      aria-label={`${count} períodos pendientes`}
    >
      {label}
    </span>
  );
}
