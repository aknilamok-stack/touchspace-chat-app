ALTER TABLE `TicketRequestEvent`
  ADD COLUMN `resolvedAt` DATETIME(3) NULL;

CREATE INDEX `TicketRequestEvent_resolvedAt_idx`
  ON `TicketRequestEvent`(`resolvedAt`);

UPDATE `TicketRequestEvent` event
JOIN `Ticket` ticket ON ticket.`id` = event.`ticketId`
SET event.`resolvedAt` = ticket.`resolvedAt`
WHERE event.`resolvedAt` IS NULL
  AND ticket.`resolvedAt` IS NOT NULL
  AND ticket.`resolvedAt` >= event.`createdAt`
  AND (
    event.`createdAt` >= '2026-07-30 11:18:00'
    OR (event.`sequence` = 1 AND ticket.`requestCount` = 1)
  );
