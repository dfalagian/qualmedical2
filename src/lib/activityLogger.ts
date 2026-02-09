import { supabase } from "@/integrations/supabase/client";

export type ActivitySection = 
  | "inventario" 
  | "cotizaciones" 
  | "compras_ventas" 
  | "catalogo" 
  | "ordenes_compra";

export type ActivityAction = 
  | "crear" 
  | "editar" 
  | "eliminar" 
  | "importar" 
  | "vincular" 
  | "desvincular"
  | "estado" 
  | "cargar"
  | "aprobar"
  | "cancelar"
  | "ingreso"
  | "salida"
  | "transferencia";

interface LogActivityParams {
  section: ActivitySection;
  action: ActivityAction;
  entityType: string;
  entityId?: string;
  entityName?: string;
  details?: Record<string, any>;
}

/**
 * Registra una actividad en la bitácora.
 * Se ejecuta en background (fire-and-forget) para no bloquear la UI.
 */
export async function logActivity({
  section,
  action,
  entityType,
  entityId,
  entityName,
  details = {},
}: LogActivityParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get profile info for the log
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    await supabase.from("activity_log").insert({
      user_id: user.id,
      user_email: profile?.email || user.email || "",
      user_name: profile?.full_name || user.email || "",
      section,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      entity_name: entityName || null,
      details,
    });
  } catch (err) {
    // Silent fail - don't break the app for logging
    console.error("Error logging activity:", err);
  }
}
