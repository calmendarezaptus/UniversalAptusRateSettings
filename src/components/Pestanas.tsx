import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Building2, Globe2, Layers, Plus, Receipt, Scale, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchSelect } from '@/components/SearchSelect'
import { Aviso, CeldaTarifa, LinkBtn, Section, TablaTarifas } from '@/components/Tablas'
import { cn } from '@/lib/utils'
import { gradientBtnCls, inputCls, labelCls } from '@/lib/ui'
import { firmUrl, lawyersUrl } from '@/lib/api'
import {
  buildTarifaCliente, clienteOptions, clientesConTarifas, createTarifa, deleteTarifa, diffClienteConfig, formatMoney, generales, getClienteConfig, IDIOMA_LABEL,
  JERARQUIA, MONEDAS, NIVEL_LABEL, nombreAbogado, patchClienteConfig, tabla, tarifasDeCliente, updateTarifa,
  type Abogado, type Cliente, type ClienteConfig, type Cobertura, type FilaTarifas, type FormTarifa, type Impuesto, type Moneda, type Nivel, type Tarifa,
} from '@/lib/tarifas'

export type Run = (action: () => Promise<void>, errorTitle: string) => Promise<void>
export interface Datos { tarifas: Tarifa[]; niveles: Nivel[]; abogados: Abogado[]; cobertura: Cobertura | null }
interface Comun { org: string; datos: Datos; run: Run; saving: boolean; recargar: () => Promise<void> }
const selectCls = cn(inputCls, 'w-full px-2 border')

const confirmarQuitar = (t: Tarifa, donde: string) =>
  window.confirm(`¿Quitar la tarifa de ${formatMoney(t.tarifa, t.moneda)} (${donde})?\n\nLos tiempos ya capturados conservan la tarifa con que se registraron.`)

// ── Tarifas del despacho ──
export function DespachoTab({ org, datos, run, saving, recargar }: Comun) {
  const gen = generales(datos.tarifas)
  const nivelesMap = useMemo(() => new Map(datos.niveles.map(n => [n.id, n.nombre])), [datos.niveles])
  const abogadosMap = useMemo(() => new Map(datos.abogados.map(a => [a.id, nombreAbogado(a)])), [datos.abogados])
  const porNivel = useMemo(() => tabla(datos.tarifas.filter(t => t.nivel === 'tipo'), { niveles: nivelesMap }), [datos.tarifas, nivelesMap])
  const propias = useMemo(() => tabla(datos.tarifas.filter(t => t.nivel === 'abogado'), { abogados: abogadosMap }), [datos.tarifas, abogadosMap])
  const proyectos = datos.tarifas.filter(t => t.proyecto_id != null).length

  const guardarGeneral = (moneda: Moneda, monto: number) => run(async () => {
    const actual = gen[moneda]
    if (actual) await updateTarifa(org, actual.id, monto); else await createTarifa(org, { moneda, tarifa: monto })
    toast.success(`Tarifa general en ${moneda} guardada.`)
    await recargar()
  }, 'No se guardó la tarifa')
  const quitar = (t: Tarifa) => run(async () => {
    if (!confirmarQuitar(t, 'general del despacho')) return
    await deleteTarifa(org, t.id); toast.success('Tarifa quitada.'); await recargar()
  }, 'No se quitó la tarifa')

  return (
    <div className="space-y-4">
      {!!datos.cobertura?.sin_cobertura.length && (
        <Aviso>
          <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
          {datos.cobertura.sin_cobertura.length} abogado(s) activo(s) sin tarifa base en {datos.cobertura.monedas_requeridas.join(' o ')}:{' '}
          {datos.cobertura.sin_cobertura.map(a => `${a.nombre} (falta ${a.faltan.join(', ')})`).join('; ')}.
          {' '}Sus tiempos en esa moneda saldrían sin tarifa salvo que el cliente o el proyecto tengan una. Ponles tarifa en su nivel, una propia o una general.
        </Aviso>
      )}

      <Section icon={Scale} title="Tarifa general del despacho" subtitle="La última de la jerarquía: aplica cuando el abogado no tiene tarifa en ningún otro nivel.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MONEDAS.map(m => (
            <div key={m} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">{m}</span>
              <CeldaTarifa tarifa={gen[m]} moneda={m} editable saving={saving} onSave={n => guardarGeneral(m, n)} onDelete={quitar} />
            </div>
          ))}
        </div>
      </Section>

      <Section icon={Layers} title="Tarifa por nivel" subtitle="Solo consulta. Cada nivel tiene su tarifa por moneda."
        actions={<LinkBtn href={firmUrl(org)}>Editar en Niveles</LinkBtn>}>
        <TablaTarifas filas={porNivel} editable={false} saving={saving} vacio="Ningún nivel tiene tarifa." />
      </Section>

      <Section icon={UserRound} title="Tarifa propia del abogado" subtitle="Solo consulta. Gana sobre la de su nivel."
        actions={<LinkBtn href={lawyersUrl(org)}>Editar en Abogados</LinkBtn>}>
        <TablaTarifas filas={propias} editable={false} saving={saving} vacio="Ningún abogado tiene tarifa propia." />
      </Section>

      <Section icon={Receipt} title="Qué tarifa gana" subtitle="De la más específica a la más general, por moneda. Se usa la primera que exista.">
        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-slate-600 list-decimal pl-5">
          {JERARQUIA.map(n => <li key={n}>{NIVEL_LABEL[n]}{n.startsWith('proyecto') ? ' (Configuración del proyecto)' : ''}</li>)}
        </ol>
        {!!proyectos && <p className="mt-2 text-[11px] text-slate-500">Hay {proyectos} tarifa(s) de proyecto; se editan en Configuración del proyecto.</p>}
      </Section>
    </div>
  )
}

// ── Clientes: IVA, idioma y tarifas ──
export function ClientesTab({ org, datos, run, saving, recargar, clientes, impuestos }: Comun & {
  clientes: { rows: Cliente[]; loading: boolean; error: string; reload: () => void }; impuestos: Impuesto[]
}) {
  const options = useMemo(() => clienteOptions(clientes.rows), [clientes.rows])
  const conTarifas = useMemo(() => clientesConTarifas(datos.tarifas), [datos.tarifas])
  const [clienteId, setClienteId] = useState('')

  const [cfg, setCfg] = useState<ClienteConfig | null>(null)
  const [cfgError, setCfgError] = useState('')
  const [form, setForm] = useState({ zoho_tax_id: '', idioma: '' })
  useEffect(() => {
    if (!clienteId) return
    let vivo = true
    setCfg(null); setCfgError('')
    getClienteConfig(org, clienteId)
      .then(c => { if (vivo) { setCfg(c); setForm({ zoho_tax_id: c.zoho_tax_id ?? '', idioma: c.idioma ?? '' }) } })
      .catch(e => { if (vivo) setCfgError(e instanceof Error ? e.message : 'No se pudo cargar el cliente.') })
    return () => { vivo = false }
  }, [org, clienteId])
  const cambios = cfg ? diffClienteConfig(cfg, form) : {}
  const guardarCfg = () => run(async () => {
    if (!cfg || !Object.keys(cambios).length) return
    const r = await patchClienteConfig(org, clienteId, cambios)
    const fresco = r && (r as ClienteConfig).cliente_id ? r as ClienteConfig : await getClienteConfig(org, clienteId)
    setCfg(fresco); setForm({ zoho_tax_id: fresco.zoho_tax_id ?? '', idioma: fresco.idioma ?? '' })
    toast.success('IVA e idioma del cliente guardados.')
  }, 'No se guardó el cliente')

  const nivelesMap = useMemo(() => new Map(datos.niveles.map(n => [n.id, n.nombre])), [datos.niveles])
  const abogadosMap = useMemo(() => new Map(datos.abogados.map(a => [a.id, nombreAbogado(a)])), [datos.abogados])
  const propias = useMemo(() => (clienteId ? tarifasDeCliente(datos.tarifas, clienteId) : []), [datos.tarifas, clienteId])
  const filas = useMemo(() => tabla(propias, { niveles: nivelesMap, abogados: abogadosMap }), [propias, nivelesMap, abogadosMap])
  const nombreCliente = cfg?.nombre || options.find(o => o.ID === clienteId)?.display || conTarifas.find(c => c.id === clienteId)?.nombre || ''

  const guardarCelda = (fila: FilaTarifas, moneda: Moneda, monto: number) => run(async () => {
    const actual = fila.porMoneda[moneda]
    if (actual) await updateTarifa(org, actual.id, monto)
    else await createTarifa(org, { cliente_id: clienteId, moneda, tarifa: monto, ...(fila.quien === 'tipo' ? { tipo_id: fila.id! } : fila.quien === 'abogado' ? { abogado_id: fila.id! } : {}) })
    toast.success('Tarifa del cliente guardada.'); await recargar()
  }, 'No se guardó la tarifa')
  const quitar = (t: Tarifa) => run(async () => {
    if (!confirmarQuitar(t, nombreCliente)) return
    await deleteTarifa(org, t.id); toast.success('Tarifa quitada.'); await recargar()
  }, 'No se quitó la tarifa')

  const vacioForm: FormTarifa = { quien: 'todos', id: '', moneda: (cfg?.moneda as Moneda) || 'MXN', tarifa: '' }
  const [nueva, setNueva] = useState<FormTarifa>(vacioForm)
  const [nuevaError, setNuevaError] = useState('')
  useEffect(() => { setNueva(f => ({ ...f, quien: 'todos', id: '', tarifa: '', moneda: (cfg?.moneda as Moneda) || f.moneda })); setNuevaError('') }, [clienteId, cfg?.moneda])
  const agregar = () => run(async () => {
    let built
    try { built = buildTarifaCliente(clienteId, nueva, datos.tarifas) } catch (e) { setNuevaError(e instanceof Error ? e.message : 'Revisa los datos.'); return }
    setNuevaError('')
    if (built.reemplaza && !window.confirm(`Ya hay una tarifa de ${formatMoney(built.reemplaza.tarifa, built.reemplaza.moneda)} para esta combinación. ¿Reemplazarla por ${formatMoney(built.body.tarifa, built.body.moneda)}?`)) return
    await createTarifa(org, built.body)
    toast.success('Tarifa del cliente agregada.')
    setNueva(f => ({ ...f, tarifa: '' }))
    await recargar()
  }, 'No se agregó la tarifa')

  const abogadosActivos = datos.abogados.filter(a => Number(a.activo) === 1)
  const impuestoActual = impuestos.find(i => i.zoho_id === form.zoho_tax_id)

  return (
    <div className="space-y-4">
      <Section icon={Building2} title="Cliente" subtitle="Clientes de Books. El IVA y las tarifas del cliente aplican a todos sus proyectos que no tengan los suyos.">
        <div className="max-w-xl">
          <SearchSelect label="Cliente" icon={<Building2 className="w-3.5 h-3.5 text-slate-400" />} options={options} value={clienteId} onChange={setClienteId}
            loading={clientes.loading} placeholder="Elegir cliente" searchPlaceholder="Buscar cliente..." emptyText="No se encontraron clientes." onRefresh={clientes.reload} allowClear={false} />
        </div>
        {clientes.error && <div className="mt-2"><Aviso tone="error">{clientes.error}</Aviso></div>}
        {!!conTarifas.length && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Con tarifas propias:</span>
            {conTarifas.map(c => (
              <button key={c.id} type="button" onClick={() => setClienteId(c.id)}
                className={cn('text-xs rounded-full border px-2.5 py-1', clienteId === c.id ? 'bg-theme-light border-theme-border text-theme-text font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                {c.nombre} <span className="text-slate-400">{c.total}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {clienteId && (
        <>
          <Section icon={Globe2} title="IVA e idioma de la factura" subtitle={nombreCliente}>
            {cfgError ? <Aviso tone="error">{cfgError}</Aviso> : !cfg ? <p className="text-xs text-slate-500">Cargando…</p> : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <label className="space-y-1"><span className={labelCls}>Impuesto (de Books)</span>
                    <select className={selectCls} value={form.zoho_tax_id} onChange={e => setForm(f => ({ ...f, zoho_tax_id: e.target.value }))}>
                      <option value="">Sin impuesto del cliente</option>
                      {impuestos.map(i => <option key={i.zoho_id} value={i.zoho_id}>{i.nombre} ({i.porcentaje}%){i.tipo === 'tax_group' ? ' · grupo' : ''}</option>)}
                      {form.zoho_tax_id && !impuestoActual && <option value={form.zoho_tax_id}>Impuesto {form.zoho_tax_id} (ya no está en Books)</option>}
                    </select></label>
                  <label className="space-y-1"><span className={labelCls}>Idioma de la factura</span>
                    <select className={selectCls} value={form.idioma} onChange={e => setForm(f => ({ ...f, idioma: e.target.value }))}>
                      <option value="">El del contacto en Books ({IDIOMA_LABEL[cfg.idioma_books ?? ''] ?? cfg.idioma_books ?? 'sin definir'})</option>
                      <option value="es">Español</option><option value="en">Inglés</option>
                    </select></label>
                  <div className="flex gap-2">
                    <Button variant="outline" className="h-9 border-slate-200" disabled={saving || !Object.keys(cambios).length} onClick={() => setForm({ zoho_tax_id: cfg.zoho_tax_id ?? '', idioma: cfg.idioma ?? '' })}>Descartar</Button>
                    <Button className={cn('h-9 border-0', gradientBtnCls)} disabled={saving || !Object.keys(cambios).length} onClick={() => void guardarCfg()}>Guardar</Button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Moneda del cliente en Books: <span className="font-semibold">{cfg.moneda || '—'}</span> (la heredan sus proyectos nuevos).
                  {' '}Las facturas salen en <span className="font-semibold">{IDIOMA_LABEL[cfg.idioma_factura ?? ''] ?? cfg.idioma_factura}</span>.
                  {impuestoActual?.tipo === 'tax_group' && ' Es un grupo con retenciones: se manda a Books tal cual.'}
                  {' '}Un proyecto con impuesto propio usa el suyo.
                </p>
              </div>
            )}
          </Section>

          <Section icon={Scale} title="Tarifas del cliente" subtitle="Ganan sobre la tarifa propia del abogado, la de su nivel y la general. Por abogado gana sobre por nivel, y esta sobre la de todos.">
            <TablaTarifas filas={filas} editable saving={saving} onSave={guardarCelda} onDelete={quitar} vacio="Este cliente no tiene tarifas propias: usa las del abogado, su nivel o la general." />
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Agregar tarifa</p>
              <div className="grid grid-cols-2 lg:grid-cols-[150px_minmax(0,1fr)_110px_140px_auto] gap-2 items-end">
                <label className="space-y-1"><span className={labelCls}>Aplica a</span>
                  <select className={selectCls} value={nueva.quien} onChange={e => setNueva(f => ({ ...f, quien: e.target.value as FormTarifa['quien'], id: '' }))}>
                    <option value="todos">Todos los abogados</option><option value="tipo">Un nivel</option><option value="abogado">Un abogado</option>
                  </select></label>
                <label className="space-y-1"><span className={labelCls}>{nueva.quien === 'abogado' ? 'Abogado' : nueva.quien === 'tipo' ? 'Nivel' : ' '}</span>
                  {nueva.quien === 'todos' ? <div className="h-9" /> : (
                    <select className={selectCls} value={nueva.id} onChange={e => setNueva(f => ({ ...f, id: e.target.value }))}>
                      <option value="">Elegir…</option>
                      {nueva.quien === 'tipo'
                        ? datos.niveles.map(n => <option key={n.id} value={n.id}>{n.nombre}</option>)
                        : abogadosActivos.map(a => <option key={a.id} value={a.id}>{nombreAbogado(a)}{a.tipo_nombre ? ` · ${a.tipo_nombre}` : ''}</option>)}
                    </select>
                  )}</label>
                <label className="space-y-1"><span className={labelCls}>Moneda</span>
                  <select className={selectCls} value={nueva.moneda} onChange={e => setNueva(f => ({ ...f, moneda: e.target.value as Moneda }))}>
                    {MONEDAS.map(m => <option key={m}>{m}</option>)}
                  </select></label>
                <label className="space-y-1"><span className={labelCls}>Tarifa por hora</span>
                  <Input inputMode="decimal" className={cn(inputCls, 'text-right')} placeholder="0.00" value={nueva.tarifa} onChange={e => setNueva(f => ({ ...f, tarifa: e.target.value }))} /></label>
                <Button className={cn('h-9 border-0 col-span-2 lg:col-span-1', gradientBtnCls)} disabled={saving} onClick={() => void agregar()}>Agregar</Button>
              </div>
              {nuevaError && <p role="alert" className="mt-2 text-xs text-red-700">{nuevaError}</p>}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
