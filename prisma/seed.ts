import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ContratosService } from "@/services/contratos.service";
import { PagosService } from "@/services/pagos.service";
import { GastosService } from "@/services/gastos.service";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { calcularVencimientoPeriodo } from "@/lib/fecha";
import { requireSeedPassword } from "@/lib/seed-password";

async function main() {
  const passwordHash = await bcrypt.hash(requireSeedPassword(), 12);

  const admin = await prisma.usuario.upsert({
    where: { email: "admin@inmotrack.com" },
    update: {},
    create: { email: "admin@inmotrack.com", password_hash: passwordHash, rol: "ADMIN" },
  });
  await prisma.usuario.upsert({
    where: { email: "empleado1@inmotrack.com" },
    update: {},
    create: {
      email: "empleado1@inmotrack.com",
      password_hash: passwordHash,
      rol: "EMPLEADO",
      puede_aprobar_liquidaciones: true,
    },
  });
  await prisma.usuario.upsert({
    where: { email: "empleado2@inmotrack.com" },
    update: {},
    create: { email: "empleado2@inmotrack.com", password_hash: passwordHash, rol: "EMPLEADO" },
  });
  await prisma.usuario.upsert({
    where: { email: "auditor@inmotrack.com" },
    update: {},
    create: { email: "auditor@inmotrack.com", password_hash: passwordHash, rol: "AUDITOR" },
  });

  console.log("✅ Usuarios: admin / empleado1 / empleado2 / auditor @inmotrack.com — contraseña desde INMOTRACK_SEED_PASSWORD");

  const contratosExistentes = await prisma.contrato.count();
  if (contratosExistentes > 0) {
    console.log("ℹ️  Ya hay contratos cargados — se omite el resto del seed de datos de demo.");
    return;
  }

  const ownerA = await prisma.propietario.create({
    data: { nombre: "Propietario Demo A", cbu: "0000000000000000000000" },
  });
  const ownerB = await prisma.propietario.create({
    data: { nombre: "Propietario Demo B", cbu: "0000000000000000000000" },
  });
  const ownerAgency = await prisma.propietario.create({
    data: { nombre: "Inmobiliaria Demo", cbu: "0000000000000000000000" },
  });

  const propertyA = await prisma.propiedad.create({
    data: { id_propietario: ownerA.id, direccion: "Propiedad demo A - sin dirección real", es_propia: false },
  });
  const propertyB = await prisma.propiedad.create({
    data: { id_propietario: ownerA.id, direccion: "Propiedad demo B - sin dirección real", es_propia: false },
  });
  const propertyC = await prisma.propiedad.create({
    data: { id_propietario: ownerB.id, direccion: "Propiedad demo C - sin dirección real", es_propia: false },
  });
  const propertyD = await prisma.propiedad.create({
    data: { id_propietario: ownerAgency.id, direccion: "Propiedad demo D - sin dirección real", es_propia: true },
  });

  const tenantA = await prisma.inquilino.create({
    data: { nombre: "Inquilino Demo A", dni_cuit: "DEMO-DOC-A", email: "inquilino-a@example.invalid" },
  });
  const tenantB = await prisma.inquilino.create({
    data: { nombre: "Inquilino Demo B", dni_cuit: "DEMO-DOC-B", email: "inquilino-b@example.invalid" },
  });
  const tenantC = await prisma.inquilino.create({
    data: { nombre: "Inquilino Demo C", dni_cuit: "DEMO-DOC-C", email: "inquilino-c@example.invalid" },
  });
  const tenantD = await prisma.inquilino.create({
    data: { nombre: "Inquilino Demo D", dni_cuit: "DEMO-DOC-D", email: "inquilino-d@example.invalid" },
  });

  // Contrato 1: BORRADOR
  await ContratosService.crear({
    id_propiedad: propertyA.id,
    id_inquilino: tenantA.id,
    fecha_inicio: "2026-09-01",
    fecha_fin: "2027-08-31",
    monto_base: 350000,
    pct_comision: 8,
    pct_punitorio_diario: 0.1,
  });

  // Contrato 2: ACTIVO — paga de más, el sobrante se arrastra a un período nuevo.
  const contrato2 = await ContratosService.crear({
    id_propiedad: propertyB.id,
    id_inquilino: tenantB.id,
    fecha_inicio: "2026-08-01", // activar() genera el período a partir de esta fecha
    fecha_fin: "2028-07-31",
    monto_base: 420000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato2.id, admin.id);
  await PagosService.registrar({
    id_contrato: contrato2.id,
    monto_pagado: 470000, // 420.000 de alquiler + 50.000 de sobrante
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: admin.id,
  });
  await ContratosService.avanzarPeriodo(contrato2.id, "2026-09", calcularVencimientoPeriodo(2026, 9), admin.id);

  // Contrato 3: MOROSO — deuda de agosto sin pagar, sigue viva en su Cargo.
  const contrato3 = await ContratosService.crear({
    id_propiedad: propertyC.id,
    id_inquilino: tenantC.id,
    fecha_inicio: "2026-08-01", // activar() genera el período a partir de esta fecha
    fecha_fin: "2028-07-31",
    monto_base: 380000,
    pct_comision: 8,
    pct_punitorio_diario: 0.15,
  });
  await ContratosService.activar(contrato3.id, admin.id);
  const periodoAgosto = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato3.id } });
  await prisma.periodoPago.update({
    where: { id: periodoAgosto!.id },
    // Coherente con el nombre del período ("2026-08"): vence dentro del
    // mismo mes que devenga, no antes. Sigue quedando vencido respecto a
    // "hoy" para simular la mora real de este contrato.
    data: { fecha_vencimiento: new Date("2026-08-10") },
  });
  await ContratosService.avanzarPeriodo(contrato3.id, "2026-09", calcularVencimientoPeriodo(2026, 9), admin.id);
  await prisma.contrato.update({ where: { id: contrato3.id }, data: { estado: "MOROSO" } });

  // Contrato 4: ACTIVO, propiedad propia — pct_comision 100 para ver INGRESO_ALQUILER_PROPIO.
  const contrato4 = await ContratosService.crear({
    id_propiedad: propertyD.id,
    id_inquilino: tenantD.id,
    fecha_inicio: "2026-08-01", // activar() genera el período a partir de esta fecha
    fecha_fin: "2027-07-31",
    monto_base: 300000,
    pct_comision: 100,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato4.id, admin.id);
  await PagosService.registrar({
    id_contrato: contrato4.id,
    monto_pagado: 300000,
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: admin.id,
  });

  console.log("✅ Contratos: 1 BORRADOR, 1 ACTIVO con crédito arrastrado, 1 MOROSO, 1 ACTIVO (propiedad propia)");

  await GastosService.crear({
    id_propiedad: propertyA.id,
    concepto: "Reparación de cañería",
    monto: 45000,
    tipo: "ARREGLO",
    cargo_a: "PROPIETARIO",
    fecha_gasto: new Date().toISOString().slice(0, 10),
  });

  const gastoExpensas = await GastosService.crear({
    id_propiedad: propertyB.id,
    id_contrato: contrato2.id,
    concepto: "Expensas septiembre 2026",
    monto: 32000,
    tipo: "EXPENSA",
    cargo_a: "PROPIETARIO",
    fecha_gasto: new Date().toISOString().slice(0, 10),
  });
  await GastosService.marcarPagado(gastoExpensas.id, admin.id);

  await GastosService.crear({
    concepto: "Sueldos administrativos",
    categoria_interno: "Sueldos",
    monto: 850000,
    tipo: "OTRO",
    cargo_a: "INMOBILIARIA",
    fecha_gasto: new Date().toISOString().slice(0, 10),
  });

  console.log("✅ Gastos: 1 pendiente (propietario), 1 pagado (propietario), 1 propio de la inmobiliaria");

  const liquidacion = await LiquidacionesService.generarParaPropietario(ownerA.id, new Date());
  await LiquidacionesService.aprobar(liquidacion.id, admin.id);

  console.log("✅ Liquidación generada y aprobada para Propietario Demo A");
  console.log("\n🌱 Seed de demo completo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
