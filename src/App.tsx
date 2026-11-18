import { useEffect, useRef, useState } from 'react'
import 'animate.css'
import { Toaster } from 'sonner'
import { Building2, Coins, RefreshCw, Scale } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusModal, type StatusModalType } from '@/components/StatusModal'
import { ThemeMenu } from '@/components/ThemeMenu'
import { ClientesTab, DespachoTab, type Datos } from '@/components/Pestanas'
import { cn } from '@/lib/utils'
import { CALENDAR_URL } from '@/lib/api'
import { useTheme } from '@/lib/ui'
import { getAbogados, getClientes, getCobertura, getImpuestos, getNiveles, getTarifas, type Cliente, type Impuesto } from '@/lib/tarifas'
import { MenuButton } from '@/components/MenuButton'

type Modal = { isOpen: boolean; type: StatusModalType; title: string; message: string }
const uncertainOf = (error: unknown) => error instanceof Error && 'uncertain' in error && (error as { uncertain?: boolean }).uncertain === true

const TABS = [
  { id: 'despacho', label: 'Tarifas del despacho', icon: Scale },
  { id: 'clientes', label: 'Clientes', icon: Building2 },
] as const
type Tab = typeof TABS[number]['id']
const tabInicial = (): Tab => {
  try { const t = localStorage.getItem('tarifas_tab'); return TABS.some(x => x.id === t) ? t as Tab : 'despacho' } catch { return 'despacho' }
}

function App() {
  const [theme, setTheme] = useTheme()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [statusModal, setStatusModal] = useState<Modal>({ isOpen: false, type: 'info', title: '', message: '' })
  const showError = (title: string, error: unknown) => setStatusModal({ isOpen: true, type: 'error', title: uncertainOf(error) ? 'Resultado por verificar' : title, message: error instanceof Error ? error.message : 'Error.' })
  useEffect(() => {
    const orgId = new URLSearchParams(window.location.search).get('organization_id')
    if (!orgId) setStatusModal({ isOpen: true, type: 'error', title: 'Error de Inicialización', message: 'No se detectó la organización relacionada. Es necesario incluir el parámetro "organization_id" en la URL.' })
    else setOrganizationId(orgId)
  }, [])

  const [tab, setTab] = useState<Tab>(tabInicial)
  useEffect(() => { try { localStorage.setItem('tarifas_tab', tab) } catch { /* sin almacenamiento */ } }, [tab])

  // ── Datos comunes: tarifas, niveles, abogados y cobertura ──
  const [datos, setDatos] = useState<Datos | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const recargar = async () => {
    if (!organizationId) return
    const [tarifas, niveles, abogados, cobertura] = await Promise.all([
      getTarifas(organizationId), getNiveles(organizationId), getAbogados(organizationId), getCobertura(organizationId).catch(() => null),
    ])
    setDatos({ tarifas, niveles, abogados, cobertura })
  }
  const load = async () => {
    setLoading(true); setLoadError('')
    try { await recargar() } catch (e) { setLoadError(e instanceof Error ? e.message : 'No se pudieron cargar las tarifas.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [organizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clientes (2,500+) e impuestos: se cargan la primera vez que se abre la pestaña de clientes.
  const [clientes, setClientes] = useState<{ rows: Cliente[]; loading: boolean; error: string }>({ rows: [], loading: false, error: '' })
  const [impuestos, setImpuestos] = useState<Impuesto[]>([])
  const loadClientes = async () => {
    if (!organizationId) return
    setClientes(s => ({ ...s, loading: true, error: '' }))
    try {
      const [rows, imp] = await Promise.all([getClientes(organizationId), getImpuestos(organizationId)])
      setClientes({ rows, loading: false, error: '' }); setImpuestos(imp)
    } catch (e) { setClientes({ rows: [], loading: false, error: e instanceof Error ? e.message : 'No se pudieron cargar los clientes.' }) }
  }
  useEffect(() => { if (tab === 'clientes' && organizationId && !clientes.rows.length && !clientes.loading && !clientes.error) void loadClientes() }, [tab, organizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  async function run(action: () => Promise<void>, errorTitle: string) {
    if (busy.current) return
    busy.current = true; setSaving(true)
    try { await action() } catch (error) { showError(errorTitle, error) } finally { busy.current = false; setSaving(false) }
  }

  function handleCancel() {
    const params = new URLSearchParams(window.location.search)
    const org = organizationId || params.get('organization_id') || ''
    try {
      const target = new URL(params.get('origin') || CALENDAR_URL)
      if (!target.searchParams.get('organization_id') && org) target.searchParams.set('organization_id', org)
      target.searchParams.set('_t', Date.now().toString())
      window.location.href = target.toString()
    } catch {
      window.location.href = `${CALENDAR_URL}?organization_id=${encodeURIComponent(org)}&_t=${Date.now()}`
    }
  }

  const comun = organizationId && datos ? { org: organizationId, datos, run, saving, recargar } : null

  return (
    <div className="min-h-screen bg-slate-50/50 p-2 sm:p-4 lg:p-8 flex justify-center items-start font-sans w-full">
      <Toaster position="top-center" richColors />
      <Card className="w-full bg-gradient-to-b from-[#F6FBF8] to-white border border-slate-200 rounded-[20px] overflow-hidden p-3 sm:p-5 lg:p-8 relative animate__animated animate__fadeIn animate__faster">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-theme-from/5 rounded-full blur-[80px] animate-blob pointer-events-none z-0"></div>
        <div className="absolute top-0 left-0 right-0 h-15 bg-gradient-to-b from-theme-light to-transparent pointer-events-none z-0"></div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 lg:mb-6 gap-0 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-theme-from to-theme-to flex items-center justify-center shrink-0 shadow-sm border border-black/5 text-white">
              <Coins className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tarifas y clientes</h1>
                <ThemeMenu theme={theme} setTheme={setTheme} />
                <MenuButton />
              </div>
              <p className="text-slate-500 text-sm mt-0.5">Tarifa general, tarifas por cliente, IVA e idioma de la factura</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4 lg:mt-0 w-full lg:w-auto">
            <Button variant="outline" type="button" onClick={handleCancel}
              className="flex-1 lg:flex-none h-11 sm:h-12 px-6 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium">
              Regresar
            </Button>
          </div>
        </div>

        <div className="relative z-10 mb-4 -mx-1 overflow-x-auto">
          <div className="flex gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 w-max mx-1" role="tablist" aria-label="Secciones">
            {TABS.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={cn('px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all',
                  tab === t.id ? 'bg-white text-theme-text shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-theme-light border border-transparent')}>
                <t.icon className="w-4 h-4" />{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-10" inert={saving}>
          {loadError ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex flex-wrap items-center justify-between gap-2">
              {loadError}
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()}><RefreshCw className="w-3.5 h-3.5" />Reintentar</Button>
            </div>
          ) : !comun ? <p className="text-xs text-slate-500">{loading ? 'Cargando tarifas…' : ''}</p> : (
            <>
              {tab === 'despacho' && <DespachoTab {...comun} />}
              <div hidden={tab !== 'clientes'}>
                <ClientesTab {...comun} clientes={{ ...clientes, reload: () => void loadClientes() }} impuestos={impuestos} />
              </div>
            </>
          )}
        </div>
        <p className="mt-4 text-[11px] text-slate-500 relative z-10">Todo se guarda en Aptus. Desde aquí no se escribe en Books: el IVA solo elige un impuesto que ya existe allá.</p>
      </Card>

      <StatusModal
        isOpen={statusModal.isOpen}
        onClose={statusModal.type === 'error' && !organizationId ? undefined : () => setStatusModal(prev => ({ ...prev, isOpen: false }))}
        type={statusModal.type} title={statusModal.title} message={statusModal.message}
      />
    </div>
  )
}

export default App
