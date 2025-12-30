import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Client with service role for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get auth header to identify the requesting supplier
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode JWT to get supplier ID
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !requestingUser) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supplierId = requestingUser.id;
    console.log('Supplier ID:', supplierId);

    // Verify the requesting user is a proveedor
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', supplierId)
      .single();

    if (roleError || userRole?.role !== 'proveedor') {
      console.error('Role check failed:', roleError, userRole);
      return new Response(
        JSON.stringify({ error: 'Solo los proveedores pueden crear contadores' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if supplier already has a contador
    const { data: existingContador, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('parent_supplier_id', supplierId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing contador:', checkError);
    }

    if (existingContador) {
      return new Response(
        JSON.stringify({ error: 'Ya tienes un contador registrado', existingContador }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { email, password, fullName } = await req.json();

    if (!email || !password || !fullName) {
      return new Response(
        JSON.stringify({ error: 'Email, contraseña y nombre son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Formato de email inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating contador user for supplier:', supplierId, 'with email:', email);

    // Get supplier profile info
    const { data: supplierProfile } = await supabaseAdmin
      .from('profiles')
      .select('company_name, full_name')
      .eq('id', supplierId)
      .single();

    // Create the contador user
    const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        parent_supplier_id: supplierId,
      }
    });

    if (createUserError) {
      console.error('Error creating user:', createUserError);
      return new Response(
        JSON.stringify({ error: createUserError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contadorId = newUser.user.id;
    console.log('Created contador user with ID:', contadorId);

    // Update profile with parent_supplier_id
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        parent_supplier_id: supplierId,
        full_name: fullName,
        company_name: supplierProfile?.company_name,
      })
      .eq('id', contadorId);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      // Don't fail completely, the user is created
    }

    // Delete the default 'proveedor' role that was auto-assigned
    const { error: deleteRoleError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', contadorId);

    if (deleteRoleError) {
      console.error('Error deleting default role:', deleteRoleError);
    }

    // Assign contador_proveedor role
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: contadorId,
        role: 'contador_proveedor'
      });

    if (roleInsertError) {
      console.error('Error assigning role:', roleInsertError);
      return new Response(
        JSON.stringify({ error: 'Error al asignar rol de contador' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully created contador for supplier:', supplierId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Contador creado exitosamente',
        contador: {
          id: contadorId,
          email: email,
          fullName: fullName
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
