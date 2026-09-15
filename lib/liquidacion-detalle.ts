import { Decimal } from "@prisma/client/runtime/client";

type Monto = Decimal | number | string;

interface LiquidacionParaDesglosar {
  monto_bruto: Monto;
  retenciones: Monto;
  adelantos_descontados: Monto;
  monto_neto: Monto;
  items: Array<{
    comision: Monto;
    gastos: Monto;
  }>;
}

export function calcularPorcentajeComision(montoBruto: Monto, comision: Monto) {
  const bruto = new Decimal(montoBruto);
  if (bruto.isZero()) return new Decimal(0);
  return new Decimal(comision).times(100).dividedBy(bruto);
}

export function calcularDesgloseLiquidacion(liquidacion: LiquidacionParaDesglosar) {
  const comisiones = liquidacion.items.reduce(
    (total, item) => total.plus(item.comision),
    new Decimal(0)
  );
  const gastos = liquidacion.items.reduce(
    (total, item) => total.plus(item.gastos),
    new Decimal(0)
  );
  const adelantos = new Decimal(liquidacion.adelantos_descontados);
  const retencionesCalculadas = comisiones.plus(gastos);
  const deducciones = retencionesCalculadas.plus(adelantos);
  const netoCalculado = new Decimal(liquidacion.monto_bruto).minus(deducciones);

  return {
    comisiones,
    gastos,
    adelantos,
    deducciones,
    netoCalculado,
    consistente:
      retencionesCalculadas.equals(liquidacion.retenciones) &&
      netoCalculado.equals(liquidacion.monto_neto),
  };
}
