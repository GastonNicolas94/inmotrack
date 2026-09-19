import PDFDocument from "pdfkit";
import type { LiquidacionDetalle } from "@/services/liquidaciones.service";
import { etiquetaTipoCargo } from "@/lib/cargos";
import { formatFechaLocal } from "@/lib/fecha";
import {
  calcularDesgloseLiquidacion,
  calcularPorcentajeComision,
} from "@/lib/liquidacion-detalle";

const MARGEN = 42;
const AZUL = "#173B70";
const AZUL_CLARO = "#EAF0F8";
const TINTA = "#172033";
const GRIS = "#667085";
const BORDE = "#CBD5E1";
const FONDO = "#F7F8FA";

export const IDENTIDAD_INMOBILIARIA = {
  nombre: "Macchieraldo Villarruel",
  descripcion: "Estudio Contable & Inmobiliaria",
} as const;

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

type SeccionPdf = "ALQUILERES" | "GASTOS" | "ADELANTOS";
type Alineacion = "left" | "center" | "right";

interface LiquidacionParaSecciones {
  items: Array<{ id_periodo: number | null; gastos_item: unknown[] }>;
  deducciones: unknown[];
}

interface Columna {
  titulo: string;
  ancho: number;
  alineacion?: Alineacion;
}

export function obtenerSeccionesPdf(liquidacion: LiquidacionParaSecciones): SeccionPdf[] {
  const secciones: SeccionPdf[] = [];
  if (liquidacion.items.some((item) => item.id_periodo !== null)) secciones.push("ALQUILERES");
  if (liquidacion.items.some((item) => item.gastos_item.length > 0)) secciones.push("GASTOS");
  if (liquidacion.deducciones.length > 0) secciones.push("ADELANTOS");
  return secciones;
}

function monto(valor: { toString(): string } | number | string) {
  return FORMATO_MONTO.format(Number(valor.toString()));
}

function fechaHora(valor: Date | string) {
  return FORMATO_FECHA_HORA.format(new Date(valor));
}

function textoEstado(estado: string) {
  return estado.replaceAll("_", " ");
}

function agregarMembrete(doc: PDFKit.PDFDocument, liquidacion: LiquidacionDetalle) {
  const ancho = doc.page.width;
  doc.rect(0, 0, ancho, 8).fill(AZUL);
  doc.rect(MARGEN, 30, 42, 42).fill(AZUL);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("MV", MARGEN, 42, { width: 42, align: "center" });

  doc
    .fillColor(AZUL)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(IDENTIDAD_INMOBILIARIA.nombre, 96, 32);
  doc
    .fillColor(GRIS)
    .font("Helvetica")
    .fontSize(8)
    .text(IDENTIDAD_INMOBILIARIA.descripcion.toUpperCase(), 96, 55, {
      characterSpacing: 0.6,
    });

  doc
    .fillColor(GRIS)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("LIQUIDACIÓN DE PROPIETARIO", 330, 33, {
      width: ancho - MARGEN - 330,
      align: "right",
    });
  doc
    .fillColor(TINTA)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(`N° ${String(liquidacion.id).padStart(6, "0")}`, 330, 49, {
      width: ancho - MARGEN - 330,
      align: "right",
    });

  doc.moveTo(MARGEN, 88).lineTo(ancho - MARGEN, 88).strokeColor(AZUL).lineWidth(1).stroke();

  doc.fillColor(GRIS).font("Helvetica-Bold").fontSize(7).text("PROPIETARIO", MARGEN, 105);
  doc
    .fillColor(TINTA)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(liquidacion.propietario.nombre, MARGEN, 119, { width: 235 });

  doc.fillColor(GRIS).font("Helvetica-Bold").fontSize(7).text("PERÍODO LIQUIDADO", 315, 105);
  doc
    .fillColor(TINTA)
    .font("Helvetica")
    .fontSize(9)
    .text(
      `${formatFechaLocal(liquidacion.fecha_desde)} al ${formatFechaLocal(liquidacion.fecha_hasta)}`,
      315,
      119,
      { width: 135 }
    );

  doc.fillColor(GRIS).font("Helvetica-Bold").fontSize(7).text("FECHA DE EMISIÓN", 465, 105);
  doc
    .fillColor(TINTA)
    .font("Helvetica")
    .fontSize(9)
    .text(formatFechaLocal(liquidacion.fecha_corrida), 465, 119, {
      width: ancho - MARGEN - 465,
      align: "right",
    });

  doc.moveTo(MARGEN, 145).lineTo(ancho - MARGEN, 145).strokeColor(BORDE).lineWidth(0.6).stroke();
  doc.y = 164;
}

function agregarEncabezadoContinuacion(doc: PDFKit.PDFDocument, liquidacion: LiquidacionDetalle) {
  doc.rect(0, 0, doc.page.width, 6).fill(AZUL);
  doc
    .fillColor(AZUL)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(IDENTIDAD_INMOBILIARIA.nombre, MARGEN, 25);
  doc
    .fillColor(GRIS)
    .font("Helvetica")
    .fontSize(8)
    .text(
      `Liquidación N° ${String(liquidacion.id).padStart(6, "0")} - ${liquidacion.propietario.nombre}`,
      220,
      25,
      { width: doc.page.width - MARGEN - 220, align: "right" }
    );
  doc.moveTo(MARGEN, 44).lineTo(doc.page.width - MARGEN, 44).strokeColor(BORDE).stroke();
  doc.y = 58;
}

function agregarResumen(
  doc: PDFKit.PDFDocument,
  liquidacion: LiquidacionDetalle,
  secciones: SeccionPdf[]
) {
  const desglose = calcularDesgloseLiquidacion(liquidacion);
  const filas: Array<{ concepto: string; valor: string; deduccion?: boolean }> = [];
  if (secciones.includes("ALQUILERES")) {
    filas.push({ concepto: "Alquileres cobrados", valor: monto(liquidacion.monto_bruto) });
    filas.push({ concepto: "Comisión de administración", valor: monto(desglose.comisiones), deduccion: true });
  }
  if (secciones.includes("GASTOS")) {
    filas.push({ concepto: "Gastos descontados", valor: monto(desglose.gastos), deduccion: true });
  }
  if (secciones.includes("ADELANTOS")) {
    filas.push({ concepto: "Adelantos descontados", valor: monto(desglose.adelantos), deduccion: true });
  }

  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(9).text("RESUMEN DE LIQUIDACIÓN", MARGEN, doc.y, {
    characterSpacing: 0.6,
  });
  doc.y += 15;
  const inicio = doc.y;
  const altoFila = 22;

  filas.forEach((fila, indice) => {
    const y = inicio + indice * altoFila;
    doc.rect(MARGEN, y, doc.page.width - MARGEN * 2, altoFila).fill(indice % 2 ? FONDO : "#FFFFFF");
    doc
      .fillColor(TINTA)
      .font("Helvetica")
      .fontSize(9)
      .text(fila.deduccion ? `(-) ${fila.concepto}` : fila.concepto, MARGEN + 10, y + 7);
    doc
      .fillColor(TINTA)
      .font("Helvetica")
      .fontSize(9)
      .text(fila.valor, 390, y + 7, {
        width: doc.page.width - MARGEN - 400,
        align: "right",
      });
  });

  const yTotal = inicio + filas.length * altoFila;
  doc.rect(MARGEN, yTotal, doc.page.width - MARGEN * 2, 31).fill(AZUL_CLARO);
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(10).text("NETO A PAGAR", MARGEN + 10, yTotal + 10);
  doc
    .fillColor(AZUL)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(monto(liquidacion.monto_neto), 370, yTotal + 8, {
      width: doc.page.width - MARGEN - 380,
      align: "right",
    });
  doc
    .rect(MARGEN, inicio, doc.page.width - MARGEN * 2, filas.length * altoFila + 31)
    .strokeColor(BORDE)
    .lineWidth(0.6)
    .stroke();
  doc.y = yTotal + 52;
}

function agregarTituloSeccion(doc: PDFKit.PDFDocument, titulo: string) {
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(11).text(titulo.toUpperCase(), MARGEN, doc.y, {
    characterSpacing: 0.5,
  });
  doc.moveTo(MARGEN, doc.y + 4).lineTo(doc.page.width - MARGEN, doc.y + 4).strokeColor(BORDE).stroke();
  doc.y += 13;
}

function dibujarCabeceraTabla(doc: PDFKit.PDFDocument, columnas: Columna[], y: number) {
  let x = MARGEN;
  for (const columna of columnas) {
    doc.rect(x, y, columna.ancho, 22).fillAndStroke(AZUL, AZUL);
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(6.5)
      .text(columna.titulo, x + 4, y + 7, {
        width: columna.ancho - 8,
        align: columna.alineacion ?? "left",
      });
    x += columna.ancho;
  }
  return y + 22;
}

function agregarTabla(
  doc: PDFKit.PDFDocument,
  liquidacion: LiquidacionDetalle,
  columnas: Columna[],
  filas: string[][]
) {
  let y = dibujarCabeceraTabla(doc, columnas, doc.y);
  const limite = () => doc.page.height - MARGEN - 28;

  for (let indiceFila = 0; indiceFila < filas.length; indiceFila += 1) {
    const fila = filas[indiceFila];
    doc.font("Helvetica").fontSize(6.7);
    const alto = Math.max(
      23,
      ...columnas.map((columna, indice) =>
        doc.heightOfString(fila[indice] ?? "", { width: columna.ancho - 8 }) + 10
      )
    );
    if (y + alto > limite()) {
      doc.addPage();
      agregarEncabezadoContinuacion(doc, liquidacion);
      y = dibujarCabeceraTabla(doc, columnas, doc.y);
    }

    let x = MARGEN;
    columnas.forEach((columna, indice) => {
      doc.rect(x, y, columna.ancho, alto).fillAndStroke(indiceFila % 2 ? FONDO : "#FFFFFF", BORDE);
      doc
        .fillColor(TINTA)
        .font("Helvetica")
        .fontSize(6.7)
        .text(fila[indice] ?? "", x + 4, y + 5, {
          width: columna.ancho - 8,
          height: alto - 10,
          align: columna.alineacion ?? "left",
          ellipsis: true,
        });
      x += columna.ancho;
    });
    y += alto;
  }
  doc.y = y + 25;
}

function asegurarEspacio(doc: PDFKit.PDFDocument, liquidacion: LiquidacionDetalle, alto: number) {
  if (doc.y + alto <= doc.page.height - MARGEN - 28) return;
  doc.addPage();
  agregarEncabezadoContinuacion(doc, liquidacion);
}

function agregarPieDePagina(doc: PDFKit.PDFDocument) {
  const rango = doc.bufferedPageRange();
  for (let indice = 0; indice < rango.count; indice += 1) {
    doc.switchToPage(rango.start + indice);
    doc
      .fillColor(GRIS)
      .font("Helvetica")
      .fontSize(7)
      .text("Documento emitido electrónicamente", MARGEN, doc.page.height - MARGEN - 10, {
        width: 220,
        lineBreak: false,
      });
    doc
      .fillColor(GRIS)
      .font("Helvetica")
      .fontSize(7)
      .text(`Página ${indice + 1} de ${rango.count}`, doc.page.width - MARGEN - 120, doc.page.height - MARGEN - 10, {
        width: 120,
        align: "right",
        lineBreak: false,
      });
  }
}

export async function generarPdfLiquidacion(liquidacion: LiquidacionDetalle): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margins: { top: MARGEN, right: MARGEN, bottom: MARGEN, left: MARGEN },
    bufferPages: true,
    compress: false,
    info: {
      Title: `Liquidación N° ${liquidacion.id} - ${liquidacion.propietario.nombre}`,
      Author: IDENTIDAD_INMOBILIARIA.nombre,
      Subject: "Liquidación de propietario",
    },
  });
  const fragmentos: Buffer[] = [];
  const terminado = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (fragmento) => fragmentos.push(Buffer.from(fragmento)));
    doc.on("end", () => resolve(Buffer.concat(fragmentos)));
    doc.on("error", reject);
  });

  const secciones = obtenerSeccionesPdf(liquidacion);
  agregarMembrete(doc, liquidacion);
  agregarResumen(doc, liquidacion, secciones);

  if (secciones.includes("ALQUILERES")) {
    asegurarEspacio(doc, liquidacion, 80);
    agregarTituloSeccion(doc, "Detalle de alquileres cobrados");
    const items = liquidacion.items.filter((item) => item.id_periodo !== null);
    agregarTabla(
      doc,
      liquidacion,
      [
        { titulo: "PROPIEDAD / INQUILINO", ancho: 105 },
        { titulo: "PERÍODO", ancho: 47 },
        { titulo: "CARGO Y COBRO", ancho: 176 },
        { titulo: "BRUTO", ancho: 60, alineacion: "right" },
        { titulo: "COMISIÓN", ancho: 61, alineacion: "right" },
        { titulo: "NETO", ancho: 62, alineacion: "right" },
      ],
      items.flatMap((item) => {
        const aplicaciones = item.aplicaciones.length > 0 ? item.aplicaciones : [null];
        return aplicaciones.map((aplicacion, indice) => [
          indice === 0
            ? `${item.propiedad.direccion}\n${item.periodo?.contrato.inquilino.nombre ?? "-"}\nParticipación: ${Number(
                item.porcentaje_participacion
              ).toFixed(2)}%`
            : "",
          indice === 0 ? item.periodo?.periodo ?? "-" : "",
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
  }

  if (secciones.includes("GASTOS")) {
    asegurarEspacio(doc, liquidacion, 80);
    agregarTituloSeccion(doc, "Detalle de gastos descontados");
    const gastos = liquidacion.items.flatMap((item) =>
      item.gastos_item.map((gasto) => ({
        gasto,
        propiedad: item.propiedad,
        porcentajeParticipacion: item.porcentaje_participacion,
      }))
    );
    agregarTabla(
      doc,
      liquidacion,
      [
        { titulo: "PROPIEDAD", ancho: 105 },
        { titulo: "CONCEPTO", ancho: 196 },
        { titulo: "FECHA", ancho: 75 },
        { titulo: "ESTADO", ancho: 73, alineacion: "center" },
        { titulo: "MONTO", ancho: 62, alineacion: "right" },
      ],
      gastos.map(({ gasto, propiedad, porcentajeParticipacion }) => [
        `${propiedad.direccion}\nParticipación: ${Number(porcentajeParticipacion).toFixed(2)}%`,
        `Gasto #${gasto.id} - ${gasto.concepto}\n${textoEstado(gasto.tipo)}${
          gasto.categoria_interno ? ` · ${gasto.categoria_interno}` : ""
        }`,
        fechaHora(gasto.creado_en),
        textoEstado(gasto.estado_pago),
        monto(gasto.monto),
      ])
    );
  }

  if (secciones.includes("ADELANTOS")) {
    asegurarEspacio(doc, liquidacion, 80);
    agregarTituloSeccion(doc, "Detalle de adelantos descontados");
    agregarTabla(
      doc,
      liquidacion,
      [
        { titulo: "CONCEPTO", ancho: 220 },
        { titulo: "FECHA", ancho: 95 },
        { titulo: "MONTO ORIGINAL", ancho: 98, alineacion: "right" },
        { titulo: "DESCONTADO", ancho: 98, alineacion: "right" },
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
  }

  asegurarEspacio(doc, liquidacion, 58);
  doc.moveTo(300, doc.y).lineTo(doc.page.width - MARGEN, doc.y).strokeColor(AZUL).lineWidth(1).stroke();
  doc
    .fillColor(GRIS)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("IMPORTE NETO DE LA LIQUIDACIÓN", 300, doc.y + 12, {
      width: doc.page.width - MARGEN - 300,
      align: "right",
    });
  doc
    .fillColor(AZUL)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(monto(liquidacion.monto_neto), 300, doc.y + 5, {
      width: doc.page.width - MARGEN - 300,
      align: "right",
    });

  agregarPieDePagina(doc);
  doc.end();
  return terminado;
}
