/** A project's construction milestones as its pages show them. */

/**
 * Where construction has reached: the completed milestone furthest along the plan (by its sequence), or null before any is
 * completed. Shown on the project list and the project page in place of the project's status.
 */
export function lastCompletedMilestone<T extends { status: string; sequence: number }>(milestones: T[]): T | null {
  return milestones.filter((m) => m.status === 'COMPLETED').reduce<T | null>((last, m) => (!last || m.sequence > last.sequence ? m : last), null)
}

/** The badge text for a project's progress: "Plinth completed", or "No milestone completed yet". */
export const progressLabel = (milestone: { name: string } | null) => (milestone ? `${milestone.name} completed` : 'No milestone completed yet')
