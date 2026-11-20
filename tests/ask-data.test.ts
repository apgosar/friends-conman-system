import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { Type } from '@google/genai'
import { askYourData, type AskGenerator } from '@/lib/ask-data'
import type { AskTool } from '@/lib/ask-tools'

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
// ask-tools imports the database; the tests use their own tools, so the real ones are never run
vi.mock('@/lib/ask-tools', () => ({ ASK_TOOLS: [] }))

/** A report that echoes back what it was asked for, so a test can see what the model's arguments became. */
const echo = (name: string, onRun: (args: unknown) => unknown = (a) => ({ rows: [a] })): AskTool => {
  const schema = z.object({ wing: z.string().nullish() })
  return {
    title: 'Overdue demands',
    declaration: { name, description: 'test', parameters: { type: Type.OBJECT, properties: {} } },
    run: vi.fn(async (raw: unknown) => onRun(schema.parse(raw ?? {}))),
  }
}

const calls = (...names: { name: string; args?: Record<string, unknown> }[]) => ({ functionCalls: names, text: undefined, candidates: [{ content: { role: 'model', parts: [] } }] }) as unknown as Awaited<ReturnType<AskGenerator>>
const says = (text: string) => ({ functionCalls: undefined, text, candidates: [] }) as unknown as Awaited<ReturnType<AskGenerator>>

describe('askYourData', () => {
  it('lets the model look something up, hands it the result, and returns its answer with what was looked at', async () => {
    const tool = echo('overdue_demands')
    const generate: AskGenerator = vi.fn()
      .mockResolvedValueOnce(calls({ name: 'overdue_demands', args: { wing: 'A' } }))
      .mockResolvedValueOnce(says('Two buyers in Wing A are overdue.'))
    const out = await askYourData('Who in Wing A is overdue?', generate, [tool])
    expect(out).toEqual({ answer: 'Two buyers in Wing A are overdue.', looked: ['Overdue demands (wing: A)'] })
    expect(tool.run).toHaveBeenCalledWith({ wing: 'A' })
    // the second request carries the question, the model's own turn and the result of the report
    const second = (generate as ReturnType<typeof vi.fn>).mock.calls[1][0]
    expect(second).toHaveLength(3)
    expect(second[2].parts[0].functionResponse).toEqual({ name: 'overdue_demands', response: { output: { rows: [{ wing: 'A' }] } } })
  })

  it('answers straight away when no report is needed', async () => {
    const generate: AskGenerator = vi.fn().mockResolvedValue(says('I can look up overdue demands, collections, sales and inventory.'))
    const out = await askYourData('What can you do?', generate, [echo('overdue_demands')])
    expect(out.looked).toEqual([])
  })

  it('tells the model when a report does not exist or its arguments are wrong, instead of failing', async () => {
    const generate: AskGenerator = vi.fn()
      .mockResolvedValueOnce(calls({ name: 'drop_table', args: {} }, { name: 'overdue_demands', args: { wing: 5 } }))
      .mockResolvedValueOnce(says('I could not look that up.'))
    const out = await askYourData('Do something odd', generate, [echo('overdue_demands')])
    expect(out.answer).toBe('I could not look that up.')
    const results = (generate as ReturnType<typeof vi.fn>).mock.calls[1][0][2].parts.map((p: { functionResponse: { response: { output: unknown } } }) => p.functionResponse.response.output)
    expect(results[0]).toEqual({ error: 'There is no such report' })
    expect(results[1]).toEqual({ error: 'That could not be looked up. Check the filters' })
  })

  it('stops a question that keeps asking for more', async () => {
    const generate: AskGenerator = vi.fn().mockResolvedValue(calls({ name: 'overdue_demands', args: {} }))
    await expect(askYourData('Never ending', generate, [echo('overdue_demands')])).rejects.toMatchObject({ kind: 'server' })
    expect(generate).toHaveBeenCalledTimes(5)
  })

  it('cuts a result that is too large rather than sending it all', async () => {
    const big = echo('overdue_demands', () => ({ rows: 'x'.repeat(30_000) }))
    const generate: AskGenerator = vi.fn().mockResolvedValueOnce(calls({ name: 'overdue_demands' })).mockResolvedValueOnce(says('Too many.'))
    await askYourData('Everything', generate, [big])
    const output = (generate as ReturnType<typeof vi.fn>).mock.calls[1][0][2].parts[0].functionResponse.response.output
    expect(output.error).toContain('too large')
  })

  it('refuses an empty or very long question before calling Gemini', async () => {
    const generate: AskGenerator = vi.fn()
    await expect(askYourData('  ', generate, [])).rejects.toMatchObject({ kind: 'invalid' })
    await expect(askYourData('x'.repeat(501), generate, [])).rejects.toMatchObject({ kind: 'invalid' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('turns Google errors and an empty answer into plain messages', async () => {
    const google = (status: number): AskGenerator => async () => { throw Object.assign(new Error('secret internals'), { status }) }
    await expect(askYourData('Who is late?', google(429), [])).rejects.toMatchObject({ kind: 'tooManyRequests' })
    const slow = await askYourData('Who is late?', google(503), []).catch((e: unknown) => e)
    expect(slow).toMatchObject({ kind: 'unavailable' })
    expect((slow as Error).message).not.toContain('secret')
    await expect(askYourData('Who is late?', async () => says('   '), [])).rejects.toMatchObject({ kind: 'server' })
  })
})
