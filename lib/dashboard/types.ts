/** Public, serializable contracts shared by dashboard services and UI. */

export type DashboardTab = "operativo" | "financiero";
export type DashboardPortfolio = "todas" | "propias" | "terceros";

export type DashboardFilters = {
  tab: DashboardTab;
  periodo: string;
  propiedadId: number | null;
  cartera: DashboardPortfolio;
  periodoInicio: Date;
  periodoFinExclusivo: Date;
};

export type DashboardSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type DashboardPropertyOption = {
  id: number;
  direccion: string;
  esPropia: boolean;
};

export type DashboardAlertKind =
  | "contrato-por-vencer"
  | "deuda-vencida"
  | "gasto-pendiente"
  | "liquidacion-pendiente";

export type DashboardAlert = {
  kind: DashboardAlertKind;
  id: number;
  title: string;
  description?: string;
  amount?: string;
  href: string;
  contractId?: number;
  tenantName?: string;
  propertyAddress?: string;
  dueDate?: Date;
};

export type OperationalDashboardData = {
  generatedAt: Date;
  metrics: {
    contratosVigentes: number;
    contratosPorVencer: number;
    cuotasVencidas: number;
    montoVencido: string;
    gastosPendientes: { cantidad: number; monto: string };
    liquidacionesPendientes: { cantidad: number; monto: string };
  };
  alerts: DashboardAlert[];
};

export type FinancialDashboardData = {
  generatedAt: Date;
  periodo: string;
  metrics: {
    cobrado: string;
    ingresosInmobiliaria: string;
    gastosOperativosPagados: string;
    resultadoOperativo: string;
    pendienteLiquidar: string;
    deudaVencida: string;
  };
  monthlyCashFlow: Array<{
    periodo: string;
    ingresos: string;
    egresos: string;
  }>;
  collectionsByPortfolio: Array<{
    cartera: "propias" | "terceros";
    monto: string;
  }>;
  collectionsByProperty: Array<{
    propiedadId: number;
    direccion: string;
    monto: string;
  }>;
  expensesByCategory: Array<{ categoria: string; monto: string }>;
  unattributedExcluded: boolean;
};

export type DashboardTransactionRow = {
  tipo: string;
  caja: "TERCEROS" | "OPERATIVA";
  monto: string;
  originType: string | null;
};

export type FinancialTotals = {
  cobrado: string;
  ingresosInmobiliaria: string;
  gastosOperativos: string;
  resultadoOperativo: string;
};

export type ChartPoint = {
  label: string;
  valueA: string;
  valueB: string;
};

export type ChartBar = {
  label: string;
  value: string;
  ratio: number;
};
