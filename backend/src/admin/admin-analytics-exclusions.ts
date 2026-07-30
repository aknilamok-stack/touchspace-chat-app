const analyticsManagerIds = new Set([
  'manual_1781790161531',
  'manual_1781788292393',
  'manual_1781777826812',
]);

const excludedClientIds = new Set(['2198']);

const excludedSupplierProfileIds = new Set([
  'manual_1782212848989',
  'manual_1782910623077',
  'manual_1782910662716',
  'supplier_scope_полы',
  'supplier_scope_тест',
  'healthcheck',
]);

const excludedSupplierNames = new Set(['полы', 'тест', 'тест мира']);

const normalizeAnalyticsName = (value?: string | null) =>
  value?.trim().toLocaleLowerCase('ru-RU') || '';

export const analyticsIncludedManagerIds = [...analyticsManagerIds];

export const isIncludedAnalyticsManager = (id?: string | null) =>
  Boolean(id?.trim() && analyticsManagerIds.has(id.trim()));

export const isExcludedAnalyticsTicket = (ticket: {
  clientId?: string | null;
  clientName?: string | null;
  tradePointName?: string | null;
  assignedManagerId?: string | null;
  lastResolvedByManagerId?: string | null;
}) => {
  const clientId = ticket.clientId?.trim();
  const clientName = normalizeAnalyticsName(ticket.clientName);
  const tradePointName = normalizeAnalyticsName(ticket.tradePointName);
  const assignedManagerId = ticket.assignedManagerId?.trim();
  const lastResolvedByManagerId = ticket.lastResolvedByManagerId?.trim();

  return (
    (clientId ? excludedClientIds.has(clientId) : false) ||
    clientName.includes('лапик') ||
    tradePointName.includes('лапик') ||
    (assignedManagerId ? !analyticsManagerIds.has(assignedManagerId) : false) ||
    (lastResolvedByManagerId
      ? !analyticsManagerIds.has(lastResolvedByManagerId)
      : false)
  );
};

export const isExcludedAnalyticsSupplier = (supplier: {
  id?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  fullName?: string | null;
  companyName?: string | null;
}) => {
  const ids = [supplier.id, supplier.supplierId]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const names = [supplier.supplierName, supplier.fullName, supplier.companyName]
    .map(normalizeAnalyticsName)
    .filter(Boolean);

  return (
    ids.some((id) => excludedSupplierProfileIds.has(id)) ||
    names.some((name) => excludedSupplierNames.has(name))
  );
};

export const resolveAnalyticsWaitingParty = (
  ticket: {
    status: string;
    lastClientMessageAt?: Date | null;
    lastManagerReplyAt?: Date | null;
  },
  hasActiveSupplierRequest: boolean,
): 'manager' | 'supplier' | 'client' | null => {
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return null;
  }

  if (hasActiveSupplierRequest) {
    return 'supplier';
  }

  if (!ticket.lastClientMessageAt) {
    return null;
  }

  if (
    !ticket.lastManagerReplyAt ||
    ticket.lastClientMessageAt > ticket.lastManagerReplyAt
  ) {
    return 'manager';
  }

  return 'client';
};
