export const DOMAIN_EVENTS = {
  CONTRACT_CREATED: "contract.created",
  CONTRACT_ACTIVATED: "contract.activated",
  CONTRACT_CANCELLED: "contract.cancelled",
  CONTRACT_ACTIVATION_FAILED: "contract.activation_failed",
  PAYMENT_CREATED: "payment.created",
  PAYMENT_REVERSED: "payment.reversed",
  PAYMENT_FAILED: "payment.failed",
  SETTLEMENT_GENERATED: "settlement.generated",
  SETTLEMENT_CANCELLED: "settlement.cancelled",
  SETTLEMENT_FAILED: "settlement.failed",
  EXPENSE_CREATED: "expense.created",
  EXPENSE_UPDATED: "expense.updated",
  EXPENSE_DELETED: "expense.deleted",
} as const;

export type DomainEvent = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
