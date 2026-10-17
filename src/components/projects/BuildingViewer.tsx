'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Alert, EmptyState, Modal, useConfirm, useToast } from '@/components/ui'
import { wingLabel } from '@/lib/building-structure'
import { isSaleable } from '@/lib/status'
import { can } from '@/lib/authz'
import { errorMessage, fetchJson, jsonRequest } from '@/lib/client/api'
import { highlightField } from '@/lib/client/forms'
import { normalizePhone } from '@/lib/phone'
import { QuoteModal } from './QuoteModal'
import { EditInquiryModal, ShareQuoteModal, LostInquiryModal, type InquiryData } from './InquiryModals'
import BuildingCanvas, { BuildingSkeleton } from './BuildingCanvas'
import UnitFilters from './UnitFilters'
import UnitTableView, { type UnitRow } from './UnitTableView'
import UnitDetailPanel, { floorPlanSrc } from './UnitDetailPanel'
import InquiryCard, { type InquiryAction } from './InquiryCard'
import { statusMatches, type UnitData, type WingData } from './building-model'

const EMPTY_QUOTE = { customerName: '', mobileNumber: '', email: '', source: '', sourceDetail: '', validityDays: '7', agreementValue: '', rate: '', parkingIncluded: false }
const DEFAULT_RATE_PER_SQFT = 12000
const TABLET_MAX = '(max-width: 1100px)' // keep in step with the breakpoint in building.css

/**
 * The project's units, as a 3D building or a table, with filters and a side panel for the selected unit
 * (floor plan, quotes and inquiries). Data loading and the quote/inquiry workflow live here; the pieces live next to it.
 */
export default function BuildingViewer({ projectId, view = '3d' }: { projectId: string; view?: '3d' | 'table' }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { data: session } = useSession()
  const canDelete = can(session?.user?.role, 'admin')

  const [wings, setWings] = useState<WingData[]>([])
  const [projectParkingCharge, setProjectParkingCharge] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWingIdx, setSelectedWingIdx] = useState(0)
  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null)
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [typeFilter, setFilterType] = useState('ALL')
  const [tableQuery, setTableQuery] = useState('')

  // Quote form
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [quoteData, setQuoteData] = useState(EMPTY_QUOTE)
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false)
  const [matchState, setMatchState] = useState<{ mobile: string; items: any[] }>({ mobile: '', items: [] })

  // Inquiries: the building view carries counts only; the selected unit's inquiries are fetched when it is opened
  const [inquiryState, setInquiryState] = useState<{ unitId: string; items: InquiryData[] } | null>(null)
  const [repeatMobiles, setRepeatMobiles] = useState<Record<string, number>>({})
  const [showAllInquiries, setShowAllInquiries] = useState(false)
  const [showFloorPlan, setShowFloorPlan] = useState(false)
  const [inquiryAction, setInquiryAction] = useState<{ type: InquiryAction; inq: InquiryData } | null>(null)

  // The detail panel matches the building's height on desktop so a long inquiry list can't stretch the page.
  // A state-backed ref, because the canvas/table element is re-created when the wing or view changes and the new one must be observed
  const [stageEl, stageRef] = useState<HTMLDivElement | null>(null)
  const [stageHeight, setStageHeight] = useState<number | null>(null)
  useEffect(() => {
    if (!stageEl) return
    const ro = new ResizeObserver(() => setStageHeight(stageEl.offsetHeight))
    ro.observe(stageEl)
    return () => ro.disconnect()
  }, [stageEl])

  // ── Data ──
  const applyBuilding = useCallback((data: any) => {
    if (data.wings) setWings(data.wings)
    if (data.projectParkingCharge) setProjectParkingCharge(data.projectParkingCharge)
    setRepeatMobiles(data.repeatMobiles ?? {})
  }, [])

  useEffect(() => {
    fetchJson(`/api/projects/${projectId}/building-view`)
      .then(applyBuilding)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [projectId, applyBuilding])

  const loadInquiries = useCallback(async (unitId: string) => {
    try {
      const json = await fetchJson(`/api/units/${unitId}/inquiries`)
      setInquiryState({ unitId, items: json.inquiries })
    } catch {
      setInquiryState({ unitId, items: [] })
    }
  }, [])
  const selectedId = selectedUnit?.id
  useEffect(() => { if (selectedId) loadInquiries(selectedId) }, [selectedId, loadInquiries])
  const unitInquiries = inquiryState && inquiryState.unitId === selectedUnit?.id ? inquiryState.items : null

  // Repeat-customer warning in the quote form: look the number up once it is complete
  useEffect(() => {
    const phone = normalizePhone(quoteData.mobileNumber)
    if (!showQuoteForm || !phone.ok || !phone.value) return
    const mobile = phone.value
    const t = setTimeout(async () => {
      try {
        const json = await fetchJson(`/api/projects/${projectId}/inquiries/lookup?mobile=${mobile}`)
        setMatchState({ mobile, items: json.matches ?? [] })
      } catch {
        setMatchState({ mobile, items: [] })
      }
    }, 250)
    return () => clearTimeout(t)
  }, [showQuoteForm, quoteData.mobileNumber, projectId])
  const quotePhone = normalizePhone(quoteData.mobileNumber)
  const repeatMatches = showQuoteForm && quotePhone.ok && matchState.mobile === quotePhone.value ? matchState.items : []

  // On a phone or tablet the panel sits below the building: bring it into view when a unit is picked
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selectedId && window.matchMedia?.(TABLET_MAX).matches) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedId])

  // ── Actions ──
  function selectUnit(unit: UnitData) {
    setSelectedUnit(unit)
    setShowFloorPlan(false)
    setShowQuoteForm(false)
    setQuoteData({ ...EMPTY_QUOTE, agreementValue: String(unit.carpetAreaSqft * DEFAULT_RATE_PER_SQFT), rate: String(DEFAULT_RATE_PER_SQFT) })
  }

  async function reloadBuilding() {
    try {
      const data = await fetchJson(`/api/projects/${projectId}/building-view`)
      applyBuilding(data)
      if (selectedUnit) {
        const fresh = data.wings.flatMap((w: WingData) => w.floors.flatMap((f) => f.units)).find((u: UnitData) => u.id === selectedUnit.id)
        if (fresh) setSelectedUnit(fresh)
        await loadInquiries(selectedUnit.id)
      }
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function reopenInquiry(inq: InquiryData) {
    if (!selectedUnit) return
    try {
      await fetchJson(`/api/units/${selectedUnit.id}/quotes/${inq.id}`, jsonRequest('PATCH', { status: 'OPEN' }))
      await reloadBuilding()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function deleteInquiry(inq: InquiryData) {
    if (!selectedUnit) return
    const ok = await confirm({ title: 'Delete inquiry?', message: `Delete the inquiry from ${inq.customerName}? This cannot be undone.`, confirmLabel: 'Delete inquiry', danger: true })
    if (!ok) return
    try {
      await fetchJson(`/api/units/${selectedUnit.id}/quotes/${inq.id}`, { method: 'DELETE' })
      await reloadBuilding()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function handleGenerateQuote(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUnit) return
    const phone = normalizePhone(quoteData.mobileNumber)
    if (!phone.ok || !phone.value) { highlightField('quote-mobile'); return }
    setIsSubmittingQuote(true)
    try {
      await fetchJson(`/api/units/${selectedUnit.id}/quotes`, jsonRequest('POST', { ...quoteData, mobileNumber: phone.value, agreementValue: Number(quoteData.agreementValue) }))
      await reloadBuilding() // shows the new status and inquiry
      setShowQuoteForm(false)
      toast.success('Quote generated')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSubmittingQuote(false)
    }
  }

  // ── Render ──
  if (loading) return <BuildingSkeleton />
  if (error) return <Alert variant="danger">{error}</Alert>
  if (wings.length === 0) {
    return <EmptyState title="🏗️ No wings or units yet">Add wings, floors and units to the project to see the building view.</EmptyState>
  }

  const activeWing = wings[selectedWingIdx]
  const singleWing = wings.length === 1
  // A type filter chosen in one wing may not exist in another (e.g. "Shop" in the commercial block): treat it as All Types
  const typesInWing = new Set(activeWing.floors.flatMap((f) => f.units.map((u) => u.configuration)))
  const filterType = typeFilter !== 'ALL' && !typesInWing.has(typeFilter) ? 'ALL' : typeFilter

  // Counts on the chips: saleable units of the shown wing; each group respects the other group's filter,
  // so a chip's number is how many units you would see if you picked it.
  const saleable = activeWing.floors.flatMap((f) => f.units).filter((u) => isSaleable(u.status))
  const typeCount = (type: string) => saleable.filter((u) => (type === 'ALL' || u.configuration === type) && statusMatches(filterStatus, u.status)).length
  const statusCount = (status: string) => saleable.filter((u) => (filterType === 'ALL' || u.configuration === filterType) && statusMatches(status, u.status)).length
  const availableTypes = Array.from(new Set(saleable.map((u) => u.configuration))).filter(Boolean).sort()

  const q = tableQuery.trim().toLowerCase()
  const tableRows: UnitRow[] = activeWing.floors
    .flatMap((f) => f.units.map((u) => ({ unit: u, wingName: activeWing.name, floorNumber: f.floorNumber })))
    .filter(({ unit, wingName }) =>
      statusMatches(filterStatus, unit.status) &&
      (filterType === 'ALL' || unit.configuration === filterType) &&
      (!q || [unit.unitNumber, wingName, unit.configuration, unit.saleNumber ?? '', unit.buyerName ?? '', unit.bookedByName ?? '', unit.bookedByMobile ?? ''].some((v) => v.toLowerCase().includes(q))))
    .sort((a, b) => a.floorNumber - b.floorNumber || a.unit.unitNumber.localeCompare(b.unit.unitNumber, undefined, { numeric: true }))

  const repeatCount = (mobile: string) => repeatMobiles[mobile] ?? 1
  const inquiryCards = selectedUnit && unitInquiries?.map((inq) => (
    <InquiryCard key={inq.id} unit={selectedUnit} inquiry={inq} repeatCount={repeatCount(inq.mobileNumber)} canDelete={canDelete}
      onAction={(type, i) => setInquiryAction({ type, inq: i })} onReopen={reopenInquiry} onDelete={deleteInquiry} />
  ))
  const afterAction = async () => { setInquiryAction(null); await reloadBuilding() }

  return (
    <div className="bv">
      <UnitFilters
        wings={wings}
        selectedWingIdx={selectedWingIdx}
        onSelectWing={(idx) => { setSelectedWingIdx(idx); setSelectedUnit(null); setFilterType('ALL') }}
        types={availableTypes}
        filters={{ status: filterStatus, type: filterType }}
        onStatus={setFilterStatus}
        onType={setFilterType}
        typeCount={typeCount}
        statusCount={statusCount}
      />

      <div className="bv-layout">
        <div className="bv-main">
          {view === 'table' ? (
            <UnitTableView rows={tableRows} query={tableQuery} onQuery={setTableQuery} selectedId={selectedUnit?.id ?? null} onSelect={selectUnit} outerRef={stageRef} />
          ) : (
            <BuildingCanvas
              key={activeWing.id}
              outerRef={stageRef}
              wing={activeWing}
              title={singleWing ? 'Building' : wingLabel(activeWing.name)}
              filterStatus={filterStatus}
              filterType={filterType}
              selectedUnitId={selectedUnit?.id ?? null}
              onSelect={selectUnit}
              onClearFilters={() => { setFilterStatus('ALL'); setFilterType('ALL') }}
            />
          )}
        </div>

        {selectedUnit && (
          <div ref={panelRef} className="bv-panel-wrap">
            <UnitDetailPanel
              unit={selectedUnit}
              wingName={wingLabel(activeWing.name)}
              singleWing={singleWing}
              height={stageHeight}
              inquiries={unitInquiries}
              repeatCount={repeatCount}
              canDelete={canDelete}
              onClose={() => setSelectedUnit(null)}
              onEnlargePlan={() => setShowFloorPlan(true)}
              onCreateQuote={() => setShowQuoteForm(true)}
              onShowAllInquiries={() => setShowAllInquiries(true)}
              onInquiryAction={(type, inq) => setInquiryAction({ type, inq })}
              onReopen={reopenInquiry}
              onDelete={deleteInquiry}
            />
          </div>
        )}
      </div>

      {showFloorPlan && selectedUnit && (
        <Modal title={selectedUnit.unitNumber} subtitle={`${selectedUnit.configuration} · ${selectedUnit.carpetAreaSqft} sqft carpet`} size="xl" onClose={() => setShowFloorPlan(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- floor plans are user-uploaded files of unknown size */}
          <img className="bv-plan-large" src={floorPlanSrc(selectedUnit)} alt={`${selectedUnit.configuration} floor plan`} />
        </Modal>
      )}

      {showAllInquiries && selectedUnit && (
        <Modal title={`Inquiries: ${selectedUnit.unitNumber} (${unitInquiries?.length ?? 0})`} onClose={() => setShowAllInquiries(false)}>
          <div className="flex dir-col gap-2">{inquiryCards}</div>
        </Modal>
      )}

      <QuoteModal
        showQuoteForm={showQuoteForm}
        setShowQuoteForm={setShowQuoteForm}
        selectedUnit={selectedUnit}
        quoteData={quoteData}
        setQuoteData={setQuoteData}
        handleGenerateQuote={handleGenerateQuote}
        isSubmittingQuote={isSubmittingQuote}
        projectParkingCharge={projectParkingCharge}
        existingInquiries={repeatMatches}
      />

      {inquiryAction && selectedUnit && inquiryAction.type === 'edit' && (
        <EditInquiryModal unitId={selectedUnit.id} unitNumber={selectedUnit.unitNumber} inq={inquiryAction.inq} onClose={() => setInquiryAction(null)} onDone={afterAction} />
      )}
      {inquiryAction && selectedUnit && inquiryAction.type === 'share' && (
        <ShareQuoteModal unitId={selectedUnit.id} unitNumber={selectedUnit.unitNumber} inq={inquiryAction.inq} onClose={() => setInquiryAction(null)} onDone={afterAction} />
      )}
      {inquiryAction && selectedUnit && inquiryAction.type === 'lost' && (
        <LostInquiryModal unitId={selectedUnit.id} inq={inquiryAction.inq} onClose={() => setInquiryAction(null)} onDone={afterAction} />
      )}
    </div>
  )
}
