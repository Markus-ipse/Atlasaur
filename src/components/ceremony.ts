import type { Milestone } from "../game/milestones";
import { streakNote } from "../game/milestones";

// The one line of ceremony an answer earns, or null: a continent finished
// supersedes a country crossing into known, and either supersedes a streak
// note. Shared with the phone's strip, which says it in place of the prompt
// through the correct flash (#61).
export function ceremonyOf(
  milestone: Milestone | null,
  streak: number,
  onMap: boolean,
): { text: string; className: string } | null {
  const sealed = milestone?.continentComplete ?? null;
  if (sealed) return { text: `${sealed} complete.`, className: "text-wax-red" };
  if (milestone)
    return {
      text: onMap
        ? `${milestone.name}, now on your map.`
        : `${milestone.name} is known now.`,
      className: "text-ochre",
    };
  const note = streakNote(streak);
  return note ? { text: note, className: "text-ink-mid" } : null;
}
