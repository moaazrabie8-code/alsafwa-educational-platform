-- Merge subjects that were previously duplicated per academic stage.
-- The smallest id is retained so all existing group, exam, and course links survive.
UPDATE `teaching_groups` AS `target`
INNER JOIN `subjects` AS `duplicate` ON `duplicate`.`id` = `target`.`subjectId`
INNER JOIN (
  SELECT `name`, MIN(`id`) AS `canonicalId`
  FROM `subjects`
  GROUP BY `name`
  HAVING COUNT(*) > 1
) AS `canonical` ON `canonical`.`name` = `duplicate`.`name`
SET `target`.`subjectId` = `canonical`.`canonicalId`
WHERE `target`.`subjectId` <> `canonical`.`canonicalId`;--> statement-breakpoint

UPDATE `exams` AS `target`
INNER JOIN `subjects` AS `duplicate` ON `duplicate`.`id` = `target`.`subjectId`
INNER JOIN (
  SELECT `name`, MIN(`id`) AS `canonicalId`
  FROM `subjects`
  GROUP BY `name`
  HAVING COUNT(*) > 1
) AS `canonical` ON `canonical`.`name` = `duplicate`.`name`
SET `target`.`subjectId` = `canonical`.`canonicalId`
WHERE `target`.`subjectId` <> `canonical`.`canonicalId`;--> statement-breakpoint

UPDATE `courses` AS `target`
INNER JOIN `subjects` AS `duplicate` ON `duplicate`.`id` = `target`.`subjectId`
INNER JOIN (
  SELECT `name`, MIN(`id`) AS `canonicalId`
  FROM `subjects`
  GROUP BY `name`
  HAVING COUNT(*) > 1
) AS `canonical` ON `canonical`.`name` = `duplicate`.`name`
SET `target`.`subjectId` = `canonical`.`canonicalId`
WHERE `target`.`subjectId` <> `canonical`.`canonicalId`;--> statement-breakpoint

UPDATE `subjects` AS `canonical`
INNER JOIN (
  SELECT
    `name`,
    MIN(`id`) AS `canonicalId`,
    MAX(`code`) AS `retainedCode`,
    MAX(`description`) AS `retainedDescription`,
    MAX(`scheduleText`) AS `retainedScheduleText`
  FROM `subjects`
  GROUP BY `name`
  HAVING COUNT(*) > 1
) AS `merged` ON `merged`.`canonicalId` = `canonical`.`id`
SET
  `canonical`.`code` = COALESCE(`canonical`.`code`, `merged`.`retainedCode`),
  `canonical`.`description` = COALESCE(`canonical`.`description`, `merged`.`retainedDescription`),
  `canonical`.`scheduleText` = COALESCE(`canonical`.`scheduleText`, `merged`.`retainedScheduleText`);--> statement-breakpoint

DELETE `duplicate`
FROM `subjects` AS `duplicate`
INNER JOIN (
  SELECT `name`, MIN(`id`) AS `canonicalId`
  FROM `subjects`
  GROUP BY `name`
  HAVING COUNT(*) > 1
) AS `canonical` ON `canonical`.`name` = `duplicate`.`name`
WHERE `duplicate`.`id` <> `canonical`.`canonicalId`;--> statement-breakpoint

ALTER TABLE `subjects` DROP INDEX `subjects_stage_name_unique`;--> statement-breakpoint
DROP INDEX `subjects_stage_idx` ON `subjects`;--> statement-breakpoint
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_name_unique` UNIQUE(`name`);--> statement-breakpoint
ALTER TABLE `subjects` DROP COLUMN `academicStageId`;
