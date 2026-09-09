import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ContratosService } from "@/services/contratos.service";
import { PagosService } from "@/services/pagos.service";
import { GastosService } from "@/services/gastos.service";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { calcularVencimientoPeriodo } from "@/lib/fecha";

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 12);

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

  console.log("✅ Usuarios: admin / empleado1 / empleado2 / auditor @inmotrack.com — contraseña admin123");

  const contratosExistentes = await prisma.contrato.count();
  if (contratosExistentes > 0) {
    console.log("ℹ️  Ya hay contratos cargados — se omite el resto del seed de datos de demo.");
    return;
  }

  const carlos = await prisma.propietario.create({
    data: { nombre: "Carlos Méndez", cbu: "0170099220000012345678" },
  });
  const laura = await prisma.propietario.create({
    data: { nombre: "Laura Giménez", cbu: "0720123188000098765432" },
  });
  const inmobiliaria = await prisma.propietario.create({
    data: { nombre: "InmoTrack Inmobiliaria", cbu: "0000003100000011112222" },
  });

  const propA = await prisma.propiedad.create({
    data: { id_propietario: carlos.id, direccion: "Av. Corrientes 1234, 4°A, CABA", es_propia: false },
  });
  const propB = await prisma.propiedad.create({
    data: { id_propietario: carlos.id, direccion: "Av. Santa Fe 4567, 2°B, CABA", es_propia: false },
  });
  const propC = await prisma.propiedad.create({
    data: { id_propietario: laura.id, direccion: "Av. Rivadavia 8900, PB, CABA", es_propia: false },
  });
  const propD = await prisma.propiedad.create({
    data: { id_propietario: inmobiliaria.id, direccion: "Defensa 350, 1°C, San Telmo, CABA", es_propia: true },
  });

  const juan = await prisma.inquilino.create({
    data: { nombre: "Juan Pérez", dni_cuit: "20-30111222-3", email: "juan.perez@example.com" },
  });
  const maria = await prisma.inquilino.create({
    data: { nombre: "María Rodríguez", dni_cuit: "27-28444555-9", email: "maria.rodriguez@example.com" },
  });
  const pedro = await prisma.inquilino.create({
    data: { nombre: "Pedro Sánchez", dni_cuit: "20-25666777-1", email: "pedro.sanchez@example.com" },
  });
  const ana = await prisma.inquilino.create({
    data: { nombre: "Ana López", dni_cuit: "27-31888999-4", email: "ana.lopez@example.com" },
  });

  // Contrato 1: BORRADOR
  await ContratosService.crear({
    id_propiedad: propA.id,
    id_inquilino: juan.id,
    fecha_inicio: "2026-09-01",
    fecha_fin: "2027-08-31",
    monto_base: 350000,
    pct_comision: 8,
    pct_punitorio_diario: 0.1,
  });

  // Contrato 2: ACTIVO — paga de más, el sobrante se arrastra a un período nuevo.
  const contrato2 = await ContratosService.crear({
    id_propiedad: propB.id,
    id_inquilino: maria.id,
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
    id_propiedad: propC.id,
    id_inquilino: pedro.id,
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
    id_propiedad: propD.id,
    id_inquilino: ana.id,
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
    id_propiedad: propA.id,
    concepto: "Reparación de cañería",
    monto: 45000,
    tipo: "ARREGLO",
    cargo_a: "PROPIETARIO",
    fecha_gasto: new Date().toISOString().slice(0, 10),
  });

  const gastoExpensas = await GastosService.crear({
    id_propiedad: propB.id,
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

  const liquidacion = await LiquidacionesService.generarParaPropietario(carlos.id, new Date());
  await LiquidacionesService.aprobar(liquidacion.id, admin.id);

  console.log("✅ Liquidación generada y aprobada para Carlos Méndez");
  console.log("\n🌱 Seed de demo completo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
