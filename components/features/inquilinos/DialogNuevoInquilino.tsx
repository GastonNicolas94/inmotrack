"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormInquilino } from "./FormInquilino";

export function DialogNuevoInquilino() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo inquilino</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo inquilino</DialogTitle></DialogHeader>
          <FormInquilino onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
