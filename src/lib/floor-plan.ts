// Validation for floor-plan images uploaded for a unit type.

export const FLOOR_PLAN_LIMITS = { maxBytes: 5 * 1024 * 1024 }
export const FLOOR_PLAN_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'

export class FloorPlanError extends Error {}

const SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'png', mime: 'image/png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
]

/** Accept PNG / JPG / WebP up to 5 MB, judged by the file's real contents rather than its name. `label` names it in the messages (a floor plan, a letterhead). */
export function validateFloorPlan(buffer: Buffer, label = 'Floor plan'): { ext: string; mime: string } {
  if (buffer.length === 0) throw new FloorPlanError(`The ${label.toLowerCase()} file is empty`)
  if (buffer.length > FLOOR_PLAN_LIMITS.maxBytes) {
    throw new FloorPlanError(`${label} is too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB`)
  }
  const sig = SIGNATURES.find((s) => s.test(buffer))
  if (!sig) throw new FloorPlanError(`${label} must be a PNG, JPG or WebP image`)
  return { ext: sig.ext, mime: sig.mime }
}
