import { prisma } from "@/lib/db";
import { AppClock } from "@/lib/app-clock";
import type { DashboardFilters } from "@/lib/dashboard/types";
import { createDashboardService } from "@/services/dashboard.service";

async function serviceAtCurrentClock() {
  const now = await AppClock.now();
  return createDashboardService({ prisma, now: () => now });
}

export const DashboardClockService = {
  async getOperationalData(filters: DashboardFilters) {
    return (await serviceAtCurrentClock()).getOperationalData(filters);
  },
  async getFinancialData(filters: DashboardFilters) {
    return (await serviceAtCurrentClock()).getFinancialData(filters);
  },
  async listPropertyOptions() {
    return (await serviceAtCurrentClock()).listPropertyOptions();
  },
};
