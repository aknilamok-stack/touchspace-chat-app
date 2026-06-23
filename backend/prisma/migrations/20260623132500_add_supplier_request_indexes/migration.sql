CREATE INDEX `SupplierRequest_ticket_createdAt_idx` ON `SupplierRequest`(`ticketId`, `createdAt`);
CREATE INDEX `SupplierRequest_supplier_status_createdAt_idx` ON `SupplierRequest`(`supplierId`, `status`, `createdAt`);
CREATE INDEX `SupplierRequest_name_status_createdAt_idx` ON `SupplierRequest`(`supplierName`, `status`, `createdAt`);
CREATE INDEX `SupplierRequest_assigned_status_claim_idx` ON `SupplierRequest`(`assignedSupplierProfileId`, `status`, `claimRequiredAt`);
CREATE INDEX `SupplierRequest_manager_createdAt_idx` ON `SupplierRequest`(`createdByManagerId`, `createdAt`);
CREATE INDEX `SupplierRequest_missed_required_idx` ON `SupplierRequest`(`claimMissedAt`, `claimRequiredAt`);
