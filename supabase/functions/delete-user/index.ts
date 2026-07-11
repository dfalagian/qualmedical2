import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Schema de validaciÃ³n para eliminar usuario
const DeleteUserSchema = z.object({
  userId: z.string().uuid()
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get the JWT token and decode it to get the user ID
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No se proporcionÃ³ autorizaciÃ³n');
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Decode JWT to get user ID (Supabase already verified the JWT)
    const jwtPayload = JSON.parse(atob(token.split('.')[1]));
    const requestingUserId = jwtPayload.sub;

    if (!requestingUserId) {
      console.error('No user ID in JWT');
      throw new Error('No autorizado');
    }

    // Check if requesting user is admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUserId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('Admin check failed:', roleError);
      throw new Error('No tienes permisos de administrador');
    }

    // Parse and validate request body
    const body = await req.json();
    
    let validatedData;
    try {
      validatedData = DeleteUserSchema.parse(body);
    } catch (error) {
      console.error('Validation error:', error);
      throw new Error('userId debe ser un UUID vÃ¡lido');
    }

    const { userId } = validatedData;

    console.log('Deleting user:', userId);

    // Delete user roles first
    const { error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    if (rolesError) {
      console.error('Error deleting roles:', rolesError);
      throw new Error('Error al eliminar roles del usuario');
    }

    // NULL out all nullable FK references to profiles(id) that lack ON DELETE CASCADE/SET NULL.
    // Without this, the profile deletion fails with a FK violation if the user was referenced
    // as reviewer, creator, approver, etc. in any of these tables.
    const nullifyUpdates = [
      supabaseAdmin.from('documents').update({ reviewed_by: null }).eq('reviewed_by', userId),
      supabaseAdmin.from('purchase_orders').update({ created_by: null }).eq('created_by', userId),
      supabaseAdmin.from('products').update({ supplier_id: null }).eq('supplier_id', userId),
      supabaseAdmin.from('inventory_movements').update({ created_by: null }).eq('created_by', userId),
      supabaseAdmin.from('stock_alerts').update({ resolved_by: null }).eq('resolved_by', userId),
      supabaseAdmin.from('product_price_history').update({ created_by: null }).eq('created_by', userId),
      supabaseAdmin.from('purchase_order_items').update({ price_updated_by: null }).eq('price_updated_by', userId),
      supabaseAdmin.from('quotes').update({ approved_by: null }).eq('approved_by', userId),
      supabaseAdmin.from('quotes').update({ cancelled_by: null }).eq('cancelled_by', userId),
      supabaseAdmin.from('warehouse_transfers').update({ created_by: null }).eq('created_by', userId),
    ];

    const nullifyResults = await Promise.all(nullifyUpdates);
    for (const { error } of nullifyResults) {
      if (error) {
        console.error('Error nullifying FK reference:', error);
        throw new Error('Error al limpiar referencias del usuario');
      }
    }

    // Delete profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
      throw new Error('Error al eliminar perfil del usuario');
    }

    // Finally delete auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError);
      throw new Error('Error al eliminar usuario de autenticaciÃ³n');
    }

    console.log('User deleted successfully:', userId);

    return new Response(
      JSON.stringify({ success: true, message: 'Usuario eliminado correctamente' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in delete-user function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
