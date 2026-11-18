import { API_BASE } from './api'

// Tarifas del despacho y de cada cliente, e IVA e idioma por cliente (ReportesSandbox vía
// aptus_settings_services). No escribe en Books. Aquí se editan la tarifa general y las de cliente;
// la propia del abogado, la del nivel y las de proyecto se muestran como consulta con su enlace.
export interface Option { ID: string; display: string; secondary?: string; fotoUrl?: string }

export const MONEDAS = ['MXN', 'USD', 'EUR'] as const
export type Moneda = typeof MONEDAS[number]
export type NivelTarifa = 'proyecto_abogado' | 'proyecto_tipo' | 'proyecto' | 'cliente_abogado' | 'cliente_tipo' | 'cliente' | 'abogado' | 'tipo' | 'general'

export interface Tarifa {
  id: number; moneda: Moneda; tarifa: number; nivel: NivelTarifa; nivel_etiqueta?: string; nivel_orden?: number
  proyecto_id?: number | null; proyecto_nombre?: string | null; cliente_id?: string | null; cliente_nombre?: string | null
  abogado_id?: number | null; abogado_nombre?: string | null; tipo_id?: number | null; tipo_nombre?: string | null; actualizado_en?: string
}
export interface Nivel { id: number; nombre: string }
export interface Abogado { id: number; nombre: string; zoho_user_nombre?: string | null; activo: number; tipo_id?: number | null; tipo_nombre?: string | null }
export interface Cliente { id: string; zoho_id?: string; nombre: string; status?: string; moneda?: string }
export interface Impuesto { zoho_id: string; nombre: string; porcentaje: number; tipo?: string }
export interface ClienteConfig {
  cliente_id: string; nombre: string; moneda?: string; idioma_books?: string | null; idioma?: string | null; idioma_factura?: string
  zoho_tax_id?: string | null; impuesto?: Impuesto | null
}
export interface TarifaBase { tarifa: number; nivel: string; nivel_etiqueta?: string }
export interface Cobertura {
  monedas_requeridas: string[]
  sin_cobertura: { abogado_id: number; nombre: string; faltan: string[]; tarifas_base?: Partial<Record<Moneda, TarifaBase | null>> }[]
  abogados: { abogado_id: number; nombre: string; faltan: string[]; tarifas_base?: Partial<Record<Moneda, TarifaBase | null>> }[]
}

// ── Lectura y escritura ──
type Uncertain = Error & { uncertain?: boolean }
const fail = (message: string, uncertain: boolean) => Object.assign(new Error(message), { uncertain }) as Uncertain
const url = (org: string, path: string) => `${API_BASE}/${encodeURIComponent(org)}/${path}`

async function read<T>(org: string, path: string, valid: (d: unknown) => boolean): Promise<T> {
  let response: Response
  try { response = await fetch(url(org, path)) } catch { throw new Error('No hay conexión con el servicio de Aptus.') }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `No se pudo cargar ${path.split('?')[0]}.`)
  if (!valid(data)) throw new Error('Respuesta inesperada del servicio de Aptus.')
  return data as T
}

// Red caída o respuesta sin la forma esperada = resultado incierto.
async function write<T>(org: string, method: 'POST' | 'PATCH' | 'DELETE', path: string, body: unknown, ok: (data: unknown) => boolean): Promise<T> {
  let response: Response
  try {
    response = await fetch(url(org, path), { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) })
  } catch {
    throw fail('Se perdió la respuesta. Recarga para comprobar si el cambio se guardó.', true)
  }
  const data = await response.json().catch(() => null)
  if (!response.ok && !data && response.status >= 400 && response.status < 500) {
    throw fail(response.status === 404 ? 'La función de Catalyst no tiene esta ruta (HTTP 404). Despliega la versión actual de aptus_settings_services.' : `El servidor rechazó la petición (HTTP ${response.status}).`, false)
  }
  if (!response.ok) {
    const uncertain = data?.outcome_unknown === true || !data?.stage
    throw fail(`${data?.error || 'No se pudo confirmar el cambio.'}${uncertain ? ' Recarga para comprobar si se guardó.' : ''}`, uncertain)
  }
  if (!ok(data)) throw fail('No se pudo confirmar el cambio. Recarga para comprobar si se guardó.', true)
  return data as T
}
const isArr = (d: unknown) => Array.isArray(d)
const isObj = (d: unknown) => !!d && typeof d === 'object' && !Array.isArray(d)
const hasId = (d: unknown) => Number.isInteger((d as { id?: unknown })?.id)

export const getTarifas = (org: string) => read<Tarifa[]>(org, 'tarifas', isArr)
export const getCobertura = (org: string) => read<Cobertura>(org, 'tarifas/cobertura', d => isObj(d) && Array.isArray((d as Cobertura).sin_cobertura))
export const getNiveles = (org: string) => read<Nivel[]>(org, 'tipos-abogado', isArr)
export const getAbogados = (org: string) => read<Abogado[]>(org, 'abogados', isArr)
export const getClientes = (org: string) => read<Cliente[]>(org, 'clientes', isArr)
export const getImpuestos = (org: string) => read<Impuesto[]>(org, 'impuestos', isArr)
export const getClienteConfig = (org: string, id: string) => read<ClienteConfig>(org, `clientes/${encodeURIComponent(id)}/config`, isObj)

export interface TarifaBody { moneda: Moneda; tarifa: number; cliente_id?: string; abogado_id?: number; tipo_id?: number }
export const createTarifa = (org: string, body: TarifaBody) => write<Tarifa>(org, 'POST', 'tarifas', body, hasId)
export const updateTarifa = (org: string, id: number, tarifa: number) => write<Tarifa>(org, 'PATCH', `tarifas/${id}`, { tarifa }, hasId)
export const deleteTarifa = (org: string, id: number) => write<unknown>(org, 'DELETE', `tarifas/${id}`, null, () => true) // 2xx basta: la respuesta del borrado no trae forma fija
export const patchClienteConfig = (org: string, id: string, body: { zoho_tax_id?: string; idioma?: string }) =>
  write<ClienteConfig>(org, 'PATCH', `clientes/${encodeURIComponent(id)}/config`, body, isObj)

// ── Lógica pura ──
export const nombreAbogado = (a: Abogado) => a.zoho_user_nombre || a.nombre
export const NIVEL_LABEL: Record<NivelTarifa, string> = {
  proyecto_abogado: 'Proyecto + abogado', proyecto_tipo: 'Proyecto + nivel', proyecto: 'Proyecto',
  cliente_abogado: 'Cliente + abogado', cliente_tipo: 'Cliente + nivel', cliente: 'Cliente (todos)',
  abogado: 'Tarifa propia del abogado', tipo: 'Nivel del abogado', general: 'General del despacho',
}
// Orden de la jerarquía (1 = la más específica gana).
export const JERARQUIA: NivelTarifa[] = ['proyecto_abogado', 'proyecto_tipo', 'proyecto', 'cliente_abogado', 'cliente_tipo', 'cliente', 'abogado', 'tipo', 'general']

// "1,234.5" → 1234.5; hasta 2 decimales y 10,000,000; vacío = null.
export function parseMonto(value: string, campo = 'Tarifa'): number | null {
  const clean = value.trim().replace(/,/g, '')
  if (!clean) return null
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) throw new Error(`${campo}: escribe un monto válido con hasta 2 decimales.`)
  const n = Number(clean)
  if (n > 1e7) throw new Error(`${campo}: el monto es demasiado grande.`)
  return n
}
export function formatMoney(n: number | null | undefined, moneda?: string) {
  if (n == null) return '—'
  const s = Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return moneda ? `${s} ${moneda}` : s
}

export const generales = (tarifas: Tarifa[]) => Object.fromEntries(MONEDAS.map(m => [m, tarifas.find(t => t.nivel === 'general' && t.moneda === m) ?? null])) as Record<Moneda, Tarifa | null>

// Tabla quién × moneda para un conjunto de tarifas (niveles, abogados o las de un cliente).
export interface FilaTarifas { key: string; quien: 'todos' | 'tipo' | 'abogado'; id: number | null; nombre: string; porMoneda: Record<Moneda, Tarifa | null> }
export function tabla(tarifas: Tarifa[], nombres: { niveles?: Map<number, string>; abogados?: Map<number, string> } = {}): FilaTarifas[] {
  const rows = new Map<string, FilaTarifas>()
  for (const t of tarifas) {
    const quien = t.abogado_id != null ? 'abogado' : t.tipo_id != null ? 'tipo' : 'todos'
    const id = quien === 'abogado' ? t.abogado_id! : quien === 'tipo' ? t.tipo_id! : null
    const key = `${quien}:${id ?? ''}`
    const nombre = quien === 'todos' ? 'Todos los abogados'
      : quien === 'tipo' ? (nombres.niveles?.get(id!) ?? t.tipo_nombre ?? `Nivel ${id}`)
      : (nombres.abogados?.get(id!) ?? t.abogado_nombre ?? `Abogado ${id}`)
    const row = rows.get(key) ?? { key, quien, id, nombre, porMoneda: { MXN: null, USD: null, EUR: null } }
    row.porMoneda[t.moneda] = t
    rows.set(key, row)
  }
  const orden = { todos: 0, tipo: 1, abogado: 2 }
  return [...rows.values()].sort((a, b) => orden[a.quien] - orden[b.quien] || a.nombre.localeCompare(b.nombre, 'es'))
}

export const tarifasDeCliente = (tarifas: Tarifa[], clienteId: string) =>
  tarifas.filter(t => t.cliente_id === clienteId && t.proyecto_id == null)

// Clientes que tienen tarifas propias (para elegirlos rápido).
export function clientesConTarifas(tarifas: Tarifa[]): { id: string; nombre: string; total: number }[] {
  const m = new Map<string, { id: string; nombre: string; total: number }>()
  for (const t of tarifas) {
    if (!t.cliente_id || t.proyecto_id != null) continue
    const c = m.get(t.cliente_id) ?? { id: t.cliente_id, nombre: t.cliente_nombre || t.cliente_id, total: 0 }
    c.total += 1; m.set(t.cliente_id, c)
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// Alta de tarifa de cliente: para todos, por nivel o por abogado. Devuelve el cuerpo y, si ya hay
// una tarifa con la misma combinación y moneda, cuál se reemplaza (la API reemplaza en lugar de duplicar).
export interface FormTarifa { quien: 'todos' | 'tipo' | 'abogado'; id: string; moneda: Moneda; tarifa: string }
export function buildTarifaCliente(clienteId: string, f: FormTarifa, existentes: Tarifa[]): { body: TarifaBody; reemplaza: Tarifa | null } {
  const tarifa = parseMonto(f.tarifa)
  if (tarifa == null) throw new Error('Escribe la tarifa.')
  const body: TarifaBody = { cliente_id: clienteId, moneda: f.moneda, tarifa }
  if (f.quien !== 'todos') {
    const id = Number(f.id)
    if (!Number.isInteger(id) || id <= 0) throw new Error(f.quien === 'tipo' ? 'Elige el nivel.' : 'Elige el abogado.')
    if (f.quien === 'tipo') body.tipo_id = id; else body.abogado_id = id
  }
  const reemplaza = existentes.find(t => t.cliente_id === clienteId && t.proyecto_id == null && t.moneda === f.moneda
    && (t.abogado_id ?? null) === (body.abogado_id ?? null) && (t.tipo_id ?? null) === (body.tipo_id ?? null)) ?? null
  return { body, reemplaza }
}

// Cambios de IVA e idioma del cliente: solo lo que cambió. '' = quitar (IVA) o el de Books (idioma).
export function diffClienteConfig(c: ClienteConfig, f: { zoho_tax_id: string; idioma: string }) {
  const body: { zoho_tax_id?: string; idioma?: string } = {}
  if (f.zoho_tax_id !== (c.zoho_tax_id ?? '')) body.zoho_tax_id = f.zoho_tax_id
  if (f.idioma !== (c.idioma ?? '')) body.idioma = f.idioma
  return body
}

export const clienteOptions = (rows: Cliente[]): Option[] =>
  rows.filter(c => c.status !== 'inactive').map(c => ({ ID: String(c.zoho_id ?? c.id), display: c.nombre, secondary: c.moneda }))
export const IDIOMA_LABEL: Record<string, string> = { es: 'Español', en: 'Inglés' }
