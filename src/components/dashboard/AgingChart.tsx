'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardHeader } from '@/components/ui'
import { formatRupees } from '@/lib/format'
import { AGING_TONE_COLOR, AXIS_TICK, GRID_STROKE, TOOLTIP_CURSOR, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE, formatRupeesCompact, type AgingTone } from '@/lib/chart-theme'

export interface AgingData {
  label: string
  amount: number
  tone: AgingTone
}

export default function AgingChart({ data }: { data: AgingData[] }) {
  return (
    <Card>
      <CardHeader title="Receivables Aging" />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatRupeesCompact} width={56} />
          <Tooltip
            formatter={(val: any) => [formatRupees(val), 'Amount'] as any}
            cursor={TOOLTIP_CURSOR}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
          />
          <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={AGING_TONE_COLOR[entry.tone]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}
