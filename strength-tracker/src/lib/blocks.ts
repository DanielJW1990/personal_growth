import type { TemplateExercise } from '../db/types';

/**
 * One screen of the log flow: either a single exercise, or the two-plus
 * exercises of a superset that are alternated set by set.
 */
export interface WorkoutBlock {
  key: string;
  supersetGroup: string | null;
  entries: TemplateExercise[];
}

/**
 * Consecutive entries sharing a superset group become one block. A group that
 * reappears later in the plan starts a new block, so the order the user wrote
 * the template in is always respected.
 */
export function buildBlocks(plan: TemplateExercise[]): WorkoutBlock[] {
  const blocks: WorkoutBlock[] = [];

  for (const entry of plan) {
    const previous = blocks[blocks.length - 1];
    if (
      entry.supersetGroup !== null &&
      previous &&
      previous.supersetGroup === entry.supersetGroup
    ) {
      previous.entries.push(entry);
      continue;
    }
    blocks.push({
      key: `${blocks.length}_${entry.exerciseId}`,
      supersetGroup: entry.supersetGroup,
      entries: [entry],
    });
  }

  return blocks;
}

export function isSuperset(block: WorkoutBlock): boolean {
  return block.supersetGroup !== null && block.entries.length > 1;
}
