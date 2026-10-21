import Link from 'next/link'
import { Alert, SelectField } from '@/components/ui'

/** The company dropdown of the project forms. Companies are managed under Companies; a project picks one of them. */
export default function CompanyField({ companies, defaultValue }: { companies: { id: string; name: string }[]; defaultValue?: string }) {
  if (companies.length === 0) {
    return (
      <Alert variant="warning" className="mb-4" title="No company yet">
        Add the developer company first under <Link href="/companies" className="text-brand">Companies</Link>, then come back to create the project.
      </Alert>
    )
  }
  return (
    <div className="mb-4">
      <SelectField label="Company" name="companyId" required defaultValue={defaultValue ?? ''} hint={<>The company that appears on this project&apos;s agreements and letters. <Link href="/companies" className="text-brand">Manage companies</Link></>}>
        <option value="">Select company</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
    </div>
  )
}
