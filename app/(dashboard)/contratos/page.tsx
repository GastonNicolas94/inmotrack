import { PropiedadesService } from "@/services/propiedades.service";
import { InquilinosService } from "@/services/inquilinos.service";
import { TablaContratos } from "@/components/features/contratos/TablaContratos";
import { WizardContrato } from "@/components/features/contratos/WizardContrato";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function ContratosPage() {
  const [propiedades, inquilinos] = await Promise.all([
    PropiedadesService.listarDisponibles(),
    InquilinosService.listar(),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Gestión de contratos"
        title="Contratos"
        description="Alta, vigencia y estado de cada contrato de alquiler."
        action={
          <WizardContrato
            propiedades={propiedades.map((p) => ({
              id: p.id,
              direccion: p.direccion,
              propietario: { nombre: p.propietario.nombre },
            }))}
            inquilinos={inquilinos.map((i) => ({ id: i.id, nombre: i.nombre }))}
          />
        }
      />
      <TablaContratos />
    </div>
  );
}
