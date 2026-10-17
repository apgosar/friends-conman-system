'use client'

import { useState } from 'react'
import { Button, Modal } from '@/components/ui'

/**
 * Shows a template's HTML in a sandboxed frame. The sandbox attribute (no allowances) means scripts, forms and
 * same-origin access are all off, so a template can never run code inside the admin app.
 */
export default function TemplateHtmlPreview({ html }: { html: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>View HTML</Button>
      {open && (
        <Modal title="HTML template preview" size="lg" onClose={() => setOpen(false)} footer={<Button variant="primary" onClick={() => setOpen(false)}>Close</Button>}>
          <iframe title="Template preview" sandbox="" srcDoc={html} className="preview-frame" />
        </Modal>
      )}
    </>
  )
}
