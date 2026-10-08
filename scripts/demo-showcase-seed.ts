/**
 * Genera DEMO50 SOLO en una base Supabase aislada y vacía.
 * Nunca tocar el proyecto principal de InmoTrack.
 */
import { prisma } from "@/lib/db";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { DEMO_PREFIX, DEMO_OWNER_COUNT, buildDemoPlans, plannedMonths, monthId,
  demoPaymentRate, referenceMonth, demoInventory } from "@/lib/demo-showcase";

const PRIMARY_REF = "zuxjyxmmdyftboscmgex";
const reference = referenceMonth();
const plans = buildDemoPlans();

function verifyIsolatedTarget() {
  if (process.env.INMOTRACK_DEMO_ALLOW_ISOLATED !== "CONFIRMO_BASE_AISLADA") {
    throw new Error("Prohibido insertar demo sin confirmación explícita de base aislada.");
  }
  if (process.env.VERCEL_ENV === "production") throw new Error("Prohibido en producción.");
  const ref = process.env.INMOTRACK_DEMO_PROJECT_REF ?? "";
  if (!/^[a-z0-9]{20}$/.test(ref) || ref === PRIMARY_REF) {
    throw new Error("INMOTRACK_DEMO_PROJECT_REF debe identificar una rama Supabase distinta de producción.");
  }
  const db = process.env.DATABASE_URL ?? "";
  const direct = process.env.DIRECT_URL ?? db;
  for (const uri of [db, direct]) {
    const url = new URL(uri);
    const connectionIdentity = url.hostname + "/" + decodeURIComponent(url.username);
    if (connectionIdentity.includes(PRIMARY_REF) || !connectionIdentity.includes(ref)) {
      throw new Error("Conexión rechazada: el destino no es el proyecto demo Supabase indicado.");
    }
  }
}

function ownerName(i: number) { return DEMO_PREFIX + " Propietario " + String(i + 1).padStart(2, "0"); }
function tenantName(i: number) { return DEMO_PREFIX + " Inquilino " + String(i + 1).padStart(2, "0"); }
function address(i: number) { return DEMO_PREFIX + " " + ["San Martín","Bv. 25 de Mayo","Iturraspe","9 de Julio","Libertad","Belgrano","Rivadavia","Mitre"][i%8] + " " + (100 + i * 32) + ", Córdoba"; }
function docNumber(i: number) { return "DEMO50-" + String(i + 1).padStart(4, "0"); }
function dateOnly(m: Date, day=1) { return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), day)); }

async function main() {
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify({ demo: demoInventory(), ejemplo: plans.slice(0, 3).map(p=>({estado:p.state,alquiler:p.monthlyRent})) }, null, 2));
    return;
  }
  verifyIsolatedTarget();
  const admin = await prisma.usuario.findFirst({ where: { rol: "ADMIN" }, select: { id: true } });
  if (!admin) throw new Error("La base demo debe contar con un usuario ADMIN válido antes de insertar.");
  const preflight = await Promise.all([
    prisma.contrato.count(), prisma.propiedad.count(), prisma.propietario.count(),
    prisma.inquilino.count(), prisma.periodoPago.count(), prisma.cargo.count(),
    prisma.liquidacion.count(), prisma.transaccion.count(),
  ]);
  if (preflight.some(n=>n>0)) {
    throw new Error("Abortado: la base contiene datos de negocio. Usar una base demo nueva y vacía.");
  }

  await prisma.$transaction(async (tx) => {
    const owners = await tx.propietario.createManyAndReturn({
      data: Array.from({length: DEMO_OWNER_COUNT}, (_,i)=>({
        nombre: ownerName(i), cbu: String(1000000000000000+i).padStart(22,"0"),
      })),
    });
    const ownerByName = new Map(owners.map(x=>[x.nombre,x.id]));
    const ownerId = (i:number) => {
      const id=ownerByName.get(ownerName(i)); if(!id)throw new Error("Propietario no creado");
      return id;
    };

    const tenants = await tx.inquilino.createManyAndReturn({
      data: plans.map(p=>({
        nombre: tenantName(p.index), dni_cuit: docNumber(p.index),
        email: "demo50-inquilino-" + (p.index+1) + "@example.invalid",
        telefono: "351" + String(3000000+p.index).padStart(7,"0"),
      })),
    });
    const tenantMap = new Map(tenants.map(t=>[t.dni_cuit,t.id]));

    const properties = await tx.propiedad.createManyAndReturn({
      data: plans.map(p=>({
        id_propietario: ownerId(p.ownerIndex), direccion: address(p.index), es_propia: p.ownProperty,
      })),
    });
    const propertyMap = new Map(properties.map(p=>[p.direccion,p.id]));
    const propertyId = (i:number) => {
      const id=propertyMap.get(address(i));if(!id)throw new Error("Propiedad sin ID");
      return id;
    };
    await tx.propiedadPropietario.createMany({
      data: plans.flatMap(p => {
        const first={ id_propiedad: propertyId(p.index), id_propietario: ownerId(p.ownerIndex), porcentaje:p.ownerPct };
        return p.secondaryOwnerIndex===null
          ? [first] : [first, { id_propiedad: propertyId(p.index), id_propietario: ownerId(p.secondaryOwnerIndex), porcentaje:100-p.ownerPct }];
      }),
    });
    const contracts = await tx.contrato.createManyAndReturn({
      data: plans.map(p=>({
        id_propiedad: propertyId(p.index),
        id_inquilino: tenantMap.get(docNumber(p.index))!,
        fecha_inicio:p.started,
        fecha_fin:p.finished,
        estado:p.state,
        monto_base:p.monthlyRent,
        pct_comision:p.commissionPct,
        pct_punitorio_diario:0.1,
        indice_act:p.index%3===0 ? "ICL" as const : p.index%3===1 ? "IPC" as const : "ACUERDO" as const,
        meses_act: p.index%2===0 ? 3 : 6,
        cobra_confeccion:p.index%3===0,
        estrategia_confeccion: p.index%3===0 ? "UN_ALQUILER" as const : null,
      })),
    });
    const contractMap = new Map(contracts.map(c=>[c.id_propiedad,c.id]));
    const contractId=(i:number)=>{const id=contractMap.get(propertyId(i));if(!id)throw Error("Contrato sin ID");return id;};

    const specs = plans.flatMap(p=>plannedMonths(p,reference).map((m,index)=>({plan:p,month:m,index})));
    const periods=await tx.periodoPago.createManyAndReturn({data:specs.map(s=>({
      id_contrato:contractId(s.plan.index),
      periodo:monthId(s.month),
      fecha_vencimiento:dateOnly(s.month,10),
      estado_ciclo:s.month>reference?"FUTURO" as const:s.month<reference?"CERRADO" as const:"ABIERTO" as const,
    }))});
    const periodMap=new Map(periods.map(p=>[String(p.id_contrato)+":"+p.periodo,p.id]));
    const getPeriod=(i:number,m:Date)=>{
      const id=periodMap.get(String(contractId(i))+":"+monthId(m));if(!id)throw Error("Periodo sin ID");return id;
    };

    const chargeInputs=specs.flatMap(s=>{
      const rent=s.plan.monthlyRent + Math.floor(s.index/6)*Math.round(s.plan.monthlyRent*0.07);
      const id_periodo=getPeriod(s.plan.index,s.month);
      const base={id_periodo,id_contrato:contractId(s.plan.index),creado_en:dateOnly(s.month,1)};
      const rows:{id_periodo:number;id_contrato:number;creado_en:Date;tipo:"ALQUILER"|"CONFECCION_CONTRATO"|"AJUSTE";monto:number;descripcion:string}[]=[
        {...base,tipo:"ALQUILER",monto:rent,descripcion:DEMO_PREFIX+" Alquiler "+monthId(s.month)},
      ];
      if(s.index===0&&s.plan.index%3===0)rows.push({...base,tipo:"CONFECCION_CONTRATO",monto:Math.round(rent*0.5),descripcion:DEMO_PREFIX+" Confección contrato"});
      if(s.index>0&&s.index%6===0&&s.plan.index%3===1)rows.push({...base,tipo:"AJUSTE",monto:Math.round(rent*0.04),descripcion:DEMO_PREFIX+" Diferencia por ajuste"});
      return rows;
    });
    const charges=await tx.cargo.createManyAndReturn({data:chargeInputs});
    const rentalMap=new Map(charges.filter(c=>c.tipo==="ALQUILER").map(c=>[c.id_periodo,c]));

    const expenses=await tx.gasto.createManyAndReturn({data:Array.from({length:140},(_,i)=>{
      const p=plans[i%plans.length];
      const kind=i%7===0?"INMOBILIARIA" as const:i%4===0?"INQUILINO" as const:"PROPIETARIO" as const;
      return {
        id_propiedad:kind==="INMOBILIARIA"?null:propertyId(p.index),
        id_contrato:kind==="INQUILINO"?contractId(p.index):null,
        concepto:DEMO_PREFIX+" "+["Arreglo de cañerías","Expensas comunes","Mantenimiento de ascensor","Servicio eléctrico",
          "Pintura","Plomería","Honorarios y limpieza","Impuesto municipal"][i%8]+" #"+(i+1),
        categoria_interno:kind==="INMOBILIARIA"?"Administración":null,
        monto:7500+(i*7357)%120000,
        tipo:(["ARREGLO","EXPENSA","GAS","LUZ","IMPUESTO","OTRO"] as const)[i%6],
        cargo_a:kind,
        estado_pago:i%3===0?"PAGADO_PROVEEDOR" as const:"PENDIENTE" as const,
        creado_en:dateOnly(reference,1),
      };
    })});
    const tenantExpenses=expenses.filter(g=>g.cargo_a==="INQUILINO"&&g.id_contrato!=null);
    await tx.cargo.createMany({data:tenantExpenses.flatMap(g=>{
      const p=periods.find(p=>p.id_contrato===g.id_contrato&&p.periodo===monthId(reference));
      return p?[{id_periodo:p.id,id_contrato:g.id_contrato!,tipo:"GASTO" as const,monto:g.monto,
          id_gasto:g.id,descripcion:g.concepto,creado_en:dateOnly(reference,1)}]:[];
    })});
    await tx.gastoPropietario.createMany({data:expenses.filter(g=>g.cargo_a==="PROPIETARIO"&&g.id_propiedad!=null).flatMap(g=>{
      const plan=plans.find(p=>propertyId(p.index)===g.id_propiedad)!;
      const ownerParts=[{id:ownerId(plan.ownerIndex),pct:plan.ownerPct}];
      if(plan.secondaryOwnerIndex!==null)ownerParts.push({id:ownerId(plan.secondaryOwnerIndex),pct:100-plan.ownerPct});
      return ownerParts.map(x=>({id_gasto:g.id,id_propietario:x.id,porcentaje_participacion:x.pct,
        monto_asignado:Number(g.monto)*x.pct/100}));
    })});

    const payments=specs.flatMap(s=>{
      const rental=rentalMap.get(getPeriod(s.plan.index,s.month))!;
      const due=dateOnly(s.month,10);
      const rate=demoPaymentRate(s.plan,s.index,due,reference);
      const amount=Math.round(Number(rental.monto)*rate);
      if(amount<=0)return [];
      const pdate=new Date(Date.UTC(s.month.getUTCFullYear(),s.month.getUTCMonth(),Math.min(12,10+s.index%3)));
      return [{key:String(s.plan.index)+":"+monthId(s.month),plan:s.plan,rental,amount,pdate}];
    });
    const incoming=await tx.transaccion.createManyAndReturn({data:payments.map(p=>({
      tipo:"INGRESO_COBRO" as const,caja_destino:"TERCEROS" as const,monto:p.amount,
      fecha_transaccion:p.pdate,id_contrato:contractId(p.plan.index),id_usuario_creador:admin.id,
      comentario:DEMO_PREFIX+" PAGO "+p.key,
    }))});
    const txnMap=new Map(incoming.map(x=>[x.comentario!,x.id]));
    const applications=await tx.aplicacionPago.createManyAndReturn({data:payments.map(p=>({
      id_transaccion:txnMap.get(DEMO_PREFIX+" PAGO "+p.key)!, id_cargo:p.rental.id,monto_aplicado:p.amount,
    }))});
    const appMap=new Map(applications.map(a=>[a.id_transaccion,a.id]));
    await tx.aplicacionPagoPropietario.createMany({data:payments.flatMap(p=>{
      const parts=[{id:ownerId(p.plan.ownerIndex),pct:p.plan.ownerPct}];
      if(p.plan.secondaryOwnerIndex!==null)parts.push({id:ownerId(p.plan.secondaryOwnerIndex),pct:100-p.plan.ownerPct});
      const first=Math.round(p.amount*parts[0].pct)/100;
      return parts.map((owner,index)=>({
        id_aplicacion_pago:appMap.get(txnMap.get(DEMO_PREFIX+" PAGO "+p.key)!)!,
        id_propietario:owner.id,porcentaje_participacion:owner.pct,
        monto_asignado:index===0?first:p.amount-first,
      }));
    })});
    await tx.transaccion.createMany({data:payments.map(p=>({
      tipo:p.plan.ownProperty?"INGRESO_ALQUILER_PROPIO" as const:"INGRESO_COMISION" as const,
      caja_destino:"OPERATIVA" as const,
      monto:Math.round(p.amount*p.plan.commissionPct)/100,
      fecha_transaccion:p.pdate,id_contrato:contractId(p.plan.index),
      id_usuario_creador:admin.id,id_txn_origen:txnMap.get(DEMO_PREFIX+" PAGO "+p.key),
      comentario:DEMO_PREFIX+" COMISION "+p.key,
    }))});
    await tx.transaccion.createMany({data:owners.filter((_,i)=>i%3===0).map((o,i)=>({
      tipo:"EGRESO_ADELANTO" as const,caja_destino:"TERCEROS" as const,
      monto:-(25000+i*12000),id_propietario:o.id,id_usuario_creador:admin.id,
      fecha_transaccion:dateOnly(reference,1),comentario:DEMO_PREFIX+" Adelanto a propietario",
    }))});
    await tx.transaccion.createMany({data:expenses.filter(g=>g.estado_pago==="PAGADO_PROVEEDOR").map(g=>({
      tipo:g.cargo_a==="INMOBILIARIA"?"EGRESO_OPERATIVO" as const:"EGRESO_TERCEROS" as const,
      caja_destino:g.cargo_a==="INMOBILIARIA"?"OPERATIVA" as const:"TERCEROS" as const,
      monto:-Number(g.monto),id_contrato:g.id_contrato,id_usuario_creador:admin.id,
      fecha_transaccion:dateOnly(reference,1),comentario:DEMO_PREFIX+" Pago proveedor "+g.id,
    }))});
    console.log("Generados "+contracts.length+" contratos, "+periods.length+" períodos, "+charges.length+" cargos ALQUILER/otros, "+incoming.length+" pagos y "+expenses.length+" gastos.");
  }, {timeout:240000,maxWait:30000});

  const owners=await prisma.propietario.findMany({where:{nombre:{startsWith:DEMO_PREFIX}},select:{id:true},take:18,orderBy:{id:"asc"}});
  let liquidations=0;
  for(const owner of owners) {
    try{
      await LiquidacionesService.generarParaPropietario(owner.id,new Date("2026-10-07T23:59:00Z"));
      liquidations++;
    }catch(error){
      // The generator is optional showcase data: avoid claiming successful liquidations when absent.
      console.warn("Liquidación omitida para propietario demo",owner.id,error instanceof Error?error.message:"Error desconocido");
    }
  }
  console.log("Liquidaciones generadas: "+liquidations);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
