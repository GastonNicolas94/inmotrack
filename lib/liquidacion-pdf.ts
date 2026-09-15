import PDFDocument from "pdfkit";
import type { LiquidacionDetalle } from "@/services/liquidaciones.service";
import { etiquetaTipoCargo } from "@/lib/cargos";
import { formatFechaLocal } from "@/lib/fecha";
import {
  calcularDesgloseLiquidacion,
  calcularPorcentajeComision,
} from "@/lib/liquidacion-detalle";

const MARGEN = 32;
const COLOR_TEXTO = "#172033";
const COLOR_SECUNDARIO = "#667085";
const COLOR_PRIMARIO = "#2457D6";
const COLOR_BORDE = "#D8DEE9";
const COLOR_CABECERA = "#EEF3FF";
const COLOR_FONDO = "#F7F9FC";

const FORMATO_MONTO = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  dateStyle: "short",
  timeStyle: "short",
});

type Alineacion = "left" | "center" | "right";

interface Columna {
  titulo: string;
  ancho: number;
  alineacion?: Alineacion;
}

function monto(valor: { toString(): string } | number | string) {
  return FORMATO_MONTO.format(Number(valor.toString()));
}

function fechaHora(valor: Date | string) {
  return FORMATO_FECHA_HORA.format(new Date(valor));
}

function estadoLegible(estado: string) {
  return estado.replaceAll("_", " ");
}

function agregarEncabezado(doc: PDFKit.PDFDocument, liquidacion: LiquidacionDetalle) {
  doc.fillColor(COLOR_PRIMARIO).font("Helvetica-Bold").fontSize(11).text("INMOTRACK");
  doc
    .fillColor(COLOR_TEXTO)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("Detalle de liquidación", MARGEN, 50);
  doc
    .fillColor(COLOR_SECUNDARIO)
    .font("Helvetica")
    .fontSize(9)
    .text(`Liquidación #${liquidacion.id} · ${estadoLegible(liquidacion.estado)}`, MARGEN, 79);

  const derecha = doc.page.width - MARGEN - 300;
  doc
    .fillColor(COLOR_TEXTO)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(liquidacion.propietario.nombre, derecha, 48, { width: 300, align: "right" });
  doc
    .fillColor(COLOR_SECUNDARIO)
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Período: ${formatFechaLocal(liquidacion.fecha_desde)} al ${formatFechaLocal(liquidacion.fecha_hasta)}`,
      derecha,
      68,
      { width: 300, align: "right" }
    );

  doc.moveTo(MARGEN, 100).lineTo(doc.page.width - MARGEN, 100).strokeColor(COLOR_BORDE).stroke();
  doc.y = 116;
}

function agregarResumen(doc: PDFKit.PDFDocument, liquidacion: LiquidacionDetalle) {
  const desglose = calcularDesgloseLiquidacion(liquidacion);
  const datos = [
    ["BRUTO COBRADO", monto(liquidacion.monto_bruto)],
    ["COMISIÓN", monto(desglose.comisiones)],
    ["GASTOS", monto(desglose.gastos)],
    ["ADELANTOS", monto(desglose.adelantos)],
    ["NETO A PAGAR", monto(liquidacion.monto_neto)],
  ];
  const espacio = 8;
  const ancho = (doc.page.width - MARGEN * 2 - espacio * 4) / 5;
  const y = doc.y;

  datos.forEach(([etiqueta, valor], indice) => {
    const x = MARGEN + indice * (ancho + espacio);
    doc
      .roundedRect(x, y, ancho, 54, 5)
      .fillAndStroke(indice === 4 ? COLOR_CABECERA : COLOR_FONDO, COLOR_BORDE);
    doc
      .fillColor(COLOR_SECUNDARIO)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(etiqueta, x + 9, y + 9, { width: ancho - 18 });
    doc
      .fillColor(indice === 4 ? COLOR_PRIMARIO : COLOR_TEXTO)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(valor, x + 9, y + 29, { width: ancho - 18 });
  });

  doc.y = y + 72;
}

function agregarTituloSeccion(doc: PDFKit.PDFDocument, titulo: string, descripcion: string) {
  if (doc.y > doc.page.height - 90) doc.addPage();
  doc.fillColor(COLOR_TEXTO).font("Helvetica-Bold").fontSize(14).text(titulo, MARGEN, doc.y);
  doc
    .fillColor(COLOR_SECUNDARIO)
    .font("Helvetica")
    .fontSize(8)
    .text(descripcion, MARGEN, doc.y + 3);
  doc.y += 12;
}

function dibujarCabeceraTabla(doc: PDFKit.PDFDocument, columnas: Columna[], y: number) {
  let x = MARGEN;
  for (const columna of columnas) {
    doc.rect(x, y, columna.ancho, 22).fillAndStroke(COLOR_CABECERA, COLOR_BORDE);
    doc
      .fillColor(COLOR_TEXTO)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(columna.titulo, x + 5, y + 7, {
        width: columna.ancho - 10,
        align: columna.alineacion ?? "left",
      });
    x += columna.ancho;
  }
  return y + 22;
}

function agregarTabla(doc: PDFKit.PDFDocument, columnas: Columna[], filas: string[][]) {
  let y = dibujarCabeceraTabla(doc, columnas, doc.y);
  const limite = () => doc.page.height - MARGEN - 22;

  const agregarPagina = () => {
    doc.addPage();
    y = dibujarCabeceraTabla(doc, columnas, MARGEN);
  };

  const filasFinales = filas.length > 0 ? filas : [["Sin movimientos incluidos."]];
  filasFinales.forEach((fila, indiceFila) => {
    const valores = filas.length > 0 ? fila : [fila[0], ...columnas.slice(1).map(() => "")];
    doc.font("Helvetica").fontSize(7);
    const alto = Math.max(
      23,
      ...columnas.map((columna, indice) =>
        doc.heightOfString(valores[indice] ?? "", { width: columna.ancho - 10 }) + 10
      )
    );
    if (y + alto > limite()) agregarPagina();

    let x = MARGEN;
    columnas.forEach((columna, indice) => {
      const fondo = indiceFila % 2 === 0 ? "#FFFFFF" : COLOR_FONDO;
      doc.rect(x, y, columna.ancho, alto).fillAndStroke(fondo, COLOR_BORDE);
      doc
        .fillColor(COLOR_TEXTO)
        .font("Helvetica")
        .fontSize(7)
        .text(valores[indice] ?? "", x + 5, y + 5, {
          width: columna.ancho - 10,
          height: alto - 10,
          align: columna.alineacion ?? "left",
          ellipsis: true,
        });
      x += columna.ancho;
    });
    y += alto;
  });

  doc.y = y + 22;
}

function agregarPieDePagina(doc: PDFKit.PDFDocument) {
  const rango = doc.bufferedPageRange();
  for (let indice = 0; indice < rango.count; indice += 1) {
    doc.switchToPage(rango.start + indice);
    doc
      .fillColor(COLOR_SECUNDARIO)
      .font("Helvetica")
      .fontSize(7)
      .text(
        `Liquidación · Documento generado por Inmotrack · Página ${indice + 1} de ${rango.count}`,
        MARGEN,
        doc.page.height - MARGEN - 18,
        { width: doc.page.width - MARGEN * 2, align: "center", lineBreak: false }
      );
  }
}

export async function generarPdfLiquidacion(liquidacion: LiquidacionDetalle): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: MARGEN, right: MARGEN, bottom: MARGEN, left: MARGEN },
    bufferPages: true,
    compress: false,
    info: {
      Title: `Liquidación #${liquidacion.id} - ${liquidacion.propietario.nombre}`,
      Author: "Inmotrack",
      Subject: "Detalle auditable de liquidación",
    },
  });
  const fragmentos: Buffer[] = [];
  const terminado = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (fragmento) => fragmentos.push(Buffer.from(fragmento)));
    doc.on("end", () => resolve(Buffer.concat(fragmentos)));
    doc.on("error", reject);
  });

  agregarEncabezado(doc, liquidacion);
  agregarResumen(doc, liquidacion);

  const itemsAlquiler = liquidacion.items.filter((item) => item.id_periodo !== null);
  agregarTituloSeccion(
    doc,
    "Alquileres cobrados",
    "Cargos y cobros efectivamente incluidos en esta liquidación."
  );
  agregarTabla(
    doc,
    [
      { titulo: "PROPIEDAD", ancho: 105 },
      { titulo: "PERÍODO", ancho: 55 },
      { titulo: "INQUILINO", ancho: 95 },
      { titulo: "CARGOS Y COBROS", ancho: 235 },
      { titulo: "BRUTO", ancho: 87, alineacion: "right" },
      { titulo: "COMISIÓN", ancho: 87, alineacion: "right" },
      { titulo: "NETO", ancho: 87, alineacion: "right" },
    ],
    itemsAlquiler.flatMap((item) => {
      const aplicaciones = item.aplicaciones.length > 0 ? item.aplicaciones : [null];
      return aplicaciones.map((aplicacion, indice) => [
        indice === 0 ? item.propiedad.direccion : "",
        indice === 0 ? item.periodo?.periodo ?? "-" : "",
        indice === 0 ? item.periodo?.contrato.inquilino.nombre ?? "-" : "",
        aplicacion
          ? `Cargo #${aplicacion.cargo.id} · ${etiquetaTipoCargo(aplicacion.cargo.tipo)}${
              aplicacion.cargo.descripcion ? ` - ${aplicacion.cargo.descripcion}` : ""
            }\nTransacción #${aplicacion.transaccion.id} · ${fechaHora(
              aplicacion.transaccion.fecha_transaccion
            )} · ${monto(aplicacion.monto_aplicado)}`
          : "Sin aplicaciones asociadas",
        indice === 0 ? monto(item.monto_bruto) : "",
        indice === 0
          ? `${monto(item.comision)}\n${calcularPorcentajeComision(
              item.monto_bruto,
              item.comision
            ).toFixed(2)}%`
          : "",
        indice === 0 ? monto(item.monto_neto) : "",
      ]);
    })
  );

  const gastos = liquidacion.items.flatMap((item) =>
    item.gastos_item.map((gasto) => ({ gasto, propiedad: item.propiedad }))
  );
  agregarTituloSeccion(
    doc,
    "Gastos descontados",
    "Gastos a cargo del propietario incluidos como deducción."
  );
  agregarTabla(
    doc,
    [
      { titulo: "PROPIEDAD", ancho: 175 },
      { titulo: "GASTO", ancho: 270 },
      { titulo: "FECHA", ancho: 110 },
      { titulo: "ESTADO", ancho: 100, alineacion: "center" },
      { titulo: "MONTO", ancho: 96, alineacion: "right" },
    ],
    gastos.map(({ gasto, propiedad }) => [
      propiedad.direccion,
      `Gasto #${gasto.id} - ${gasto.concepto}\n${estadoLegible(gasto.tipo)}${
        gasto.categoria_interno ? ` · ${gasto.categoria_interno}` : ""
      }`,
      fechaHora(gasto.creado_en),
      estadoLegible(gasto.estado_pago),
      monto(gasto.monto),
    ])
  );

  agregarTituloSeccion(
    doc,
    "Adelantos descontados",
    "Adelantos previos recuperados en esta liquidación."
  );
  agregarTabla(
    doc,
    [
      { titulo: "ADELANTO", ancho: 320 },
      { titulo: "FECHA ORIGINAL", ancho: 150 },
      { titulo: "MONTO ORIGINAL", ancho: 140, alineacion: "right" },
      { titulo: "DESCONTADO", ancho: 141, alineacion: "right" },
    ],
    liquidacion.deducciones.map((deduccion) => [
      `${deduccion.transaccion.comentario || `Adelanto #${deduccion.transaccion.id}`}\nTransacción #${
        deduccion.transaccion.id
      }`,
      fechaHora(deduccion.transaccion.fecha_transaccion),
      monto(Math.abs(Number(deduccion.transaccion.monto))),
      monto(deduccion.monto_descontado),
    ])
  );

  if (doc.y > doc.page.height - 86) doc.addPage();
  const desglose = calcularDesgloseLiquidacion(liquidacion);
  doc
    .roundedRect(doc.page.width - MARGEN - 330, doc.y, 330, 56, 5)
    .fillAndStroke(COLOR_CABECERA, COLOR_BORDE);
  doc
    .fillColor(COLOR_SECUNDARIO)
    .font("Helvetica")
    .fontSize(8)
    .text(
      `${monto(liquidacion.monto_bruto)} - ${monto(desglose.comisiones)} - ${monto(
        desglose.gastos
      )} - ${monto(desglose.adelantos)}`,
      doc.page.width - MARGEN - 318,
      doc.y + 10,
      { width: 306, align: "right" }
    );
  doc
    .fillColor(COLOR_PRIMARIO)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(`Neto a pagar: ${monto(liquidacion.monto_neto)}`, {
      width: 306,
      align: "right",
    });

  agregarPieDePagina(doc);
  doc.end();
  return terminado;
}
