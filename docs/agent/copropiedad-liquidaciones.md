# Copropiedad y liquidaciones proporcionales

## Regla de dominio

Una propiedad puede tener uno o más propietarios. Cada participación expresa el porcentaje actual de titularidad y la suma debe ser exactamente 100%.

No se mantiene historial de cambios de titularidad. Al editar una propiedad, las participaciones actuales se reemplazan.

## Liquidaciones

El flujo de liquidación conserva el comportamiento existente y agrega distribución proporcional:

- cobros de alquiler, comisión y gastos de la propiedad se distribuyen según la participación vigente cuando la fuente es tomada por primera vez para liquidar;
- esa distribución se guarda como snapshot por propietario;
- cambiar porcentajes después no modifica fuentes ya snapshotteadas ni liquidaciones generadas;
- adelantos y otros conceptos personales siguen perteneciendo únicamente al propietario correspondiente;
- cada propietario recibe una liquidación consolidada con sus propiedades;
- el detalle y el PDF muestran sólo los importes del propietario de la liquidación y el porcentaje aplicado;
- el redondeo se realiza a centavos con distribución determinística del resto, garantizando que la suma de asignaciones coincida con el importe original.

## Compatibilidad transitoria

La migración introduce `propiedades_propietarios`, `aplicaciones_pago_propietarios` y `gastos_propietarios` de forma aditiva.

`propiedades.id_propietario`, `aplicaciones_pago.id_liquidacion_item` y `gastos.id_liquidacion_item` se mantienen temporalmente para compatibilidad con datos y consumidores legacy. Para fuentes con un único propietario se siguen completando los vínculos legacy; una fuente compartida se vincula exclusivamente mediante sus asignaciones por propietario.

La eliminación de los campos legacy debe hacerse en una migración posterior, una vez verificado en producción que no existen consumidores dependientes.

## Dashboard

Las métricas de liquidaciones no requieren una segunda distribución: los importes persistidos en `liquidaciones` y `liquidaciones_items` ya son individuales por propietario. Los filtros por propiedad continúan agregando esos importes proporcionales.
