SET @index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ClientVisualIdentity'
    AND INDEX_NAME = 'ClientVisualIdentity_avatarColor_avatarEmoji_key'
);

SET @drop_index_sql := IF(
  @index_exists > 0,
  'ALTER TABLE `ClientVisualIdentity` DROP INDEX `ClientVisualIdentity_avatarColor_avatarEmoji_key`',
  'SELECT 1'
);

PREPARE drop_index_statement FROM @drop_index_sql;
EXECUTE drop_index_statement;
DEALLOCATE PREPARE drop_index_statement;
