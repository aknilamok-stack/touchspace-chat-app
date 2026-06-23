CREATE INDEX `Ticket_mode_manager_lastMessage_idx`
ON `Ticket`(`conversationMode`, `assignedManagerId`, `lastMessageAt`);

CREATE INDEX `Ticket_mode_supplier_lastMessage_idx`
ON `Ticket`(`conversationMode`, `supplierId`, `lastMessageAt`);

CREATE INDEX `Ticket_status_manager_lastMessage_idx`
ON `Ticket`(`status`, `assignedManagerId`, `lastMessageAt`);

CREATE INDEX `Ticket_client_mode_lastMessage_idx`
ON `Ticket`(`clientId`, `conversationMode`, `lastMessageAt`);

CREATE INDEX `Message_ticket_createdAt_idx`
ON `Message`(`ticketId`, `createdAt`);

CREATE INDEX `Message_ticket_sender_status_createdAt_idx`
ON `Message`(`ticketId`, `senderType`, `status`, `createdAt`);
