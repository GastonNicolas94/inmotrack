/** Estado de carga o vacío dentro de un modal que trae datos por fetch. Compartido entre contratos e inquilinos. */
export function EstadoAsyncModal({ mensaje }: { mensaje: string }) {
  return <p className="text-center py-6 text-muted-foreground text-sm">{mensaje}</p>;
}
