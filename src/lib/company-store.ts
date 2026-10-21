import type { DbTransaction } from '@/lib/db'
import { fail } from '@/lib/errors'
import type { CompanyInput, PartnerInput } from '@/lib/companies'

type Tx = DbTransaction

async function assertNameFree(tx: Tx, name: string, exceptId?: string) {
  const clash = await tx.company.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } })
  if (clash) throw fail('conflict', `There is already a company called "${name}"`)
}

export async function createCompany(tx: Tx, input: CompanyInput): Promise<string> {
  await assertNameFree(tx, input.name)
  const company = await tx.company.create({ data: input, select: { id: true } })
  return company.id
}

export async function updateCompany(tx: Tx, id: string, input: CompanyInput): Promise<void> {
  if (!(await tx.company.findUnique({ where: { id }, select: { id: true } }))) throw fail('notFound', 'Company not found')
  await assertNameFree(tx, input.name, id)
  await tx.company.update({ where: { id }, data: input })
}

/** A company that projects use cannot be deleted: its details are on their documents. */
export async function deleteCompany(tx: Tx, id: string): Promise<void> {
  const company = await tx.company.findUnique({ where: { id }, select: { id: true, _count: { select: { projects: true } } } })
  if (!company) throw fail('notFound', 'Company not found')
  if (company._count.projects > 0) throw fail('conflict', `${company._count.projects === 1 ? 'A project uses' : `${company._count.projects} projects use`} this company, so it cannot be deleted`)
  await tx.company.delete({ where: { id } })
}

export async function createPartner(tx: Tx, companyId: string, input: PartnerInput): Promise<string> {
  if (!(await tx.company.findUnique({ where: { id: companyId }, select: { id: true } }))) throw fail('notFound', 'Company not found')
  const partner = await tx.partner.create({
    data: { companyId, name: input.name, address: input.address, panNumber: input.panNumber ?? null, isActive: input.isActive ?? true },
    select: { id: true },
  })
  return partner.id
}

export async function updatePartner(tx: Tx, companyId: string, partnerId: string, input: PartnerInput): Promise<void> {
  if (!(await tx.partner.findFirst({ where: { id: partnerId, companyId }, select: { id: true } }))) throw fail('notFound', 'Partner not found')
  await tx.partner.update({
    where: { id: partnerId },
    data: {
      name: input.name,
      address: input.address,
      ...(input.panNumber !== undefined && { panNumber: input.panNumber }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  })
}

/** A partner named in a generated agreement is switched off instead of deleted, so the record of who signed stays. */
export async function deletePartner(tx: Tx, companyId: string, partnerId: string): Promise<void> {
  if (!(await tx.partner.findFirst({ where: { id: partnerId, companyId }, select: { id: true } }))) throw fail('notFound', 'Partner not found')
  const used = await tx.document.count({ where: { partnerIds: { has: partnerId } } })
  if (used > 0) throw fail('conflict', 'This partner is named in an agreement. Switch them off instead of deleting')
  await tx.partner.delete({ where: { id: partnerId } })
}
