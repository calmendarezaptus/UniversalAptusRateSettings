# Tarifas y clientes

Slate del proyecto Configuración (`SettingsForAptusFinancials`). Todo se guarda en Aptus (ReportesSandbox);
no escribe en Books.

- **Tarifas del despacho**: tarifa general por moneda (editable); tarifa por nivel y tarifa propia del
  abogado como consulta, con enlace a donde se editan; aviso de abogados sin tarifa base (cobertura);
  orden de la jerarquía.
- **Clientes**: buscador de clientes de Books (y atajo a los que ya tienen tarifas), IVA (impuesto de
  Books) e idioma de la factura, y tarifas del cliente para todos, por nivel o por abogado.

Las tarifas de proyecto se editan en Configuración del proyecto (Consolidado).
Abre con `?organization_id=<org de Books>`; opcional `?origin=` para el botón Regresar.
Variables (opcionales): `VITE_API_BASE_URL`, `VITE_CALENDAR_URL`, `VITE_LAWYERS_URL`, `VITE_FIRM_URL`.

```bash
npm install
npm test
npm run build   # salida en dist/
```
