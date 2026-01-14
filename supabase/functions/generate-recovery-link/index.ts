import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RecoveryLinkRequest {
  userId: string;
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify that caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Check if user is admin
    const { data: { user: callerUser } } = await supabaseClient.auth.getUser();
    if (!callerUser) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: isAdmin } = await supabaseClient.rpc("is_admin", { _user_id: callerUser.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Solo administradores pueden generar enlaces de recuperación" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { userId, email }: RecoveryLinkRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email es requerido" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Admin generating recovery link for:", email);

    // Create admin client to generate recovery link
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the base URL for redirect
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    // Convert supabase URL to lovable project URL
    const projectUrl = supabaseUrl.replace("https://", "https://").replace(".supabase.co", ".lovableproject.com");
    
    // Generate recovery link using admin API
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: `${projectUrl}/auth?reset=true`,
      }
    });

    if (linkError) {
      console.error("Error generating recovery link:", linkError);
      return new Response(
        JSON.stringify({ error: "Error al generar enlace: " + linkError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const recoveryLink = linkData.properties?.action_link;
    
    if (!recoveryLink) {
      return new Response(
        JSON.stringify({ error: "No se pudo generar el enlace de recuperación" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Recovery link generated successfully for:", email);

    return new Response(
      JSON.stringify({ 
        success: true, 
        recoveryLink: recoveryLink,
        message: "Enlace de recuperación generado exitosamente" 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in generate-recovery-link:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error al generar enlace de recuperación" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
