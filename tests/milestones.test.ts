import { describe, it, expect } from 'vitest'
import { lastCompletedMilestone, progressLabel } from '@/lib/milestones'
import { showsProjectType } from '@/lib/status'

describe('project progress badge', () => {
  const m = (name: string, sequence: number, status = 'COMPLETED') => ({ name, sequence, status })
  it('is the completed milestone furthest along the plan, whatever order they come in', () => {
    const last = lastCompletedMilestone([m('Slab 2', 4), m('Plinth', 1), m('Slab 3', 5, 'UPCOMING'), m('Slab 1', 3)])
    expect(last?.name).toBe('Slab 2')
    expect(progressLabel(last)).toBe('Slab 2 completed')
  })
  it('says so before any milestone is completed', () => {
    expect(lastCompletedMilestone([m('Plinth', 1, 'UPCOMING')])).toBeNull()
    expect(progressLabel(null)).toBe('No milestone completed yet')
  })
  it('hides only the Mixed type', () => {
    expect([showsProjectType('MIXED'), showsProjectType('FRESH'), showsProjectType('REDEVELOPMENT')]).toEqual([false, true, true])
  })
})
