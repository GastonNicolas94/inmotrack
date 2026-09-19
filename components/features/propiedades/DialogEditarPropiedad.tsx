"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormPropiedad } from "./FormPropiedad";

interface Props {
  propietarios: Array<{ id: number; nombre: string }>;
  propiedad: {
    id: number;
    direccion: string;
    es_propia: boolean;
    participaciones: Array<{
      id_propietario: number;
      porcentaje: number;
    }>;
  };
}

export function DialogEditarPropiedad({ propietarios, propiedad }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Editar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar propiedad</DialogTitle>
          </DialogHeader>
          <FormPropiedad
            propietarios={propietarios}
            propiedad={propiedad}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
