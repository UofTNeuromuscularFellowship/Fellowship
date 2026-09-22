import { useSearchParams } from 'react-router-dom'
import type { ConfEvent } from '../../../lib/conference'
import { Segmented } from '../Segmented'
import { useMoney } from './data'
import { Budget } from './Budget'
import { Costs } from './Costs'
import { SpeakerPay } from './SpeakerPay'
import { Report } from './Report'

type View = 'budget' | 'costs' | 'speakers' | 'report'

export function Money({ event, portalUrl }: { event: ConfEvent; portalUrl: string }) {
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) || 'budget'
  const { data, reload } = useMoney(event.id)
  if (!data) return <p className="text-sm text-muted">Loading…</p>
  const toReview = data.claims.filter((c) => c.status === 'submitted').length
  const go = (v: View) => { const p = new URLSearchParams(params); p.set('view', v); setParams(p, { replace: true }) }
  return (
    <div className="space-y-5">
      <Segmented label="Money" value={view} onChange={go} options={[
        ['budget', 'Budget'], ['costs', 'Costs & income'], ['speakers', 'Speaker pay', toReview], ['report', 'Report'],
      ]} />
      {view === 'budget' && <Budget eventId={event.id} data={data} reload={reload} />}
      {view === 'costs' && <Costs event={event} data={data} reload={reload} />}
      {view === 'speakers' && <SpeakerPay event={event} data={data} reload={reload} portalUrl={portalUrl} />}
      {view === 'report' && <Report event={event} data={data} />}
    </div>
  )
}
