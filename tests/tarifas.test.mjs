import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const toModule = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8')
const api = read('../src/lib/api.ts').replace(/import\.meta\.env\.DEV/g, 'true').replace(/import\.meta\.env\.\w+/g, 'undefined')
const lib = await import(toModule(read('../src/lib/tarifas.ts').replace("from './api'", `from '${toModule(api)}'`)))

const t = o => ({ id: 1, moneda: 'MXN', tarifa: 1000, nivel: 'general', proyecto_id: null, cliente_id: null, abogado_id: null, tipo_id: null, ...o })
const tarifas = [
  t({ id: 1 }),
  t({ id: 2, moneda: 'USD', tarifa: 60 }),
  t({ id: 3, nivel: 'tipo', tipo_id: 5, tipo_nombre: 'Socio', tarifa: 3500 }),
  t({ id: 4, nivel: 'cliente_abogado', cliente_id: '9', cliente_nombre: 'Go Sharp', abogado_id: 24, abogado_nombre: 'Jenny', tarifa: 2350 }),
  t({ id: 5, nivel: 'cliente', cliente_id: '9', cliente_nombre: 'Go Sharp', moneda: 'USD', tarifa: 120 }),
  t({ id: 6, nivel: 'proyecto_abogado', proyecto_id: 3, cliente_id: '9', abogado_id: 24 }),
  t({ id: 7, nivel: 'cliente_tipo', cliente_id: '8', cliente_nombre: 'Avolar', tipo_id: 5 }),
]

test('parseMonto: comas, 2 decimales, vacío y tope', () => {
  assert.equal(lib.parseMonto('1,234.5'), 1234.5)
  assert.equal(lib.parseMonto('  '), null)
  assert.throws(() => lib.parseMonto('12.345'), /2 decimales/)
  assert.throws(() => lib.parseMonto('-5'), /monto válido/)
  assert.throws(() => lib.parseMonto('20000000'), /grande/)
})

test('generales y tabla quién × moneda', () => {
  const g = lib.generales(tarifas)
  assert.equal(g.MXN.id, 1); assert.equal(g.USD.id, 2); assert.equal(g.EUR, null)
  const filas = lib.tabla(lib.tarifasDeCliente(tarifas, '9'), { abogados: new Map([[24, 'Jenny Morales']]) })
  assert.deepEqual(filas.map(f => [f.key, f.nombre, f.porMoneda.MXN?.id ?? null, f.porMoneda.USD?.id ?? null]), [['todos:', 'Todos los abogados', null, 5], ['abogado:24', 'Jenny Morales', 4, null]])
  assert.equal(lib.tarifasDeCliente(tarifas, '9').some(x => x.proyecto_id != null), false) // las de proyecto no entran
})

test('clientes con tarifas propias (sin contar las de proyecto)', () => {
  assert.deepEqual(lib.clientesConTarifas(tarifas), [{ id: '8', nombre: 'Avolar', total: 1 }, { id: '9', nombre: 'Go Sharp', total: 2 }])
})

test('alta de tarifa de cliente: cuerpo correcto y aviso si reemplaza', () => {
  assert.deepEqual(lib.buildTarifaCliente('9', { quien: 'abogado', id: '24', moneda: 'MXN', tarifa: '2,500' }, tarifas),
    { body: { cliente_id: '9', moneda: 'MXN', tarifa: 2500, abogado_id: 24 }, reemplaza: tarifas[3] })
  assert.deepEqual(lib.buildTarifaCliente('9', { quien: 'todos', id: '', moneda: 'MXN', tarifa: '900' }, tarifas),
    { body: { cliente_id: '9', moneda: 'MXN', tarifa: 900 }, reemplaza: null })
  assert.equal(lib.buildTarifaCliente('8', { quien: 'tipo', id: '5', moneda: 'MXN', tarifa: '1' }, tarifas).reemplaza.id, 7)
  assert.throws(() => lib.buildTarifaCliente('9', { quien: 'tipo', id: '', moneda: 'MXN', tarifa: '1' }, tarifas), /nivel/)
  assert.throws(() => lib.buildTarifaCliente('9', { quien: 'todos', id: '', moneda: 'MXN', tarifa: '' }, tarifas), /Escribe/)
})

test('IVA e idioma: solo lo que cambió', () => {
  const c = { cliente_id: '9', nombre: 'X', zoho_tax_id: '446794000008083135', idioma: null }
  assert.deepEqual(lib.diffClienteConfig(c, { zoho_tax_id: '446794000008083135', idioma: '' }), {})
  assert.deepEqual(lib.diffClienteConfig(c, { zoho_tax_id: '', idioma: 'en' }), { zoho_tax_id: '', idioma: 'en' })
})

test('escrituras: red caída = incierto; error de la API con su mensaje', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => { throw new TypeError('x') }
    await assert.rejects(lib.createTarifa('1', { moneda: 'MXN', tarifa: 1 }), e => e.uncertain === true)
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'La tarifa propia del abogado se edita en Configuración de abogados.', stage: 'validation', outcome_unknown: false }), { status: 403 })
    await assert.rejects(lib.updateTarifa('1', 7, 1), e => e.uncertain === false && /abogados/.test(e.message))
    let req
    globalThis.fetch = async (u, o) => { req = [u, o.method, o.body]; return new Response(JSON.stringify({ id: 4 }), { status: 200 }) }
    await lib.updateTarifa('636939444', 4, 2500)
    assert.deepEqual(req, ['/api/636939444/tarifas/4', 'PATCH', '{"tarifa":2500}'])
  } finally { globalThis.fetch = original }
})
