import { useState, type ReactNode } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { cardCls, inputCls, sectionIconCls, sectionTitleCls } from '@/lib/ui'
import { formatMoney, MONEDAS, parseMonto, type FilaTarifas, type Moneda, type Tarifa } from '@/lib/tarifas'

export function Section({ icon: Icon, title, subtitle, children, actions }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className={cn(cardCls, 'relative z-10')}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><Icon className={sectionIconCls} /><span className={sectionTitleCls}>{title}</span></div>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

// Una celda con su tarifa: consulta, o edición en línea (Guardar / Quitar) si es editable.
export function CeldaTarifa({ tarifa, moneda, editable, saving, onSave, onDelete }: {
  tarifa: Tarifa | null; moneda: Moneda; editable: boolean; saving: boolean
  onSave?: (monto: number) => Promise<void>; onDelete?: (t: Tarifa) => Promise<void>
}) {
  const [edit, setEdit] = useState<string | null>(null)
  const [error, setError] = useState('')
  if (edit !== null) {
    const guardar = async () => {
      try { const n = parseMonto(edit); if (n == null) { setError('Escribe la tarifa.'); return } setError(''); await onSave?.(n); setEdit(null) }
      catch (e) { setError(e instanceof Error ? e.message : 'Monto inválido.') }
    }
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <Input autoFocus inputMode="decimal" aria-label={`Tarifa en ${moneda}`} className={cn(inputCls, 'w-28 text-right h-8')} value={edit}
            onChange={e => setEdit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void guardar(); if (e.key === 'Escape') setEdit(null) }} />
          <button type="button" aria-label="Guardar" disabled={saving} onClick={() => void guardar()} className="w-7 h-7 rounded-md bg-theme-from text-white flex items-center justify-center disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
          <button type="button" aria-label="Cancelar" onClick={() => { setEdit(null); setError('') }} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        {error && <span role="alert" className="text-[10px] text-red-700">{error}</span>}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-end gap-1 group">
      <span className={cn('tabular-nums', tarifa ? 'text-slate-800' : 'text-slate-400')}>{tarifa ? formatMoney(tarifa.tarifa) : '—'}</span>
      {editable && (
        <>
          <button type="button" aria-label={tarifa ? `Cambiar tarifa en ${moneda}` : `Poner tarifa en ${moneda}`} disabled={saving}
            onClick={() => setEdit(tarifa ? String(tarifa.tarifa) : '')} className="w-6 h-6 rounded text-slate-400 hover:text-theme-text hover:bg-theme-light flex items-center justify-center disabled:opacity-40"><Pencil className="w-3 h-3" /></button>
          {tarifa && onDelete && (
            <button type="button" aria-label={`Quitar tarifa en ${moneda}`} disabled={saving} onClick={() => void onDelete(tarifa)}
              className="w-6 h-6 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center disabled:opacity-40"><Trash2 className="w-3 h-3" /></button>
          )}
        </>
      )}
    </div>
  )
}

// Tabla quién × moneda.
export function TablaTarifas({ filas, editable, saving, onSave, onDelete, vacio }: {
  filas: FilaTarifas[]; editable: boolean; saving: boolean; vacio: string
  onSave?: (fila: FilaTarifas, moneda: Moneda, monto: number) => Promise<void>; onDelete?: (t: Tarifa) => Promise<void>
}) {
  if (!filas.length) return <p className="text-xs text-slate-500">{vacio}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr className="text-left text-[11px] text-slate-500 border-b border-slate-200">
          <th className="py-1.5 pr-3 font-medium">Aplica a</th>
          {MONEDAS.map(m => <th key={m} className="py-1.5 pl-3 font-medium text-right w-[150px]">{m}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map(f => (
            <tr key={f.key}>
              <td className="py-2 pr-3">
                <span className="text-slate-800">{f.nombre}</span>
                <span className="ml-1.5 text-[10px] text-slate-500">{f.quien === 'tipo' ? 'nivel' : f.quien === 'abogado' ? 'abogado' : ''}</span>
              </td>
              {MONEDAS.map(m => (
                <td key={m} className="py-2 pl-3">
                  <CeldaTarifa tarifa={f.porMoneda[m]} moneda={m} editable={editable} saving={saving}
                    onSave={onSave ? n => onSave(f, m, n) : undefined} onDelete={onDelete} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Aviso({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'error' | 'info' }) {
  return <p role={tone === 'info' ? undefined : 'alert'} className={cn('text-xs rounded-lg border p-2',
    tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : tone === 'info' ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-800')}>{children}</p>
}

export const LinkBtn = ({ href, children }: { href: string; children: ReactNode }) => (
  <Button asChild variant="outline" size="sm" className="h-8 border-slate-200 text-xs"><a href={href}>{children}</a></Button>
)
