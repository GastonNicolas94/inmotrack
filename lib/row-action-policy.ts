/** UI visibility only. Backend authorization remains authoritative. */
export function contractRowActionPolicy(estado: string, canWrite: boolean, hasContext: boolean) {
  const payable = ["ACTIVO", "MOROSO", "POR_VENCER", "VENCIDO"].includes(estado);
  return {
    activate: canWrite && estado === "BORRADOR",
    registerPayment: canWrite && payable && hasContext,
    showPeriods: true,
    showAdjustments: true,
    calculateInterest: canWrite && payable && hasContext,
    registerExpense: canWrite && payable && hasContext,
  };
}
export function liquidationRowActionPolicy(estado: string, canApprove: boolean, isAdmin: boolean) {
  return {
    showDetail: true,
    approve: estado === "PENDIENTE" && canApprove,
    confirmPayment: estado === "APROBADA" && isAdmin,
  };
}
