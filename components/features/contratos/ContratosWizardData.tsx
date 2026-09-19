import { InquilinosService } from "@/services/inquilinos.service";
import { PropiedadesService } from "@/services/propiedades.service";
import { WizardContrato } from "@/components/features/contratos/WizardContrato";

export async function ContratosWizardData() {
  const [propiedades, inquilinos] = await Promise.all([
    PropiedadesService.listarDisponibles(),
    InquilinosService.listar(),
  ]);

  return (
    <WizardContrato
      propiedades={propiedades.map((p) => ({
        id: p.id,
        direccion: p.direccion,
        propietario: {
          nombre: p.copropietarios
            .map((participacion) =>
              `${participacion.propietario.nombre} (${Number(participacion.porcentaje).toFixed(2)}%)`,
            )
            .join(" · "),
        },
      }))}
      inquilinos={inquilinos.map((i) => ({ id: i.id, nombre: i.nombre }))}
    />
  );
}
