# UI del Módulo Financiero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir las pantallas del módulo financiero (Pagos, Gastos, Liquidaciones, Libro Diario) sobre las rutas API ya existentes, siguiendo el sistema de diseño ya establecido.

**Architecture:** Server Components para las tablas (leen directo de los `services/*`, sin fetch interno), Client Components solo para los modales de acción (fetch a `/api/v1/...`, `router.refresh()` al terminar). RBAC aplicado server-side con `await auth()` — los botones de acción se ocultan por completo para `AUDITOR`, no se deshabilitan.

**Tech Stack:** Next.js 16 App Router, react-hook-form + zodResolver, shadcn/base-ui, Tailwind con los tokens de `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-08-22-ui-modulo-financiero-design.md`

## Global Constraints

- Nunca colores crudos de Tailwind para estado de negocio (`bg-green-100`, etc.) — siempre `bg-status-{success,warning,danger,neutral}-bg` / `text-status-*`.
- Toda tabla de listado nueva va envuelta en `TableCard` (`components/layout/TableCard`); toda página nueva usa `PageHeader` (`components/layout/PageHeader`).
- Todo badge de estado nuevo usa `EstadoBadge` genérico (Task 1) — nunca reimplementar el patrón `Record<string,string> + <Badge>` inline.
- RBAC: `AUDITOR` nunca ve botones de acción (ocultos, no deshabilitados) — se resuelve con `await auth()` server-side en el Server Component de cada tabla, nunca confiando solo en que el backend devuelva 403.
- No hay test automatizado de UI en este proyecto — cada tarea termina con una verificación manual paso a paso (URL exacta + click exacto + resultado esperado), no con "probar que funciona".
- Nada de `git commit` salvo que el usuario lo pida explícitamente — los steps de "Commit" quedan documentados para ejecutarse manualmente después.

**Fuera de alcance de este plan:** dashboard de reportes/gráficos (pospuesto en el spec de UI), gestión de delegación vía UI (el endpoint ya existe en `app/api/v1/usuarios/route.ts`, sin pantalla).

---

## File Structure

**Refactor compartido:**
- Create: `components/features/shared/EstadoBadge.tsx`
- Modify: `components/features/contratos/BadgeEstadoContrato.tsx`, `components/features/shared/BadgeEstadoPeriodo.tsx`

**Navegación:**
- Modify: `components/layout/DashboardNav.tsx`

**Pagos:**
- Create: `components/features/pagos/ModalRegistrarPago.tsx`, `components/features/pagos/TablaPagos.tsx`, `app/(dashboard)/pagos/page.tsx`
- Modify: `components/features/contratos/BotonesContrato.tsx`

**Gastos:**
- Create: `components/features/gastos/ModalCargarGasto.tsx`, `components/features/gastos/BotonMarcarPagado.tsx`, `components/features/gastos/TablaGastos.tsx`, `app/(dashboard)/gastos/page.tsx`
- Modify: `components/features/contratos/BotonesContrato.tsx` (de nuevo, agrega el botón de gasto)

**Liquidaciones:**
- Create: `components/features/liquidaciones/BadgeEstadoLiquidacion.tsx`, `components/features/liquidaciones/ModalGenerarLiquidacion.tsx`, `components/features/liquidaciones/BotonesLiquidacion.tsx`, `components/features/liquidaciones/TablaLiquidaciones.tsx`, `app/(dashboard)/liquidaciones/page.tsx`

**Transacciones (Libro Diario):**
- Create: `components/features/transacciones/BadgeTipoTransaccion.tsx`, `components/features/transacciones/ModalContraAsiento.tsx`, `components/features/transacciones/FiltrosLibroDiario.tsx`, `components/features/transacciones/TablaLibroDiario.tsx`, `app/(dashboard)/transacciones/page.tsx`

---

### Task 1: `EstadoBadge` genérico + refactor de los badges existentes

**Files:**
- Create: `components/features/shared/EstadoBadge.tsx`
- Modify: `components/features/shared/BadgeEstadoPeriodo.tsx`
- Modify: `components/features/contratos/BadgeEstadoContrato.tsx`

**Interfaces:**
- Produces: `EstadoBadge({ valor, colores, formatear? }: { valor: string; colores: Record<string,string>; formatear?: (v:string)=>string })` — usado por todas las tareas siguientes que necesiten un badge de estado nuevo (Liquidaciones, Transacciones).

- [ ] **Step 1: Crear `components/features/shared/EstadoBadge.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";

export function EstadoBadge({
  valor,
  colores,
  formatear = (v: string) => v.replace(/_/g, " "),
}: {
  valor: string;
  colores: Record<string, string>;
  formatear?: (v: string) => string;
}) {
  return (
    <Badge className={`text-xs ${colores[valor] ?? "bg-status-neutral-bg text-status-neutral"}`}>
      {formatear(valor)}
    </Badge>
  );
}
```

- [ ] **Step 2: Refactorizar `components/features/shared/BadgeEstadoPeriodo.tsx`**

Reemplazar el archivo completo por:

```tsx
import { EstadoBadge } from "./EstadoBadge";

const COLORES: Record<string, string> = {
  CARGO_PENDIENTE: "bg-status-neutral-bg text-status-neutral",
  COBRADO_PARCIAL: "bg-status-warning-bg text-status-warning",
  COBRADO_TOTAL: "bg-status-success-bg text-status-success",
  VENCIDO_IMPAGO: "bg-status-danger-bg text-status-danger",
};

/** Estado de un período de pago (alquiler o expensa). Compartido entre contratos e inquilinos. */
export function BadgeEstadoPeriodo({ estado }: { estado: string }) {
  return <EstadoBadge valor={estado} colores={COLORES} />;
}
```

- [ ] **Step 3: Refactorizar `components/features/contratos/BadgeEstadoContrato.tsx`**

Reemplazar el archivo completo por:

```tsx
import { EstadoBadge } from "@/components/features/shared/EstadoBadge";

const COLORES: Record<string, string> = {
  BORRADOR: "bg-status-neutral-bg text-status-neutral hover:bg-status-neutral-bg",
  ACTIVO: "bg-status-success-bg text-status-success hover:bg-status-success-bg",
  MOROSO: "bg-status-warning-bg text-status-warning hover:bg-status-warning-bg",
  VENCIDO: "bg-status-danger-bg text-status-danger hover:bg-status-danger-bg",
  RESCINDIDO: "bg-status-neutral-bg text-status-neutral/70 hover:bg-status-neutral-bg",
};

export function BadgeEstadoContrato({ estado }: { estado: string }) {
  return <EstadoBadge valor={estado} colores={COLORES} />;
}
```

- [ ] **Step 4: Verificar manualmente**

Con `npm run dev` corriendo, abrir `http://localhost:3000/contratos`. Expected: los badges de estado de contrato se ven exactamente igual que antes (mismos colores, mismo texto) — el refactor no cambia el resultado visual, solo la implementación interna.

- [ ] **Step 5: Commit**

```bash
git add components/features/shared/EstadoBadge.tsx components/features/shared/BadgeEstadoPeriodo.tsx components/features/contratos/BadgeEstadoContrato.tsx
git commit -m "refactor(ui): EstadoBadge genérico, consumido por Contrato y Periodo"
```

---

### Task 2: Ampliar `DashboardNav` a 8 ítems

**Files:**
- Modify: `components/layout/DashboardNav.tsx`

**Interfaces:**
- Consumes: nada nuevo — mismo patrón `{ href, label, icon }` ya existente en el archivo.

- [ ] **Step 1: Reemplazar `NAV_ITEMS` en `components/layout/DashboardNav.tsx`**

Reemplazar el import de íconos y el array `NAV_ITEMS`:

```tsx
import {
  FileText, Building2, UserRound, Users,
  Wallet, Receipt, HandCoins, BookText,
} from "lucide-react";
```

```tsx
const NAV_ITEMS = [
  { href: "/contratos", label: "Contratos", icon: FileText },
  { href: "/propietarios", label: "Propietarios", icon: Users },
  { href: "/propiedades", label: "Propiedades", icon: Building2 },
  { href: "/inquilinos", label: "Inquilinos", icon: UserRound },
  { href: "/pagos", label: "Pagos", icon: Wallet },
  { href: "/gastos", label: "Gastos", icon: Receipt },
  { href: "/liquidaciones", label: "Liquidaciones", icon: HandCoins },
  { href: "/transacciones", label: "Libro Diario", icon: BookText },
];
```

El resto del archivo (el `.map` que renderiza cada `Link`) no cambia.

- [ ] **Step 2: Verificar manualmente**

Abrir `http://localhost:3000/contratos`. Expected: el sidebar muestra 8 ítems, en el orden de arriba. Las páginas de Pagos/Gastos/Liquidaciones/Transacciones todavía no existen (dan 404) hasta las próximas tareas — es esperado en este punto.

- [ ] **Step 3: Commit**

```bash
git add components/layout/DashboardNav.tsx
git commit -m "feat(ui): agrega Pagos, Gastos, Liquidaciones y Libro Diario al nav"
```

---

### Task 3: Registrar pago desde el contrato + página `/pagos`

**Files:**
- Create: `components/features/pagos/ModalRegistrarPago.tsx`
- Create: `components/features/pagos/TablaPagos.tsx`
- Create: `app/(dashboard)/pagos/page.tsx`
- Modify: `components/features/contratos/BotonesContrato.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/pagos` (body: `{ id_contrato, monto_pagado, idempotency_key }`), `PagosService.listarRecientes()` (ya existe, del plan de rutas API).
- Produces: `ModalRegistrarPago({ contrato }: { contrato: { id: number; inquilino: { nombre: string }; propiedad: { direccion: string } } })`.

- [ ] **Step 1: Crear `components/features/pagos/ModalRegistrarPago.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { pagoSchema, type PagoInput } from "@/schemas/pago.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  contrato: {
    id: number;
    inquilino: { nombre: string };
    propiedad: { direccion: string };
  };
}

function nuevoIdempotencyKey() {
  return crypto.randomUUID();
}

export function ModalRegistrarPago({ contrato }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const form = useForm<PagoInput>({
    resolver: zodResolver(pagoSchema),
    defaultValues: {
      id_contrato: contrato.id,
      monto_pagado: 0,
      idempotency_key: nuevoIdempotencyKey(),
    },
  });

  async function onSubmit(values: PagoInput) {
    const res = await fetch("/api/v1/pagos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al registrar el pago.");
      return;
    }

    toast.success("Pago registrado.");
    setOpen(false);
    form.reset({
      id_contrato: contrato.id,
      monto_pagado: 0,
      idempotency_key: nuevoIdempotencyKey(),
    });
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Registrar pago
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {contrato.propiedad.direccion} — {contrato.inquilino.nombre}
            </p>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="monto_pagado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto pagado ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Registrando..." : "Confirmar pago"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Agregar el botón en `components/features/contratos/BotonesContrato.tsx`**

Reemplazar el archivo completo por:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ModalRegistrarPago } from "@/components/features/pagos/ModalRegistrarPago";

interface Props {
  id: number;
  estado: string;
  contrato?: {
    id: number;
    inquilinoId: number;
    inquilino: { nombre: string };
    propiedad: { direccion: string };
  };
}

export function BotonesContrato({ id, estado, contrato }: Props) {
  const router = useRouter();

  async function activar() {
    const res = await fetch(`/api/v1/contratos/${id}/activar`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al activar.");
      return;
    }
    toast.success("Contrato activado. Primer período generado.");
    router.refresh();
  }

  if (estado === "BORRADOR") {
    return (
      <Button size="sm" variant="outline" onClick={activar}>
        Activar
      </Button>
    );
  }

  if ((estado === "ACTIVO" || estado === "MOROSO") && contrato) {
    return (
      <div className="flex items-center gap-1">
        <ModalRegistrarPago contrato={contrato} />
      </div>
    );
  }

  return null;
}
```

(El botón de gasto se agrega acá mismo en Task 5 — este `div` queda preparado para eso.)

- [ ] **Step 3: Crear `components/features/pagos/TablaPagos.tsx`**

```tsx
import { PagosService } from "@/services/pagos.service";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/layout/TableCard";

function formatFecha(fecha: Date) {
  return new Date(fecha).toLocaleString("es-AR");
}

function formatMonto(n: string) {
  return Number(n).toLocaleString("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  });
}

export async function TablaPagos() {
  const pagos = await PagosService.listarRecientes();

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Inquilino</TableHead>
            <TableHead>Propiedad</TableHead>
            <TableHead>Período</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No hay pagos registrados todavía.
              </TableCell>
            </TableRow>
          ) : (
            pagos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-sm text-muted-foreground">{formatFecha(p.fecha)}</TableCell>
                <TableCell>{p.inquilino ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.direccion ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm">{p.periodo ?? "—"}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatMonto(p.monto)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
```

- [ ] **Step 4: Crear `app/(dashboard)/pagos/page.tsx`**

```tsx
import { PageHeader } from "@/components/layout/PageHeader";
import { TablaPagos } from "@/components/features/pagos/TablaPagos";

export default function PagosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Caja"
        title="Pagos"
        description="Actividad de cobros reciente de toda la cartera."
      />
      <TablaPagos />
    </div>
  );
}
```

- [ ] **Step 5: Verificar manualmente**

Con `npm run dev` corriendo y sesión iniciada: ir a `/contratos`, activar o abrir un contrato en estado `ACTIVO`, click en "Registrar pago", cargar un monto, confirmar. Expected: toast de éxito. Ir a `/pagos`. Expected: el pago recién cargado aparece primero en la tabla, con inquilino/propiedad/período correctos.

- [ ] **Step 6: Commit**

```bash
git add components/features/pagos components/features/contratos/BotonesContrato.tsx "app/(dashboard)/pagos"
git commit -m "feat(ui): registrar pago desde el contrato + página de Pagos"
```

---

### Task 4: Cargar gasto (de propiedad o propio) + página `/gastos`

**Files:**
- Create: `components/features/gastos/ModalCargarGasto.tsx`
- Create: `components/features/gastos/BotonMarcarPagado.tsx`
- Create: `components/features/gastos/TablaGastos.tsx`
- Create: `app/(dashboard)/gastos/page.tsx`
- Modify: `components/features/contratos/BotonesContrato.tsx`
- Modify: `components/features/contratos/TablaContratos.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/gastos`, `PATCH /api/v1/gastos/[id]/marcar-pagado`, `GastosService.listar()` (ya existe).
- Produces: `ModalCargarGasto({ id_propiedad?, id_contrato?, label?, triggerLabel? })` — sin `id_propiedad` muestra el toggle "De una propiedad" / "Propio de la inmobiliaria"; con `id_propiedad` (invocado desde el contrato) el toggle no aparece.

- [ ] **Step 1: Crear `components/features/gastos/ModalCargarGasto.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { gastoSchema, type GastoInput } from "@/schemas/gasto.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  id_propiedad?: number;
  id_contrato?: number;
  label?: string;
  triggerLabel?: string;
}

export function ModalCargarGasto({ id_propiedad, id_contrato, label, triggerLabel = "Cargar gasto" }: Props) {
  const [open, setOpen] = useState(false);
  const [esPropio, setEsPropio] = useState(false);
  const router = useRouter();
  const contextoFijo = id_propiedad !== undefined;

  const form = useForm<GastoInput>({
    resolver: zodResolver(gastoSchema),
    defaultValues: {
      id_propiedad,
      id_contrato,
      concepto: "",
      monto: 0,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
      fecha_gasto: new Date().toISOString().slice(0, 10),
    },
  });

  function elegirDePropiedad() {
    setEsPropio(false);
    form.setValue("cargo_a", "PROPIETARIO");
  }

  function elegirPropio() {
    setEsPropio(true);
    form.setValue("cargo_a", "INMOBILIARIA");
    form.setValue("id_propiedad", undefined);
    form.setValue("id_contrato", undefined);
  }

  async function onSubmit(values: GastoInput) {
    const res = await fetch("/api/v1/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al cargar el gasto.");
      return;
    }

    toast.success("Gasto cargado.");
    setOpen(false);
    form.reset();
    setEsPropio(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cargar gasto</DialogTitle>
            {label && <p className="text-sm text-muted-foreground">{label}</p>}
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {!contextoFijo && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={esPropio ? "outline" : "default"}
                    onClick={elegirDePropiedad}
                  >
                    De una propiedad
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={esPropio ? "default" : "outline"}
                    onClick={elegirPropio}
                  >
                    Propio de la inmobiliaria
                  </Button>
                </div>
              )}

              <FormField
                control={form.control}
                name="concepto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Concepto</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {esPropio && !contextoFijo && (
                <FormField
                  control={form.control}
                  name="categoria_interno"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría (ej. Sueldos, Alquiler oficina)</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="monto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number" min={0} step={0.01} placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ARREGLO">Arreglo</SelectItem>
                        <SelectItem value="EXPENSA">Expensas</SelectItem>
                        <SelectItem value="GAS">Gas</SelectItem>
                        <SelectItem value="LUZ">Luz</SelectItem>
                        <SelectItem value="IMPUESTO">Impuesto</SelectItem>
                        <SelectItem value="OTRO">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!esPropio && (
                <FormField
                  control={form.control}
                  name="cargo_a"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo a</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="PROPIETARIO">Propietario</SelectItem>
                          <SelectItem value="INQUILINO">Inquilino</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="fecha_gasto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Guardando..." : "Cargar gasto"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Agregar `id_propiedad` al include de `TablaContratos.tsx` y pasarlo a `BotonesContrato`**

En `components/features/contratos/TablaContratos.tsx`, el objeto `contrato` que se le pasa a `BotonesContrato` (dentro del `.map`) se amplía con `id_propiedad`:

```tsx
                    <BotonesContrato
                      id={c.id}
                      estado={c.estado}
                      contrato={{
                        id: c.id,
                        inquilinoId: c.id_inquilino,
                        id_propiedad: c.id_propiedad,
                        inquilino: { nombre: c.inquilino.nombre },
                        propiedad: { direccion: c.propiedad.direccion },
                      }}
                    />
```

- [ ] **Step 3: Actualizar `components/features/contratos/BotonesContrato.tsx` para agregar el botón de gasto**

Reemplazar el archivo completo por:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ModalRegistrarPago } from "@/components/features/pagos/ModalRegistrarPago";
import { ModalCargarGasto } from "@/components/features/gastos/ModalCargarGasto";

interface Props {
  id: number;
  estado: string;
  contrato?: {
    id: number;
    inquilinoId: number;
    id_propiedad: number;
    inquilino: { nombre: string };
    propiedad: { direccion: string };
  };
}

export function BotonesContrato({ id, estado, contrato }: Props) {
  const router = useRouter();

  async function activar() {
    const res = await fetch(`/api/v1/contratos/${id}/activar`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al activar.");
      return;
    }
    toast.success("Contrato activado. Primer período generado.");
    router.refresh();
  }

  if (estado === "BORRADOR") {
    return (
      <Button size="sm" variant="outline" onClick={activar}>
        Activar
      </Button>
    );
  }

  if ((estado === "ACTIVO" || estado === "MOROSO") && contrato) {
    return (
      <div className="flex items-center gap-1">
        <ModalRegistrarPago contrato={contrato} />
        <ModalCargarGasto
          id_propiedad={contrato.id_propiedad}
          id_contrato={contrato.id}
          label={`${contrato.propiedad.direccion} — ${contrato.inquilino.nombre}`}
          triggerLabel="Gasto"
        />
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 4: Crear `components/features/gastos/BotonMarcarPagado.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function BotonMarcarPagado({ id }: { id: number }) {
  const router = useRouter();

  async function marcarPagado() {
    const res = await fetch(`/api/v1/gastos/${id}/marcar-pagado`, { method: "PATCH" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al marcar como pagado.");
      return;
    }
    toast.success("Gasto marcado como pagado.");
    router.refresh();
  }

  return (
    <Button size="sm" variant="ghost" className="text-xs" onClick={marcarPagado}>
      Marcar pagado
    </Button>
  );
}
```

- [ ] **Step 5: Crear `components/features/gastos/TablaGastos.tsx`**

```tsx
import { GastosService } from "@/services/gastos.service";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/layout/TableCard";
import { EstadoBadge } from "@/components/features/shared/EstadoBadge";
import { ModalCargarGasto } from "./ModalCargarGasto";
import { BotonMarcarPagado } from "./BotonMarcarPagado";

const COLORES_CARGO: Record<string, string> = {
  INQUILINO: "bg-status-warning-bg text-status-warning",
  PROPIETARIO: "bg-status-neutral-bg text-status-neutral",
  INMOBILIARIA: "bg-status-success-bg text-status-success",
};

function formatMonto(n: number | string) {
  return Number(n).toLocaleString("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  });
}

export async function TablaGastos() {
  const gastos = await GastosService.listar();

  return (
    <TableCard action={<ModalCargarGasto triggerLabel="+ Nuevo gasto" />}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Concepto</TableHead>
            <TableHead>Propiedad</TableHead>
            <TableHead className="text-center">Cargo a</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {gastos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No hay gastos cargados.
              </TableCell>
            </TableRow>
          ) : (
            gastos.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">
                  {g.concepto}
                  {g.categoria_interno && (
                    <span className="block text-xs text-muted-foreground">{g.categoria_interno}</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {g.propiedad?.direccion ?? "— (propio)"}
                </TableCell>
                <TableCell className="text-center">
                  <EstadoBadge valor={g.cargo_a} colores={COLORES_CARGO} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatMonto(g.monto.toString())}
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-xs text-muted-foreground">
                    {g.estado_pago === "PENDIENTE" ? "Pendiente" : "Pagado"}
                  </span>
                </TableCell>
                <TableCell>
                  {g.estado_pago === "PENDIENTE" && <BotonMarcarPagado id={g.id} />}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
```

- [ ] **Step 6: Crear `app/(dashboard)/gastos/page.tsx`**

```tsx
import { PageHeader } from "@/components/layout/PageHeader";
import { TablaGastos } from "@/components/features/gastos/TablaGastos";

export default function GastosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Caja"
        title="Gastos"
        description="Arreglos, expensas y gastos propios de la inmobiliaria."
      />
      <TablaGastos />
    </div>
  );
}
```

- [ ] **Step 7: Verificar manualmente**

Desde un contrato `ACTIVO`, click en "Gasto", cargar un arreglo con `cargo_a = PROPIETARIO`, confirmar. Expected: toast de éxito. Ir a `/gastos`. Expected: aparece, sin toggle de contexto (ya se cargó con propiedad). Click en "+ Nuevo gasto" en `/gastos`, elegir "Propio de la inmobiliaria", cargar un gasto con categoría "Sueldos". Expected: aparece en la tabla con "— (propio)" en la columna Propiedad y badge `INMOBILIARIA`. Click "Marcar pagado" en cualquiera de los dos. Expected: cambia a "Pagado" y desaparece el botón.

- [ ] **Step 8: Commit**

```bash
git add components/features/gastos components/features/contratos/BotonesContrato.tsx components/features/contratos/TablaContratos.tsx "app/(dashboard)/gastos"
git commit -m "feat(ui): cargar gasto (de propiedad o propio) + página de Gastos"
```

---

### Task 5: Página `/liquidaciones`

**Files:**
- Create: `components/features/liquidaciones/BadgeEstadoLiquidacion.tsx`
- Create: `components/features/liquidaciones/ModalGenerarLiquidacion.tsx`
- Create: `components/features/liquidaciones/BotonesLiquidacion.tsx`
- Create: `components/features/liquidaciones/TablaLiquidaciones.tsx`
- Create: `app/(dashboard)/liquidaciones/page.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/liquidaciones`, `POST /api/v1/liquidaciones/[id]/aprobar`, `POST /api/v1/liquidaciones/[id]/confirmar-pago`, `LiquidacionesService.listar()`, `PropietariosService.listar()` (ambos ya existen).

- [ ] **Step 1: Crear `components/features/liquidaciones/BadgeEstadoLiquidacion.tsx`**

```tsx
import { EstadoBadge } from "@/components/features/shared/EstadoBadge";

const COLORES: Record<string, string> = {
  PENDIENTE: "bg-status-neutral-bg text-status-neutral",
  APROBADA: "bg-status-warning-bg text-status-warning",
  PAGADA: "bg-status-success-bg text-status-success",
};

export function BadgeEstadoLiquidacion({ estado }: { estado: string }) {
  return <EstadoBadge valor={estado} colores={COLORES} />;
}
```

- [ ] **Step 2: Crear `components/features/liquidaciones/ModalGenerarLiquidacion.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Propietario { id: number; nombre: string }

export function ModalGenerarLiquidacion({ propietarios }: { propietarios: Propietario[] }) {
  const [open, setOpen] = useState(false);
  const [idPropietario, setIdPropietario] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function generar() {
    if (!idPropietario) return;
    setLoading(true);
    const res = await fetch("/api/v1/liquidaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_propietario: idPropietario }),
    });
    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al generar la liquidación.");
      return;
    }

    toast.success("Liquidación generada.");
    setOpen(false);
    setIdPropietario(null);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Generar liquidación</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Generar liquidación</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select onValueChange={(v) => setIdPropietario(Number(v))}>
              <SelectTrigger><SelectValue placeholder="Seleccioná un propietario" /></SelectTrigger>
              <SelectContent>
                {propietarios.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="w-full" disabled={!idPropietario || loading} onClick={generar}>
              {loading ? "Generando..." : "Generar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Crear `components/features/liquidaciones/BotonesLiquidacion.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function BotonesLiquidacion({
  id,
  estado,
  puedeAprobar,
  esAdmin,
}: {
  id: number;
  estado: string;
  puedeAprobar: boolean;
  esAdmin: boolean;
}) {
  const router = useRouter();

  async function aprobar() {
    const res = await fetch(`/api/v1/liquidaciones/${id}/aprobar`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al aprobar.");
      return;
    }
    toast.success("Liquidación aprobada.");
    router.refresh();
  }

  async function confirmarPago() {
    const res = await fetch(`/api/v1/liquidaciones/${id}/confirmar-pago`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al confirmar el pago.");
      return;
    }
    toast.success("Pago confirmado.");
    router.refresh();
  }

  if (estado === "PENDIENTE" && puedeAprobar) {
    return <Button size="sm" variant="outline" onClick={aprobar}>Aprobar</Button>;
  }
  if (estado === "APROBADA" && esAdmin) {
    return <Button size="sm" variant="outline" onClick={confirmarPago}>Confirmar pago</Button>;
  }
  return null;
}
```

- [ ] **Step 4: Crear `components/features/liquidaciones/TablaLiquidaciones.tsx`**

```tsx
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { PropietariosService } from "@/services/propietarios.service";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/layout/TableCard";
import { BadgeEstadoLiquidacion } from "./BadgeEstadoLiquidacion";
import { ModalGenerarLiquidacion } from "./ModalGenerarLiquidacion";
import { BotonesLiquidacion } from "./BotonesLiquidacion";

function formatMonto(n: number | string) {
  return Number(n).toLocaleString("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  });
}

export async function TablaLiquidaciones() {
  const [liquidaciones, propietarios, session] = await Promise.all([
    LiquidacionesService.listar(),
    PropietariosService.listar(),
    auth(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rol = (session?.user as any)?.rol as string | undefined;
  const esAdmin = rol === "ADMIN";
  let puedeAprobar = esAdmin;
  if (!esAdmin && rol === "EMPLEADO" && session?.user?.id) {
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(session.user.id) } });
    puedeAprobar = usuario?.puede_aprobar_liquidaciones ?? false;
  }
  const mostrarAcciones = rol !== "AUDITOR";

  return (
    <TableCard action={mostrarAcciones ? <ModalGenerarLiquidacion propietarios={propietarios} /> : undefined}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Propietario</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Bruto</TableHead>
            <TableHead className="text-right">Retenciones</TableHead>
            <TableHead className="text-right">Neto</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            {mostrarAcciones && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {liquidaciones.length === 0 ? (
            <TableRow>
              <TableCell colSpan={mostrarAcciones ? 7 : 6} className="text-center text-muted-foreground py-8">
                No hay liquidaciones generadas.
              </TableCell>
            </TableRow>
          ) : (
            liquidaciones.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.propietario.nombre}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(l.fecha_corrida).toLocaleDateString("es-AR")}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatMonto(l.monto_bruto.toString())}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                  {formatMonto(l.retenciones.toString())}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">
                  {formatMonto(l.monto_neto.toString())}
                </TableCell>
                <TableCell className="text-center">
                  <BadgeEstadoLiquidacion estado={l.estado} />
                </TableCell>
                {mostrarAcciones && (
                  <TableCell>
                    <BotonesLiquidacion
                      id={l.id}
                      estado={l.estado}
                      puedeAprobar={puedeAprobar}
                      esAdmin={esAdmin}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
```

- [ ] **Step 5: Crear `app/(dashboard)/liquidaciones/page.tsx`**

```tsx
import { PageHeader } from "@/components/layout/PageHeader";
import { TablaLiquidaciones } from "@/components/features/liquidaciones/TablaLiquidaciones";

export default function LiquidacionesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Caja"
        title="Liquidaciones"
        description="Rendición de cuentas a los propietarios."
      />
      <TablaLiquidaciones />
    </div>
  );
}
```

- [ ] **Step 6: Verificar manualmente**

Ir a `/liquidaciones`, click "+ Generar liquidación", elegir un propietario con cobros pendientes de rendir, generar. Expected: aparece con estado `PENDIENTE` y el botón "Aprobar" (con sesión ADMIN). Click "Aprobar". Expected: pasa a `APROBADA`, aparece "Confirmar pago". Click "Confirmar pago". Expected: pasa a `PAGADA`, sin más acciones.

- [ ] **Step 7: Commit**

```bash
git add components/features/liquidaciones "app/(dashboard)/liquidaciones"
git commit -m "feat(ui): página de Liquidaciones con generar/aprobar/confirmar"
```

---

### Task 6: Página `/transacciones` (Libro Diario)

**Files:**
- Create: `components/features/transacciones/BadgeTipoTransaccion.tsx`
- Create: `components/features/transacciones/ModalContraAsiento.tsx`
- Create: `components/features/transacciones/FiltrosLibroDiario.tsx`
- Create: `components/features/transacciones/TablaLibroDiario.tsx`
- Create: `app/(dashboard)/transacciones/page.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/transacciones?tipo=&caja=&desde=&hasta=`, `POST /api/v1/transacciones/contra-asiento`, `TransaccionesService.listar()` (ya existe).

- [ ] **Step 1: Crear `components/features/transacciones/BadgeTipoTransaccion.tsx`**

```tsx
import { EstadoBadge } from "@/components/features/shared/EstadoBadge";

const COLORES: Record<string, string> = {
  INGRESO_COBRO: "bg-status-success-bg text-status-success",
  INGRESO_COMISION: "bg-status-success-bg text-status-success",
  INGRESO_PUNITORIO: "bg-status-success-bg text-status-success",
  INGRESO_ALQUILER_PROPIO: "bg-status-success-bg text-status-success",
  EGRESO_LIQUIDACION: "bg-status-danger-bg text-status-danger",
  EGRESO_TERCEROS: "bg-status-danger-bg text-status-danger",
  EGRESO_OPERATIVO: "bg-status-danger-bg text-status-danger",
  CONTRA_ASIENTO: "bg-status-neutral-bg text-status-neutral",
};

export function BadgeTipoTransaccion({ tipo }: { tipo: string }) {
  return <EstadoBadge valor={tipo} colores={COLORES} />;
}
```

- [ ] **Step 2: Crear `components/features/transacciones/ModalContraAsiento.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export function ModalContraAsiento({ idTxnOrigen }: { idTxnOrigen: number }) {
  const [open, setOpen] = useState(false);
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function crear() {
    if (!comentario.trim()) {
      toast.error("El comentario es obligatorio.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/v1/transacciones/contra-asiento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_txn_origen: idTxnOrigen, comentario }),
    });
    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al generar el contra-asiento.");
      return;
    }

    toast.success("Contra-asiento generado.");
    setOpen(false);
    setComentario("");
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setOpen(true)}>
        Anular
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Generar contra-asiento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Motivo de la anulación (obligatorio)"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
            <Button className="w-full" disabled={loading} onClick={crear}>
              {loading ? "Generando..." : "Confirmar anulación"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Crear `components/features/transacciones/FiltrosLibroDiario.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const TIPOS = [
  "INGRESO_COBRO", "INGRESO_COMISION", "INGRESO_PUNITORIO", "INGRESO_ALQUILER_PROPIO",
  "EGRESO_LIQUIDACION", "EGRESO_TERCEROS", "EGRESO_OPERATIVO", "CONTRA_ASIENTO",
];

export function FiltrosLibroDiario() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setFiltro(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(clave, valor); else params.delete(clave);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select onValueChange={(v) => setFiltro("tipo", v === "TODOS" ? "" : v)}>
        <SelectTrigger className="w-48"><SelectValue placeholder="Todos los tipos" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="TODOS">Todos los tipos</SelectItem>
          {TIPOS.map((t) => (
            <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select onValueChange={(v) => setFiltro("caja", v === "TODAS" ? "" : v)}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Todas las cajas" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="TODAS">Todas las cajas</SelectItem>
          <SelectItem value="TERCEROS">Terceros</SelectItem>
          <SelectItem value="OPERATIVA">Operativa</SelectItem>
        </SelectContent>
      </Select>
      <Input type="date" className="w-40" onChange={(e) => setFiltro("desde", e.target.value)} />
      <Input type="date" className="w-40" onChange={(e) => setFiltro("hasta", e.target.value)} />
    </div>
  );
}
```

- [ ] **Step 4: Crear `components/features/transacciones/TablaLibroDiario.tsx`**

```tsx
import { TransaccionesService } from "@/services/transacciones.service";
import { auth } from "@/lib/auth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/layout/TableCard";
import { BadgeTipoTransaccion } from "./BadgeTipoTransaccion";
import { ModalContraAsiento } from "./ModalContraAsiento";

function formatMonto(n: number | string) {
  return Number(n).toLocaleString("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  });
}

export async function TablaLibroDiario({
  filtros,
}: {
  filtros: { tipo?: string; caja?: string; desde?: string; hasta?: string };
}) {
  const [transacciones, session] = await Promise.all([
    TransaccionesService.listar({
      tipo: filtros.tipo,
      caja_destino: filtros.caja,
      desde: filtros.desde ? new Date(filtros.desde) : undefined,
      hasta: filtros.hasta ? new Date(filtros.hasta) : undefined,
    }),
    auth(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const esAdmin = ((session?.user as any)?.rol as string | undefined) === "ADMIN";

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-center">Tipo</TableHead>
            <TableHead className="text-center">Caja</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Usuario</TableHead>
            {esAdmin && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {transacciones.length === 0 ? (
            <TableRow>
              <TableCell colSpan={esAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">
                No hay movimientos para este filtro.
              </TableCell>
            </TableRow>
          ) : (
            transacciones.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(t.fecha_transaccion).toLocaleString("es-AR")}
                </TableCell>
                <TableCell className="text-center">
                  <BadgeTipoTransaccion tipo={t.tipo} />
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{t.caja_destino}</TableCell>
                <TableCell
                  className={`text-right font-mono text-sm ${
                    Number(t.monto) < 0 ? "text-status-danger" : "text-status-success"
                  }`}
                >
                  {formatMonto(t.monto.toString())}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.usuario_creador?.email ?? "Sistema"}
                </TableCell>
                {esAdmin && (
                  <TableCell>
                    {t.tipo !== "CONTRA_ASIENTO" && <ModalContraAsiento idTxnOrigen={t.id} />}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
```

- [ ] **Step 5: Crear `app/(dashboard)/transacciones/page.tsx`**

```tsx
import { PageHeader } from "@/components/layout/PageHeader";
import { FiltrosLibroDiario } from "@/components/features/transacciones/FiltrosLibroDiario";
import { TablaLibroDiario } from "@/components/features/transacciones/TablaLibroDiario";

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; caja?: string; desde?: string; hasta?: string }>;
}) {
  const filtros = await searchParams;
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Contabilidad"
        title="Libro Diario"
        description="Registro inmutable de todos los movimientos de caja."
      />
      <FiltrosLibroDiario />
      <TablaLibroDiario filtros={filtros} />
    </div>
  );
}
```

- [ ] **Step 6: Verificar manualmente**

Ir a `/transacciones`. Expected: se ven todos los movimientos generados por las tareas anteriores (pagos, comisiones, egresos de gastos, liquidación). Filtrar por tipo `INGRESO_COBRO`. Expected: solo esos. Con sesión `ADMIN`, click "Anular" sobre una transacción, cargar un comentario, confirmar. Expected: aparece una nueva fila `CONTRA_ASIENTO` con el monto invertido. Con sesión de un rol distinto de `ADMIN`, la columna de acciones no debe aparecer.

- [ ] **Step 7: Commit**

```bash
git add components/features/transacciones "app/(dashboard)/transacciones"
git commit -m "feat(ui): página del Libro Diario con filtros y contra-asiento"
```

---

## Self-Review

**1. Cobertura del spec de UI:**
- Sección 2 (navegación y páginas) → Task 2 (nav) + Tasks 3-6 (las 4 páginas).
- Sección 2 (puntos de entrada duales Pagos/Gastos) → Task 3 (botón en contrato + página) y Task 4 (ídem, con el caso extra de gasto propio sin contexto de contrato).
- Sección 3 (estructura de componentes, `EstadoBadge` genérico) → Task 1.
- Sección 4 (RBAC) → aplicado en Task 5 (`puedeAprobar`/`esAdmin`, botones ocultos) y Task 6 (`esAdmin`, columna de acciones oculta para el resto).

**2. Placeholder scan:** cada step de verificación manual tiene la URL y el click exacto, no "verificar que anda".

**3. Consistencia de tipos:** `ModalRegistrarPago` y `ModalCargarGasto` usan los mismos `pagoSchema`/`gastoSchema` que ya validan en el backend (Zod compartido cliente/servidor). `EstadoBadge` tiene la misma firma en las 4 tareas que lo consumen (Contrato/Periodo ya existentes, Liquidación y Transacción nuevas). El shape de `contrato` que recibe `ModalRegistrarPago`/`ModalCargarGasto` desde `BotonesContrato` es consistente con lo que `TablaContratos.tsx` ya arma (Task 4, Step 2, agrega solo `id_propiedad` al objeto existente).

---

Plan completo y guardado en `docs/superpowers/plans/2026-08-22-ui-modulo-financiero.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — despliego un subagente fresco por tarea, con revisión entre tareas.

**2. Ejecución Inline** — ejecuto las tareas en esta sesión con executing-plans.

¿Cuál preferís?
