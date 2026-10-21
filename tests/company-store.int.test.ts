import { beforeEach, expect, it } from 'vitest'
import { describeDb, getPrisma, resetDb, seedProject } from './helpers/db'

const company = { name: 'Neev LLP', panNumber: 'AADCB2230M', gstin: null, address: 'Pune' }
const partner = (name: string) => ({ name, address: null, panNumber: undefined })

describeDb('company store', () => {
  beforeEach(resetDb)

  async function setup() {
    const prisma = await getPrisma()
    const store = await import('@/lib/company-store')
    const { transaction } = await import('@/lib/db')
    const run = <T>(fn: (tx: Parameters<Parameters<typeof transaction>[0]>[0]) => Promise<T>) => transaction(fn)
    return { prisma, store, run }
  }

  it('does not allow two companies with the same name, ignoring case', async () => {
    const { store, run } = await setup()
    await run((tx) => store.createCompany(tx, company))
    await expect(run((tx) => store.createCompany(tx, { ...company, name: 'neev llp' }))).rejects.toThrow(/already a company called/)
  })

  it('will not delete a company that a project uses, and deletes one that none does', async () => {
    const { prisma, store, run } = await setup()
    const { project } = await seedProject({ units: 1 })
    await expect(run((tx) => store.deleteCompany(tx, project.companyId))).rejects.toThrow(/uses this company/)
    const free = await run((tx) => store.createCompany(tx, company))
    await run((tx) => store.deleteCompany(tx, free))
    expect(await prisma.company.count({ where: { id: free } })).toBe(0)
  })

  it('stores a partner PAN encrypted and keeps it when an edit leaves the PAN out', async () => {
    const { prisma, store, run } = await setup()
    const companyId = await run((tx) => store.createCompany(tx, company))
    const id = await run((tx) => store.createPartner(tx, companyId, { name: 'Rajesh Shah', address: null, panNumber: 'ABCDE1234F' }))
    const stored = await prisma.partner.findUniqueOrThrow({ where: { id } })
    expect(stored.panNumber).toMatch(/^enc:v1:/)

    await run((tx) => store.updatePartner(tx, companyId, id, { name: 'Rajesh S. Shah', address: 'Mumbai' })) // PAN left out: unchanged
    const edited = await prisma.partner.findUniqueOrThrow({ where: { id } })
    expect(edited).toMatchObject({ name: 'Rajesh S. Shah', address: 'Mumbai', panNumber: stored.panNumber })

    await run((tx) => store.updatePartner(tx, companyId, id, { name: 'Rajesh S. Shah', address: null, panNumber: null })) // empty: cleared
    expect((await prisma.partner.findUniqueOrThrow({ where: { id } })).panNumber).toBeNull()
  })

  it('switches a partner off, and refuses to delete one that an agreement names', async () => {
    const { prisma, store, run } = await setup()
    const { project } = await seedProject({ units: 1 })
    const id = await run((tx) => store.createPartner(tx, project.companyId, partner('Meena Patel')))
    await run((tx) => store.updatePartner(tx, project.companyId, id, { name: 'Meena Patel', address: null, isActive: false }))
    expect((await prisma.partner.findUniqueOrThrow({ where: { id } })).isActive).toBe(false)

    const unit = await prisma.unit.findFirstOrThrow({ where: { floor: { wing: { projectId: project.id } } } })
    const sale = await prisma.sale.create({ data: { saleNumber: 'S-1', projectId: project.id, unitId: unit.id, agreementValue: 1000, gstAmount: 0, bookingDate: new Date(), status: 'BOOKED' } })
    await prisma.document.create({ data: { saleId: sale.id, type: 'SALE_AGREEMENT', status: 'GENERATED', partnerIds: [id] } })
    await expect(run((tx) => store.deletePartner(tx, project.companyId, id))).rejects.toThrow(/Switch them off/)

    const other = await run((tx) => store.createPartner(tx, project.companyId, partner('Anil Mehta')))
    await run((tx) => store.deletePartner(tx, project.companyId, other))
    expect(await prisma.partner.count({ where: { id: other } })).toBe(0)
  })
})
