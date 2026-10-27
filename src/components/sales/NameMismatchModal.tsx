'use client'

import { useState } from 'react'
import { Alert, Button, Modal, RadioGroupField } from '@/components/ui'

/**
 * Shown when the name read from the Aadhaar and the name read from the PAN card differ. Says which name came from which file and asks
 * which one the buyer is to be recorded under.
 */
export default function NameMismatchModal({ aadhaarName, panName, onChoose, onCancel }: {
  aadhaarName: string
  panName: string
  onChoose: (name: string) => void
  onCancel: () => void
}) {
  const [choice, setChoice] = useState<'AADHAAR' | 'PAN'>('AADHAAR')

  return (
    <Modal
      title="The names on the two documents do not match"
      dismissible={false}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Decide later</Button>
          <Button variant="primary" onClick={() => onChoose(choice === 'AADHAAR' ? aadhaarName : panName)}>Use this name</Button>
        </>
      }
    >
      <div className="flex dir-col gap-4">
        <Alert variant="warning">The agreement and receipts will carry the name you pick, so choose the one that is correct. You can still edit it afterwards</Alert>
        <RadioGroupField
          label="Which name should be used?"
          name="kyc-name-choice"
          value={choice}
          onChange={(v) => setChoice(v as 'AADHAAR' | 'PAN')}
          options={[
            { value: 'AADHAAR', label: <><strong>{aadhaarName}</strong><br />Read from the Aadhaar card</> },
            { value: 'PAN', label: <><strong>{panName}</strong><br />Read from the PAN card</> },
          ]}
        />
      </div>
    </Modal>
  )
}
