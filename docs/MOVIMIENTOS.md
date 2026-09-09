# Movimientos Contables — InmoTrack

Cómo cada tipo de transacción afecta a los actores del sistema y a las cajas.

---

## Los actores

| Actor | Qué tiene en el sistema |
|---|---|
| **Inquilino** | Deuda: alquiler + gastos a su cargo + punitorios |
| **Propietario** | Crédito: lo que le corresponde cobrar según lo cobrado al inquilino |
| **Inmobiliaria** | Ganancia: comisiones y retornos de propiedades propias |
| **CAJA 1** (Terceros) | Dinero que NO es de la inmobiliaria — lo retiene transitoriamente |
| **CAJA 2** (Operativa) | Dinero propio de la inmobiliaria — sus ganancias |

**Regla de oro:** la inmobiliaria nunca gana dinero de CAJA 1 directamente. CAJA 1 recauda, retiene y distribuye. CAJA 2 es la ganancia.

---

## Cada tipo de movimiento

---

### 1. `INGRESO_COBRO`
**Cuándo ocurre:** el inquilino paga (total o parcialmente).

| Actor / Caja | Efecto |
|---|---|
| CAJA 1 | **+monto** — entra el pago bruto del inquilino |
| CAJA 2 | Sin efecto directo |
| Inquilino | **−deuda** — se reduce su deuda de alquiler y/o gastos |
| Propietario | Sin efecto inmediato (se verá reflejado al liquidar) |
| Inmobiliaria | Sin efecto en este momento |

> El `INGRESO_COBRO` es siempre por el monto total recibido. La distribución de ese dinero ocurre en los movimientos siguientes.

---

### 2. `TRANSFERENCIA_INTERNA`
**Cuándo ocurre:** inmediatamente después de un `INGRESO_COBRO`, de forma automática.

**Caso A — Propiedad administrada (es_propia = false):**
La comisión de la inmobiliaria sale de CAJA 1 y entra a CAJA 2.

| Actor / Caja | Efecto |
|---|---|
| CAJA 1 | **−comisión** (sale la parte de la inmobiliaria) |
| CAJA 2 | **+comisión** (entra la ganancia de la inmobiliaria) |
| Inquilino | Sin efecto adicional |
| Propietario | Su liquidación futura será monto cobrado **menos** esta comisión |
| Inmobiliaria | **+ganancia** (pct_comision % del cobro) |

**Caso B — Propiedad propia (es_propia = true):**
El 100% del cobro pasa a CAJA 2 — la inmobiliaria es el propietario.

| Actor / Caja | Efecto |
|---|---|
| CAJA 1 | **−total cobrado** |
| CAJA 2 | **+total cobrado** |
| Propietario | No aplica (la inmobiliaria ES el propietario) |
| Inmobiliaria | **+ganancia** (100% del alquiler) |

---

### 3. `EGRESO_LIQUIDACION`
**Cuándo ocurre:** cuando se aprueba una liquidación — la inmobiliaria le transfiere al propietario.

| Actor / Caja | Efecto |
|---|---|
| CAJA 1 | **−monto neto** (sale el dinero hacia el banco del propietario) |
| CAJA 2 | Sin efecto |
| Inquilino | Sin efecto |
| Propietario | **+cobro** (recibe el monto neto en su CBU) |
| Inmobiliaria | Sin efecto (ya ganó en la TRANSFERENCIA_INTERNA) |

> El monto neto = cobrado bruto − comisión − gastos cargo propietario.

---

### 4. `EGRESO_TERCEROS`
**Cuándo ocurre:** la inmobiliaria le paga a un proveedor (plomero, electricista, consorcio).

| Actor / Caja | Efecto |
|---|---|
| CAJA 1 | **−monto** (sale para pagar al proveedor) |
| CAJA 2 | Sin efecto |
| Inquilino | Sin efecto en este momento (su `monto_cobrado_inquilino` ya fue actualizado al pagar) |
| Propietario | Si `cargo_a = PROPIETARIO`: este gasto **se descuenta** de su próxima liquidación |
| Inmobiliaria | Sin efecto (es un egreso que corresponde a terceros) |

**Dos casos según quién pagó el gasto:**

| cargo_a | ¿Quién financia? | ¿Afecta liquidación propietario? |
|---|---|---|
| `PROPIETARIO` | El propietario (vía descuento en liquidación) | Sí, se descuenta |
| `INQUILINO` | El inquilino (cobrado vía prelación de pagos) | No |

---

### 5. `INGRESO_GARANTIA`
**Cuándo ocurre:** al firmar el contrato — el inquilino entrega el depósito.

| Actor / Caja | Efecto |
|---|---|
| CAJA 1 | **+depósito** (entra pero es un pasivo — deuda hacia el inquilino) |
| CAJA 2 | Sin efecto |
| Inquilino | Sin efecto en deuda (el depósito no es un pago, es una garantía) |
| Propietario | Sin efecto |
| Inmobiliaria | Sin efecto (**nunca** se calcula comisión sobre este ingreso) |

---

### 6. `EGRESO_GARANTIA`
**Cuándo ocurre:** al finalizar el contrato — se devuelve el depósito al inquilino.

| Actor / Caja | Efecto |
|---|---|
| CAJA 1 | **−depósito** (sale hacia el inquilino, total o parcial) |
| CAJA 2 | Sin efecto |
| Inquilino | Recupera su garantía |
| Propietario | Sin efecto |
| Inmobiliaria | Sin efecto (no es ingreso) |

> Si hay daños, solo se devuelve `monto_original − monto_retenido_danos`.

---

### 7. `PUNITORIO_DIARIO`
**Cuándo ocurre:** el cron diario detecta períodos vencidos sin cobro total.

**Positivo** (generado por el cron):

| Actor / Caja | Efecto |
|---|---|
| CAJA 1 | Sin movimiento real — es un devengamiento contable |
| CAJA 2 | Sin efecto |
| Inquilino | **+deuda** (se acumula interés moratorio) |
| Propietario | Sin efecto |
| Inmobiliaria | Potencial ganancia futura cuando el inquilino pague |

**Negativo** (crédito al pagar — prelación Paso 1):

| Actor / Caja | Efecto |
|---|---|
| CAJA 1 | Sin movimiento real (el ingreso ya se registró en INGRESO_COBRO) |
| Inquilino | **−deuda punitoria** (se cancela el interés acumulado) |

> Los punitorios los cobra la inmobiliaria, no el propietario. Van implícitamente a CAJA 2 cuando se cobran (parte del `INGRESO_COBRO` que cubre punitorios no genera liquidación al propietario).

---

### 8. `CONTRA_ASIENTO`
**Cuándo ocurre:** el Admin anula una transacción errónea.

| Actor / Caja | Efecto |
|---|---|
| Misma caja que la txn original | **monto invertido** — neutraliza el movimiento original |
| Todos los actores | Vuelve al estado anterior a la transacción errada |

> El libro diario es inmutable — el contra-asiento NO borra la entrada original, la neutraliza con una entrada opuesta.

---

## Flujo completo de un mes (resumen visual)

```
Día 1 del mes
  └─ Cron genera CARGO_PENDIENTE → inquilino debe el alquiler

Inquilino paga $300.000
  ├─ INGRESO_COBRO +300.000 → CAJA 1
  ├─ [Prelación 1] PUNITORIO_DIARIO -punitorios si los hubiera
  ├─ [Prelación 2] periodos_pago.monto_cobrado += lo que corresponda
  ├─ [Prelación 3] gastos.monto_cobrado_inquilino += lo que sobre
  └─ TRANSFERENCIA_INTERNA +comisión → CAJA 2 (ganancia inmobiliaria)

Inmobiliaria paga plomero $50.000 (cargo_a=PROPIETARIO)
  └─ EGRESO_TERCEROS -50.000 → CAJA 1

Fin de mes: inmobiliaria genera liquidación al propietario
  Neto = cobrado_bruto - comisión - gastos_propietario
  └─ EGRESO_LIQUIDACION -neto → CAJA 1 (el propietario lo cobra en su banco)

Balance final CAJA 1: debe ser ~0 por contrato
Balance final CAJA 2: comisiones del mes = ganancia de la inmobiliaria
```

---

## Quién financia qué (tabla síntesis)

| Concepto | Lo paga | Sale de | Afecta liquidación propietario |
|---|---|---|---|
| Alquiler | Inquilino | CAJA 1 → propietario | Sí (es el monto bruto) |
| Comisión | Propietario (implícito) | CAJA 1 → CAJA 2 | Sí (se descuenta) |
| Arreglo `cargo_a=PROPIETARIO` | Propietario | CAJA 1 → proveedor | Sí (se descuenta) |
| Arreglo `cargo_a=INQUILINO` | Inquilino | CAJA 1 → proveedor | No |
| Expensas / Gas / Luz `cargo_a=INQUILINO` | Inquilino | CAJA 1 → proveedor | No |
| Depósito en garantía | Inquilino (devuelto al final) | CAJA 1 (retenido) | No |
| Punitorios | Inquilino | CAJA 1 → CAJA 2 | No (es ganancia de la inmobiliaria) |
| Gastos propios de la inmobiliaria | Inmobiliaria | CAJA 2 | No (son externos al sistema) |
