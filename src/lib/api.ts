// Función del proyecto Configuración (SettingsForAptusFinancials): aptus_settings_services.
// Desarrollo usa el proxy de Vite (mismo origen); VITE_API_BASE_URL la reemplaza si se define.
const FALLBACK_API = 'https://settingsforaptusfinancials-730085095.development.catalystserverless.com/server/aptus_settings_services'
export const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || FALLBACK_API).replace(/\/$/, '')

// A dónde regresa "Cancelar" si no llega ?origin= (calendario consolidado).
export const CALENDAR_URL = import.meta.env.VITE_CALENDAR_URL || 'https://universal-aptus-calendar.onslate.com/'

// Pantalla de abogados (marca de responsable, nivel y tarifa propia).
export const LAWYERS_URL = import.meta.env.VITE_LAWYERS_URL || 'https://universal-aptus-lawyersettings.onslate.com/'
export const lawyersUrl = (org: string) => `${LAWYERS_URL}?organization_id=${encodeURIComponent(org)}`

// Configuración del despacho (Catálogos → Niveles: tarifa de cada nivel).
export const FIRM_URL = import.meta.env.VITE_FIRM_URL || 'https://universal-aptus-firmsettings.onslate.com/'
export const firmUrl = (org: string) => `${FIRM_URL}?organization_id=${encodeURIComponent(org)}`
