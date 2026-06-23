import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from '../components/ui/Card'

interface Page { id: string; title: string; body_md: string | null; updated_at: string }

export default function Handbook() {
  const [pages, setPages] = useState<Page[]>([])

  useEffect(() => {
    supabase
      .from('handbook_pages')
      .select('id,title,body_md,updated_at')
      .order('sort_order', { ascending: true })
      .then(({ data }) => setPages((data as Page[]) ?? []))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Handbook</h1>
        <p className="mt-1 text-sm text-muted">Program policies and reference</p>
      </div>
      {pages.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">No handbook pages published yet.</p>
        </Card>
      ) : (
        pages.map((p) => (
          <Card key={p.id}>
            <CardHeader title={p.title} sub={`Last updated ${new Date(p.updated_at).toLocaleDateString('en-CA')}`} />
            <div className="whitespace-pre-wrap px-5 py-4 text-sm text-ink">{p.body_md}</div>
          </Card>
        ))
      )}
    </div>
  )
}
