CREATE TABLE `DesktopAppUpdate` (
  `id` VARCHAR(191) NOT NULL DEFAULT 'desktop',
  `latestVersion` VARCHAR(191) NOT NULL,
  `macUrl` VARCHAR(191) NOT NULL,
  `windowsUrl` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `message` LONGTEXT NOT NULL,
  `releaseNotes` LONGTEXT NULL,
  `required` BOOLEAN NOT NULL DEFAULT false,
  `notificationToken` VARCHAR(191) NOT NULL,
  `createdByAdminId` VARCHAR(191) NULL,
  `notifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
