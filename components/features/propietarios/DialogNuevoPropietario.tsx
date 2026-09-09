"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormPropietario } from "./FormPropietario";

export function DialogNuevoPropietario() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo propietario</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo propietario</DialogTitle>
          </DialogHeader>
          <FormPropietario onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
