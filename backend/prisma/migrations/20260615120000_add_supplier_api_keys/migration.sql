CREATE TABLE `SupplierApiKey` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `supplierScopeId` VARCHAR(191) NOT NULL,
  `supplierCompanyName` VARCHAR(191) NOT NULL,
  `keyHash` VARCHAR(191) NOT NULL,
  `keyPreview` VARCHAR(191) NOT NULL,
  `permissions` JSON NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `lastUsedAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdByAdminId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `SupplierApiKey_keyHash_key`(`keyHash`),
  INDEX `SupplierApiKey_supplierScopeId_isActive_idx`(`supplierScopeId`, `isActive`),
  INDEX `SupplierApiKey_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
