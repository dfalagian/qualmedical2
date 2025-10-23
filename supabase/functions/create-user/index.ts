import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting create-user function");
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header");
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    console.log("Verifying user token");
    
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError) {
      console.error("User error:", userError);
      throw new Error("Error al verificar usuario: " + userError.message);
    }
    
    if (!user) {
      console.error("No user found");
      throw new Error("Usuario no encontrado");
    }

    console.log("User verified:", user.id);

    // Check if user is admin
    console.log("Checking admin role for user:", user.id);
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    console.log("Role check result:", { roleData, roleError });

    if (roleError) {
      console.error("Role error:", roleError);
      throw new Error("Error al verificar permisos: " + roleError.message);
    }
    
    if (!roleData) {
      console.error("User is not admin");
      throw new Error("Solo los administradores pueden crear usuarios");
    }

    console.log("Admin verified, proceeding with user creation");

    const { email, password, full_name, role, company_name, rfc, phone } = await req.json();
    console.log("Creating user with email:", email, "role:", role);

    // Validate required fields
    if (!email || !password || !full_name || !role) {
      throw new Error("Email, contraseña, nombre completo y rol son obligatorios");
    }

    // Validate role is valid
    const validRoles = ['admin', 'proveedor'];
    if (!validRoles.includes(role)) {
      throw new Error(`Rol inválido. Debe ser uno de: ${validRoles.join(', ')}`);
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
      },
    });

    if (authError) {
      console.error("Auth error:", authError);
      let errorMessage = "Error al crear autenticación";
      
      if (authError.message.includes("already been registered") || authError.message.includes("email_exists")) {
        errorMessage = "Este email ya está registrado en el sistema";
      } else {
        errorMessage = authError.message;
      }
      
      throw new Error(errorMessage);
    }
    
    if (!authData.user) {
      console.error("No user data returned");
      throw new Error("No se pudo crear el usuario");
    }

    console.log("Auth user created:", authData.user.id);

    // Create profile
    console.log("Creating profile for user:", authData.user.id);
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: authData.user.id,
        email,
        full_name,
        company_name: company_name || null,
        rfc: rfc || null,
        phone: phone || null,
      });

    if (profileError) {
      console.error("Profile error:", profileError);
      throw new Error("Error al crear perfil: " + profileError.message);
    }

    console.log("Profile created successfully");

    // Assign role
    console.log("Assigning role:", role);
    const { error: roleInsertError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: authData.user.id,
        role,
      });

    if (roleInsertError) {
      console.error("Role insert error:", roleInsertError);
      throw new Error("Error al asignar rol: " + roleInsertError.message);
    }

    console.log("User created successfully:", authData.user.id);

    return new Response(
      JSON.stringify({ success: true, user: authData.user }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
