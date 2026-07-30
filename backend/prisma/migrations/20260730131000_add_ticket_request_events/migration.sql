CREATE TABLE `TicketRequestEvent` (
  `id` VARCHAR(191) NOT NULL,
  `ticketId` VARCHAR(191) NOT NULL,
  `sequence` INTEGER NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `TicketRequestEvent_ticketId_sequence_key`(`ticketId`, `sequence`),
  INDEX `TicketRequestEvent_createdAt_idx`(`createdAt`),
  INDEX `TicketRequestEvent_ticketId_createdAt_idx`(`ticketId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TicketRequestEvent`
  ADD CONSTRAINT `TicketRequestEvent_ticketId_fkey`
  FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `TicketRequestEvent` (`id`, `ticketId`, `sequence`, `eventType`, `createdAt`)
SELECT UUID(), `ticketId`, 1, 'initial', MIN(`createdAt`)
FROM `Message`
WHERE `senderType` = 'client'
GROUP BY `ticketId`;
