'use client'

import { useState } from 'react'
import { Alert, Button, Card, CardHeader, TextField } from '@/components/ui'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'

const EXAMPLES = [
  'Who is more than 30 days overdue?',
  'How much did we collect this month?',
  'Which 2BHK flats are still available?',
  'How many flats have we sold, by project?',
]

/**
 * Ask a question about sales, collections or inventory in plain words. Gemini answers it from the live data through the app's own
 * read-only reports (see lib/ask-data.ts), and the reports it looked at are listed under the answer.
 */
export default function AskYourData() {
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ question: string; answer: string; looked: string[] } | null>(null)

  const ask = async (text: string) => {
    const q = text.trim()
    if (q.length < 3 || asking) return
    setAsking(true)
    setError('')
    try {
      const json = await fetchJson('/api/ask', jsonRequest('POST', { question: q }))
      setResult({ question: q, ...(json.data as { answer: string; looked: string[] }) })
    } catch (err) {
      setResult(null)
      setError(errorMessage(err))
    } finally {
      setAsking(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader title="✨ Ask your data" />
      <form className="flex gap-3 items-end wrap" onSubmit={(e) => { e.preventDefault(); ask(question) }}>
        <div className="flex-1">
          <TextField
            label="Your question"
            value={question}
            maxLength={500}
            placeholder="Who in Wing A is 30+ days overdue?"
            onChange={(e) => setQuestion(e.target.value)}
            hint="Answered by Gemini from your live sales, collections and inventory. Nothing is changed"
          />
        </div>
        <Button type="submit" variant="primary" loading={asking} disabled={question.trim().length < 3}>Ask</Button>
      </form>
      <div className="flex gap-2 wrap mt-3">
        {EXAMPLES.map((e) => (
          <Button key={e} size="sm" variant="ghost" disabled={asking} onClick={() => { setQuestion(e); ask(e) }}>{e}</Button>
        ))}
      </div>

      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
      {result && (
        <div className="mt-4 flex dir-col gap-2" aria-live="polite">
          <div className="text-sm text-muted">{result.question}</div>
          <div className="pre-wrap">{result.answer}</div>
          {result.looked.length > 0 && <div className="text-sm text-muted">Looked at: {result.looked.join(' · ')}</div>}
        </div>
      )}
    </Card>
  )
}
