-- Agregar campos para validación de evidencias de entrega
ALTER TABLE invoices 
ADD COLUMN evidence_status TEXT DEFAULT 'pending' CHECK (evidence_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN evidence_reviewed_by UUID REFERENCES auth.users(id),
ADD COLUMN evidence_reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN evidence_rejection_reason TEXT;

-- Agregar comentarios
COMMENT ON COLUMN invoices.evidence_status IS 'Estado de validación de las evidencias de entrega: pending, approved, rejected';
COMMENT ON COLUMN invoices.evidence_reviewed_by IS 'ID del administrador que revisó las evidencias';
COMMENT ON COLUMN invoices.evidence_reviewed_at IS 'Fecha y hora de la revisión de evidencias';
COMMENT ON COLUMN invoices.evidence_rejection_reason IS 'Razón del rechazo de las evidencias';