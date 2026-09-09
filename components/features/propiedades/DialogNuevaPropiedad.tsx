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

interface Propietario {
  id: number;
  nombre: string;
}

export function DialogNuevaPropiedad({ propietarios }: { propietarios: Propietario[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nueva propiedad</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva propiedad</DialogTitle>
          </DialogHeader>
          <FormPropiedad
            propietarios={propietarios}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
