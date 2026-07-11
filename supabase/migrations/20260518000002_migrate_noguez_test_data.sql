-- =====================================================================
-- MIGRACIÓN DE DATOS DE PRUEBA: FRANCISCO NOGUEZ TREJO
-- Fuente: qualmedical backup 2026-05-17
-- Destino: qualmedical2 (sandbox para pruebas de complemento de pago)
-- =====================================================================

-- IMPORTANTE: Antes de correr este script, crear el usuario auth en
-- Supabase Dashboard → Authentication → Users → Invite user
--   Email:  ninofranciscano24@gmail.com
--   UUID a asignar (copiar el UUID generado y usarlo en los INSERTs si difiere)
-- Si el UUID generado es diferente a f6407529-698d-4ab4-88dd-7fc9f9dccf78,
-- reemplazar ese valor en todo el script.

-- =====================================================================
-- 1. Perfil del proveedor (tabla profiles = usuarios del sistema)
-- =====================================================================
INSERT INTO public.profiles (
  id, email, full_name, phone, company_name, rfc,
  created_at, updated_at, approved, first_login_at, last_login_at,
  tipo_persona, tipo_venta, parent_supplier_id
) VALUES (
  'f6407529-698d-4ab4-88dd-7fc9f9dccf78',
  'ninofranciscano24@gmail.com',
  'FRANCISCO NOGUEZ TREJO',
  '5544690235',
  'FRANCISCO NOGUEZ TREJO',
  'NOTF86020241A',
  '2026-01-24T16:07:47.963Z'::timestamptz,
  '2026-03-10T17:13:31.748Z'::timestamptz,
  TRUE,
  '2026-01-24T16:07:48.180Z'::timestamptz,
  '2026-03-10T17:13:31.748Z'::timestamptz,
  'fisica',
  'medicamentos',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. Rol de proveedor
-- =====================================================================
INSERT INTO public.user_roles (id, user_id, role, created_at)
VALUES (
  'ac19802a-89d3-4de6-8860-237f683e310b',
  'f6407529-698d-4ab4-88dd-7fc9f9dccf78',
  'proveedor',
  '2026-01-24T16:07:47.963Z'::timestamptz
) ON CONFLICT DO NOTHING;

-- =====================================================================
-- 3. Documento datos_bancarios (requerido como FK en pagos)
-- =====================================================================
INSERT INTO public.documents (
  id, supplier_id, document_type, file_url, file_name, status, version,
  notes, reviewed_by, reviewed_at, created_at, updated_at,
  razon_social, representante_legal, objeto_social, registro_publico,
  extracted_at, extraction_status, rfc, actividad_economica,
  regimen_tributario, fecha_emision, codigo_postal, direccion,
  validation_errors, is_valid, nombre_completo_ine, curp, image_urls,
  numero_cuenta, numero_cuenta_clabe, nombre_cliente, nombre_banco, regimen_fiscal
) VALUES (
  'baadf5ae-e785-4075-aea8-c1621ae3ea2f',
  'f6407529-698d-4ab4-88dd-7fc9f9dccf78',
  'datos_bancarios',
  'https://cjhmbqmhfbspgirnkjkm.supabase.co/storage/v1/object/public/documents/f6407529-698d-4ab4-88dd-7fc9f9dccf78/1770486208040_0.pdf',
  'Edo Cta Bancario.pdf',
  'aprobado',
  1,
  NULL,
  '989165e0-c24f-4360-a1dc-1b84536947b5',
  '2026-02-07T18:13:05.077Z'::timestamptz,
  '2026-02-07T17:43:28.569Z'::timestamptz,
  '2026-02-07T18:13:04.070Z'::timestamptz,
  NULL, NULL, NULL, NULL,
  '2026-02-07T17:43:47.684Z'::timestamptz,
  'completed',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '{"✅ Coincidencia confirmada: Nombre del cliente en Datos Bancarios (FRANCISCO NOGUEZ TREJO) coincide con Razón Social en Constancia Fiscal (FRANCISCO NOGUEZ TREJO)"}',
  TRUE,
  NULL, NULL,
  '{"f6407529-698d-4ab4-88dd-7fc9f9dccf78/1770486208040_0_page_1.png"}',
  '70205155617',
  '002212702051556176',
  'FRANCISCO NOGUEZ TREJO',
  NULL,
  NULL
) ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 4. Factura A-47 (datos reales de producción)
--    UUID CFDI: E252ACAB-E9EE-47EE-8229-E305EF947A70
--    Total: $85,142.78 MXN — PPD, requiere complemento de pago
-- =====================================================================
INSERT INTO public.invoices (
  id, supplier_id, invoice_number, amount, currency,
  pdf_url, xml_url, status, payment_date, notes,
  created_at, updated_at,
  emisor_nombre, emisor_rfc, emisor_regimen_fiscal,
  receptor_nombre, receptor_rfc, receptor_uso_cfdi,
  uuid, subtotal, descuento, total_impuestos,
  fecha_emision, lugar_expedicion, forma_pago, metodo_pago,
  requiere_complemento, complemento_pago_url,
  delivery_evidence_url, impuestos_detalle,
  evidence_status, evidence_reviewed_by, evidence_reviewed_at,
  evidence_rejection_reason, rejection_reason
) VALUES (
  'd39816cc-75d1-45f7-aec8-55aaf5924017',
  'f6407529-698d-4ab4-88dd-7fc9f9dccf78',
  'A-47',
  85142.78,
  'MXN',
  'https://cjhmbqmhfbspgirnkjkm.supabase.co/storage/v1/object/public/invoices/f6407529-698d-4ab4-88dd-7fc9f9dccf78/invoices/1773160182765.pdf',
  'https://cjhmbqmhfbspgirnkjkm.supabase.co/storage/v1/object/public/invoices/f6407529-698d-4ab4-88dd-7fc9f9dccf78/invoices/1773160183819.xml',
  'pendiente',
  NULL,
  NULL,
  '2026-03-10T16:29:46.080Z'::timestamptz,
  '2026-03-10T16:29:46.080Z'::timestamptz,
  'FRANCISCO NOGUEZ TREJO',
  'NOTF86020241A',
  '626',
  'QUAL MEDICAL',
  'QME240321HF3',
  'G01',
  'E252ACAB-E9EE-47EE-8229-E305EF947A70',
  86220.54,
  0,
  0,
  '2026-03-05T16:14:08.000Z'::timestamptz,
  '14420',
  '99',
  'PPD',
  TRUE,
  NULL,
  '{}',
  '{"traslados":[{"base":86220.54,"importe":0,"impuesto":"002","tipo_factor":"Tasa","tasa_o_cuota":"0.000000"}],"retenciones":[{"importe":1077.76,"impuesto":"001"}]}'::jsonb,
  'pending',
  NULL,
  NULL,
  NULL,
  NULL
) ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 5. DATOS SINTÉTICOS DE PRUEBA
--    Simula un pago parcial (Parcialidad 1 de 2) para poder probar
--    el flujo de subida del complemento CFDI Pago.
--    El admin "registró" que pagó $42,571.39 (50% de la factura).
-- =====================================================================

INSERT INTO public.pagos (
  id, supplier_id, datos_bancarios_id, invoice_id,
  amount, status, created_at, updated_at, created_by,
  nombre_banco, comprobante_pago_url, fecha_pago,
  is_split_payment, total_installments, original_amount, paid_amount
) VALUES (
  'aaaaaaaa-aaaa-4444-8888-aa0000000001',
  'f6407529-698d-4ab4-88dd-7fc9f9dccf78',
  'baadf5ae-e785-4075-aea8-c1621ae3ea2f',
  'd39816cc-75d1-45f7-aec8-55aaf5924017',
  42571.39,
  'pagado',
  '2026-05-01T10:00:00.000Z'::timestamptz,
  '2026-05-01T10:00:00.000Z'::timestamptz,
  '989165e0-c24f-4360-a1dc-1b84536947b5',
  'BBVA',
  NULL,
  '2026-05-01T00:00:00.000Z'::timestamptz,
  TRUE,
  2,
  85142.78,
  42571.39
) ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 6. Comprobante de pago #1 (Parcialidad 1)
--    El proveedor subirá el complemento CFDI a este comprobante.
-- =====================================================================
INSERT INTO public.payment_proofs (
  id, pago_id, invoice_id, proof_number,
  amount, comprobante_url, fecha_pago, created_at, created_by
) VALUES (
  'bbbbbbbb-bbbb-4444-8888-bb0000000001',
  'aaaaaaaa-aaaa-4444-8888-aa0000000001',
  'd39816cc-75d1-45f7-aec8-55aaf5924017',
  1,
  42571.39,
  NULL,
  '2026-05-01T00:00:00.000Z'::timestamptz,
  '2026-05-01T10:00:00.000Z'::timestamptz,
  '989165e0-c24f-4360-a1dc-1b84536947b5'
) ON CONFLICT (id) DO NOTHING;
