import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Schema de validación para eliminar usuario
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
      throw new Error('No se proporcionó autorización');
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
      throw new Error('userId debe ser un UUID válido');
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
      throw new Error('Error al eliminar usuario de autenticación');
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
