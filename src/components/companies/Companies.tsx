'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Table, Td, useConfirm, useToast } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { formatPhoneList } from '@/lib/phone'
import CompanyModal, { type CompanyData, type PartnerData } from './CompanyModal'
import PartnerModal from './PartnerModal'
import CompanyLetterhead from './CompanyLetterhead'

type PartnerEdit = { company: CompanyData; partner: PartnerData | null }

/** The companies of this installation and their partners. A project picks a company; a sale agreement names two of its partners. */
export default function Companies({ companies, canAdd = false }: { companies: CompanyData[]; canAdd?: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [editingCompany, setEditingCompany] = useState<{ company: CompanyData | null } | null>(null)
  const [editingPartner, setEditingPartner] = useState<PartnerEdit | null>(null)

  const refresh = () => router.refresh()

  const removeCompany = async (company: CompanyData) => {
    const ok = await confirm({ title: 'Delete company', message: `Delete "${company.name}" and its partners?`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    try {
      await fetchJson(`/api/companies/${company.id}`, { method: 'DELETE' })
      toast.success('Company deleted')
      refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const setActive = async (company: CompanyData, partner: PartnerData, isActive: boolean) => {
    try {
      await fetchJson(`/api/companies/${company.id}/partners/${partner.id}`, jsonRequest('PUT', { name: partner.name, address: partner.address ?? '', isActive }))
      toast.success(isActive ? `${partner.name} is active again` : `${partner.name} is switched off and will not be offered for agreements`)
      refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const removePartner = async (company: CompanyData, partner: PartnerData) => {
    const ok = await confirm({ title: 'Delete partner', message: `Delete ${partner.name}?`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    try {
      await fetchJson(`/api/companies/${company.id}/partners/${partner.id}`, { method: 'DELETE' })
      toast.success('Partner deleted')
      refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <div className="flex justify-between items-center wrap gap-3 mb-4">
        <p className="text-secondary m-0">
          {`The company that appears on a project's agreements and letters. When a sale agreement is generated you choose which of the company's partners to name in it.`}
        </p>
        {canAdd && <Button variant="primary" onClick={() => setEditingCompany({ company: null })}>+ New company</Button>}
      </div>

      {companies.length === 0 && (
        <Card><EmptyState title="No company yet">Add the developer company first. Projects pick it when they are created.</EmptyState></Card>
      )}

      {companies.map((company) => {
        const active = company.partners.filter((p) => p.isActive).length
        return (
          <Card flush key={company.id} className="mb-4">
            <div className="p-5 pb-0">
              <CardHeader
                title={company.name}
                actions={
                  <>
                    <Button size="sm" onClick={() => setEditingCompany({ company })}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-danger" disabled={company.projectCount > 0} title={company.projectCount > 0 ? 'A project uses this company' : undefined} onClick={() => removeCompany(company)}>Delete</Button>
                  </>
                }
              />
              <div className="grid grid-3 gap-4 mb-4">
                <div className="detail-tile"><div className="label-caps">PAN</div><div>{company.panNumber ?? <span className="text-danger">Not added: edit the company to add it</span>}</div></div>
                <div className="detail-tile"><div className="label-caps">GSTIN</div><div>{company.gstin ?? '—'}</div></div>
                <div className="detail-tile"><div className="label-caps">Projects</div><div>{company.projectCount}</div></div>
              </div>
              <div className="text-secondary mb-2">{company.address}</div>
              <CompanyLetterhead companyId={company.id} letterheadUrl={company.letterheadUrl} topMm={company.quoteMarginTopMm} bottomMm={company.quoteMarginBottomMm} />
              <div className="text-secondary mb-4">Contact: {company.contactNumbers ? formatPhoneList(company.contactNumbers) : <span className="text-danger">Not added: edit the company to add the numbers buyers can call</span>}</div>
            </div>

            <div className="p-5 pt-0">
              <div className="flex justify-between items-center mb-2">
                <h4 className="m-0">Partners</h4>
                <Button size="sm" onClick={() => setEditingPartner({ company, partner: null })}>+ Add partner</Button>
              </div>
              {active === 0 && (
                <Alert variant="warning" className="mb-3">No active partners yet. Add the partners who sign the sale agreement here.</Alert>
              )}
            </div>
            {company.partners.length > 0 && (
              <Table flush stack>
                <thead><tr><th>Name</th><th>PAN</th><th>Address</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {company.partners.map((partner) => (
                    <tr key={partner.id}>
                      <Td label="Name" className="font-semibold">{partner.name}</Td>
                      <Td label="PAN" className="text-secondary">{partner.maskedPan ?? '—'}</Td>
                      <Td label="Address" className="text-secondary">{partner.address ?? '—'}</Td>
                      <Td label="Status">{partner.isActive ? <Badge variant="success">Active</Badge> : <Badge>Switched off</Badge>}</Td>
                      <Td label="Actions" className="text-right nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setEditingPartner({ company, partner })}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => setActive(company, partner, !partner.isActive)}>{partner.isActive ? 'Switch off' : 'Switch on'}</Button>
                        <Button variant="ghost" size="sm" className="text-danger" onClick={() => removePartner(company, partner)}>Delete</Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )
      })}

      {editingCompany && <CompanyModal company={editingCompany.company} onClose={() => setEditingCompany(null)} onSaved={() => { setEditingCompany(null); toast.success('Company saved'); refresh() }} />}
      {editingPartner && (
        <PartnerModal
          companyId={editingPartner.company.id}
          companyName={editingPartner.company.name}
          partner={editingPartner.partner}
          onClose={() => setEditingPartner(null)}
          onSaved={() => { setEditingPartner(null); toast.success('Partner saved'); refresh() }}
        />
      )}
    </>
  )
}
