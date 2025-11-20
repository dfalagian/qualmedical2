import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Schema de validación para crear usuario
const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(100),
  full_name: z.string().min(1).max(100),
  role: z.enum(['admin', 'proveedor', 'contador']),
  company_name: z.string().max(100).nullable().optional(),
  rfc: z.string().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/).nullable().optional(),
  phone: z.string().max(20).nullable().optional()
});

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

    // Parse and validate request body
    const body = await req.json();
    
    let validatedData;
    try {
      validatedData = CreateUserSchema.parse(body);
    } catch (error) {
      console.error('Validation error:', error);
      throw new Error(error instanceof z.ZodError 
        ? `Datos inválidos: ${error.errors.map(e => e.message).join(', ')}`
        : 'Formato de datos incorrecto');
    }

    const { email, password, full_name, role, company_name, rfc, phone } = validatedData;
    console.log("Creating user with email:", email, "role:", role);

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

    // Create or update profile (using upsert to handle cases where profile already exists from trigger)
    console.log("Creating/updating profile for user:", authData.user.id);
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: authData.user.id,
        email,
        full_name,
        company_name: company_name || null,
        rfc: rfc || null,
        phone: phone || null,
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error("Profile error:", profileError);
      throw new Error("Error al crear perfil: " + profileError.message);
    }

    console.log("Profile created successfully");

    // Assign role - CRITICAL: This must succeed or the user won't have proper access
    console.log("Assigning role:", role, "to user:", authData.user.id);
    
    // First, try to insert the role
    const { data: insertedRole, error: roleInsertError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: authData.user.id,
        role,
      })
      .select()
      .single();

    if (roleInsertError) {
      console.error("Role insert error:", roleInsertError);
      console.error("Error details:", JSON.stringify(roleInsertError, null, 2));
      
      // If it's a duplicate error, check if role already exists
      if (roleInsertError.code === '23505') {
        console.log("Role already exists, checking if it's correct");
        const { data: existingRole, error: checkError } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", authData.user.id)
          .eq("role", role)
          .single();
        
        if (checkError || !existingRole) {
          console.error("Role check error or role doesn't match:", checkError);
          throw new Error("Error al verificar rol del usuario: " + (checkError?.message || "Rol no coincide"));
        }
        console.log("Existing role is correct:", existingRole.role);
      } else {
        throw new Error("Error al asignar rol: " + roleInsertError.message);
      }
    } else {
      console.log("Role assigned successfully:", insertedRole);
    }

    console.log("User created successfully with role:", authData.user.id);

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
