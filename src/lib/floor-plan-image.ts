import fs from 'fs'
import path from 'path'
import { readStoredFile } from '@/lib/storage/files'

const MIME_BY_EXT: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

/**
 * The floor plan to print on a quote, as a data URI. Uses the unit type's own uploaded plan when it has one,
 * otherwise falls back to the generic 1/2/3 BHK picture bundled with the app. Returns '' if neither can be read.
 */
export async function floorPlanDataUri(unit: { configuration: string; unitType?: { floorPlanUrl: string | null } | null }): Promise<string> {
  try {
    const url = unit.unitType?.floorPlanUrl
    if (url) {
      const buffer = await readStoredFile(url)
      const mime = MIME_BY_EXT[path.extname(url).toLowerCase()] ?? 'image/png'
      return `data:${mime};base64,${buffer.toString('base64')}`
    }
  } catch (e) {
    console.warn('Could not load the unit type floor plan, using the generic one:', e)
  }
  try {
    const fileName = unit.configuration.startsWith('3') ? 'floorplan-3bhk.png' : unit.configuration.startsWith('2') ? 'floorplan-2bhk.png' : 'floorplan-1bhk.png'
    return `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), 'public', fileName)).toString('base64')}`
  } catch (e) {
    console.warn('Could not load floor plan for PDF:', e)
    return ''
  }
}
