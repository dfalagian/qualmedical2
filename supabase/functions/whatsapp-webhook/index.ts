import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET = Meta webhook verification
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (mode === "subscribe" && token === verifyToken) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }

    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // POST = Incoming messages from WhatsApp
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Webhook received:", JSON.stringify(body));

      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Check if it's a message (not a status update)
      if (value?.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const from = message.from; // sender phone number
        const msgBody = message.text?.body || "";
        const timestamp = message.timestamp;
        const contactName = value.contacts?.[0]?.profile?.name || "Desconocido";

        console.log(`Message from ${contactName} (${from}): ${msgBody}`);

        // Store incoming message in database
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        await supabase.from("whatsapp_messages").insert({
          from_phone: from,
          contact_name: contactName,
          message: msgBody,
          direction: "incoming",
          whatsapp_message_id: message.id,
          timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
        });

        console.log("Incoming message stored successfully");
      }

      // Check for status updates (sent, delivered, read)
      if (value?.statuses && value.statuses.length > 0) {
        const status = value.statuses[0];
        console.log(`Status update: ${status.status} for message ${status.id}`);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (error: any) {
      console.error("Webhook error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
