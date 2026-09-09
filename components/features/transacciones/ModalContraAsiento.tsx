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
      <Button size="sm" variant="destructive" className="text-xs" onClick={() => setOpen(true)}>
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
