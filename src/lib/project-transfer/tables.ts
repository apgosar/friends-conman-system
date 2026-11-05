import { Prisma } from '@prisma/client'
import { z } from '@/lib/validate'
import { fail } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { keyFromFileUrl } from '@/lib/storage/files'

/**
 * What moves with a project, and in which order it is written (a table comes after the ones it points at).
 *
 * The columns of each table are NOT listed here: they come from the Prisma schema, so a column added later travels
 * without anyone remembering to add it. tests/project-transfer.test.ts fails when a table in the schema is in neither
 * TABLES nor LEFT_BEHIND, so a new table has to be decided on too.
 */
export interface TransferTable {
  /** Prisma model name */
  model: string
  /** The name of the model on the Prisma client, and its key in the file */
  delegate: string
  /** Which rows belong to one project */
  scope: (projectId: string) => Record<string, unknown>
  /** Columns holding the URL of a stored file (the file travels with the row) */
  files?: string[]
  /** Columns holding a user's id: matched to the person with the same e-mail on the other server */
  users?: string[]
  /** Columns encrypted at rest. In the file they are in the clear (the file is encrypted), and the other server encrypts them with its own key */
  pii?: string[]
}

const inSale = (projectId: string) => ({ sale: { projectId } })

export const TABLES: TransferTable[] = [
  { model: 'Project', delegate: 'project', scope: (id) => ({ id }) },
  { model: 'ParkingField', delegate: 'parkingField', scope: (projectId) => ({ projectId }) },
  { model: 'UnitType', delegate: 'unitType', scope: (projectId) => ({ projectId }), files: ['floorPlanUrl'] },
  { model: 'Wing', delegate: 'wing', scope: (projectId) => ({ projectId }) },
  { model: 'Floor', delegate: 'floor', scope: (projectId) => ({ wing: { projectId } }), files: ['floorPlanUrl'] },
  { model: 'Unit', delegate: 'unit', scope: (projectId) => ({ floor: { wing: { projectId } } }) },
  { model: 'ConstructionMilestone', delegate: 'constructionMilestone', scope: (projectId) => ({ projectId }), files: ['architectCertificateUrl'] },
  { model: 'PaymentPlan', delegate: 'paymentPlan', scope: (projectId) => ({ projectId }) },
  { model: 'PaymentPlanItem', delegate: 'paymentPlanItem', scope: (projectId) => ({ plan: { projectId } }) },
  { model: 'ProjectCharge', delegate: 'projectCharge', scope: (projectId) => ({ projectId }) },
  { model: 'Template', delegate: 'template', scope: (projectId) => ({ projectId }), files: ['fileUrl'] },
  { model: 'Tenant', delegate: 'tenant', scope: (projectId) => ({ projectId }) },
  { model: 'Inquiry', delegate: 'inquiry', scope: (projectId) => ({ unit: { floor: { wing: { projectId } } } }) },
  { model: 'Sale', delegate: 'sale', scope: (projectId) => ({ projectId }) },
  { model: 'ParkingSlot', delegate: 'parkingSlot', scope: (projectId) => ({ projectId }) },
  { model: 'Buyer', delegate: 'buyer', scope: (projectId) => inSale(projectId), pii: ['panNumber', 'aadhaarNumber'] },
  { model: 'KycDocument', delegate: 'kycDocument', scope: (projectId) => ({ buyer: inSale(projectId) }), files: ['fileUrl'] },
  { model: 'PaymentSchedule', delegate: 'paymentSchedule', scope: (projectId) => inSale(projectId), users: ['managementApprovedBy'] },
  { model: 'InterestAccrual', delegate: 'interestAccrual', scope: (projectId) => ({ schedule: inSale(projectId) }) },
  { model: 'InterestWaiver', delegate: 'interestWaiver', scope: (projectId) => ({ schedule: inSale(projectId) }), users: ['createdById'] },
  { model: 'Payment', delegate: 'payment', scope: (projectId) => inSale(projectId), files: ['receiptPdfUrl'] },
  { model: 'TdsRecord', delegate: 'tdsRecord', scope: (projectId) => ({ payment: inSale(projectId) }), files: ['certificateUrl'] },
  { model: 'Loan', delegate: 'loan', scope: (projectId) => inSale(projectId), files: ['sanctionLetterUrl'] },
  { model: 'LoanDisbursement', delegate: 'loanDisbursement', scope: (projectId) => ({ loan: inSale(projectId) }) },
  { model: 'Document', delegate: 'document', scope: (projectId) => inSale(projectId), files: ['pdfUrl'] },
]

/** Tables that are deliberately not in the file, and why. The company and its partners are carried separately (see COMPANY). */
export const LEFT_BEHIND: Record<string, string> = {
  Company: 'the project\'s company travels as a copy and is matched by name on the other server',
  Partner: 'travel with the company',
  User: 'people belong to a server; a name in a record is matched by e-mail',
  CommunicationLog: 'old messages stay on the old server, and a copied queued message would be sent again to the buyer',
  AuditLog: 'the history of the old server stays there; the import records its own entry',
  NumberSequence: 'counters belong to a server; they are moved past the imported numbers',
  RateLimitBucket: 'working data of a server',
}

/** Where the quotation PDF of an inquiry is stored (there is no column for it: the name is the inquiry's id). */
export const quoteKeyOf = (inquiryId: string) => `quotes/${inquiryId}.pdf`

/** The storage key of a file URL kept in the database, or null for anything that is not one of our stored files. */
export function storageKeyOf(url: string | null | undefined): string | null {
  if (!url) return null
  const key = url.startsWith('/uploads/') ? `uploads/${url.slice('/uploads/'.length).split('/').pop()}` : keyFromFileUrl(url)
  return key && isSafeKey(key) ? key : null
}

/** A key we are willing to write: plain folder/name parts only, so a changed file cannot write outside the storage area. */
export const isSafeKey = (key: string) => /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(key) && !key.split('/').some((part) => part === '.' || part === '..')

// ----- reading a row from the file: the schema decides the columns and their types -----

const model = (name: string) => {
  const found = Prisma.dmmf.datamodel.models.find((m) => m.name === name)
  if (!found) throw new Error(`Unknown model ${name}`)
  return found
}

/** The plain columns of a model (not its relations), straight from schema.prisma. */
export const columnsOf = (name: string) => model(name).fields.filter((f) => f.kind === 'scalar')

const DECIMAL = /^-?\d+(\.\d+)?$/
const typeOf = (field: { type: string; isList: boolean }): z.ZodType => {
  if (field.isList) return z.array(z.string())
  switch (field.type) {
    case 'String': return z.string()
    case 'Int': return z.number().int()
    case 'Float': return z.number()
    case 'Boolean': return z.boolean()
    case 'DateTime': return z.string().refine((s) => !Number.isNaN(Date.parse(s))).transform((s) => new Date(s))
    case 'Decimal': return z.union([z.number(), z.string().regex(DECIMAL)])
    case 'Json': return z.any().transform((v) => (v === null ? Prisma.DbNull : v))
    default: throw new Error(`Column type ${field.type} is not supported by the project transfer`)
  }
}

const schemas = new Map<string, z.ZodType<Record<string, unknown>>>()
/** A schema for one row of a model: every column checked, converted (dates, Json) and anything else in the row dropped. */
export function rowSchema(name: string): z.ZodType<Record<string, unknown>> {
  const cached = schemas.get(name)
  if (cached) return cached
  const shape: Record<string, z.ZodType> = {}
  for (const f of columnsOf(name)) {
    let t = typeOf(f)
    if (!f.isRequired && f.type !== 'Json') t = t.nullable()
    shape[f.name] = !f.isRequired || f.hasDefaultValue || f.isUpdatedAt ? t.optional() : t
  }
  const schema = z.object(shape) as unknown as z.ZodType<Record<string, unknown>>
  schemas.set(name, schema)
  return schema
}

/** The rows of a table from the file, checked. Names the table and row when one cannot be read. */
export function parseRows(name: string, delegate: string, rows: unknown): Record<string, unknown>[] {
  const schema = rowSchema(name)
  if (!Array.isArray(rows)) throw fail('invalid', 'This file is damaged. Export the project again and upload it again')
  return rows.map((row, i) => {
    const parsed = schema.safeParse(row)
    if (!parsed.success) {
      logger.warn({ table: delegate, row: i + 1, columns: parsed.error.issues.map((x) => x.path.join('.')) }, 'Project file row could not be read')
      throw fail('invalid', `This file has a value that cannot be read (${delegate}, row ${i + 1}). It was probably made by a different version. Export the project again`)
    }
    return parsed.data
  })
}
