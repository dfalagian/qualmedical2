import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WHATSAPP_MAX_LENGTH = 4096;

async function sendWhatsAppReply(to: string, body: string) {
  // Normalize Mexican numbers: remove the extra '1' after '52'
  let normalizedTo = to.replace(/\D/g, "");
  if (normalizedTo.startsWith("521") && normalizedTo.length === 13) {
    normalizedTo = "52" + normalizedTo.substring(3);
  }
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const chunks: string[] = [];
  if (body.length <= WHATSAPP_MAX_LENGTH) {
    chunks.push(body);
  } else {
    let remaining = body;
    while (remaining.length > 0) {
      if (remaining.length <= WHATSAPP_MAX_LENGTH) {
        chunks.push(remaining);
        break;
      }
      let breakAt = remaining.lastIndexOf("\n", WHATSAPP_MAX_LENGTH);
      if (breakAt < WHATSAPP_MAX_LENGTH * 0.5) {
        breakAt = remaining.lastIndexOf(" ", WHATSAPP_MAX_LENGTH);
      }
      if (breakAt < WHATSAPP_MAX_LENGTH * 0.5) {
        breakAt = WHATSAPP_MAX_LENGTH;
      }
      chunks.push(remaining.substring(0, breakAt));
      remaining = remaining.substring(breakAt).trimStart();
    }
  }

  let lastResult: any = null;
  let allOk = true;
  for (const chunk of chunks) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedTo,
        type: "text",
        text: { preview_url: false, body: chunk },
      }),
    });

    lastResult = await response.json();
    if (!response.ok) {
      console.error("WhatsApp API error:", JSON.stringify(lastResult));
      allOk = false;
      break;
    }
  }

  return { ok: allOk, result: lastResult };
}

async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
  
  // Step 1: Get media URL
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) {
    console.error("Failed to get media URL:", await metaRes.text());
    return null;
  }
  const metaData = await metaRes.json();
  const mediaUrl = metaData.url;
  const mimeType = metaData.mime_type || "application/octet-stream";

  // Step 2: Download the actual file
  const fileRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!fileRes.ok) {
    console.error("Failed to download media:", await fileRes.text());
    return null;
  }
  const buffer = await fileRes.arrayBuffer();
  return { buffer, mimeType };
}

function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
  };
  return map[mimeType] || "bin";
}

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  // Mexican numbers: WhatsApp sends 521XXXXXXXXXX, normalize to 52XXXXXXXXXX
  if (digits.startsWith("521") && digits.length === 13) {
    digits = "52" + digits.substring(3);
  }
  return digits;
}

function normalizePhoneForSending(phone: string): string {
  return normalizePhone(phone);
}

Deno.serve(async (req) => {
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

      if (value?.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const from = message.from;
        const timestamp = message.timestamp;
        const contactName = value.contacts?.[0]?.profile?.name || "Desconocido";

        // Extract text body from different message types
        const msgBody = message.text?.body || message.caption || "";

        console.log(`Message from ${contactName} (${from}): type=${message.type} body=${msgBody}`);

        const normalizedFrom = normalizePhone(from);
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Store incoming message
        await supabase.from("whatsapp_messages").insert({
          from_phone: from,
          contact_name: contactName,
          message: msgBody || `[${message.type}]`,
          direction: "incoming",
          whatsapp_message_id: message.id,
          timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
        });

        console.log("Incoming message stored successfully");

        // Check if sender is an authorized bot user (try both original and normalized phone)
        const { data: botUser } = await supabase
          .from("whatsapp_bot_users")
          .select("*")
          .or(`phone.eq.${from},phone.eq.${normalizedFrom}`)
          .eq("is_active", true)
          .maybeSingle();

        if (botUser) {
          // Route to AI bot
          console.log(`Bot user detected: ${botUser.name} (${from}). Querying AI...`);
          try {
            const botResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-bot-query`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                phone: from,
                question: msgBody,
                contact_name: contactName,
              }),
            });

            const botData = await botResponse.json();
            const reply = botData.reply || "No pude procesar tu consulta.";

            const sendResult = await sendWhatsAppReply(from, reply);
            console.log("Bot reply sent:", sendResult.ok);

            await supabase.from("whatsapp_messages").insert({
              from_phone: from,
              contact_name: contactName,
              message: reply,
              direction: "outgoing",
              is_read: true,
              timestamp: new Date().toISOString(),
            });
          } catch (botError: any) {
            console.error("Bot query error:", botError);
            await sendWhatsAppReply(from, "⚠️ Error al procesar tu consulta. Intenta de nuevo en un momento.");
          }
          // Return early - bot users don't create sales requests
        } else {
          // Check if sender is an authorized sales requester
          const { data: requester } = await supabase
            .from("whatsapp_sales_requesters")
            .select("*")
            .or(`phone.eq.${from},phone.eq.${normalizedFrom}`)
            .eq("is_active", true)
            .maybeSingle();

          if (requester) {
            console.log(`Sales requester detected: ${requester.name} (${from}). Processing request...`);

            let fileUrl: string | null = null;
            let fileName: string | null = null;
            let fileType: string | null = null;

            // Handle media messages (image, document)
            const mediaId = message.image?.id || message.document?.id;
            if (mediaId) {
              try {
                const media = await downloadWhatsAppMedia(mediaId);
                if (media) {
                  const ext = getExtensionFromMime(media.mimeType);
                  const originalName = message.document?.filename || `whatsapp-${Date.now()}.${ext}`;
                  const storagePath = `${crypto.randomUUID()}.${ext}`;

                  const { error: uploadError } = await supabase.storage
                    .from("sales-requests")
                    .upload(storagePath, media.buffer, {
                      contentType: media.mimeType,
                      upsert: false,
                    });

                  if (uploadError) {
                    console.error("Storage upload error:", uploadError);
                  } else {
                    const { data: urlData } = supabase.storage
                      .from("sales-requests")
                      .getPublicUrl(storagePath);
                    fileUrl = urlData.publicUrl;
                    fileName = originalName;
                    fileType = media.mimeType;
                    console.log("Media uploaded:", fileUrl);
                  }
                }
              } catch (mediaErr) {
                console.error("Media download/upload error:", mediaErr);
              }
            }

            // Create sales request
            const rawText = msgBody || null;

            // Only create if there's content
            if (fileUrl || rawText) {
              const { data: inserted, error: insertError } = await supabase
                .from("sales_requests")
                .insert({
                  file_url: fileUrl,
                  file_name: fileName,
                  file_type: fileType,
                  raw_text: rawText,
                  extraction_status: "pending",
                  status: "nueva",
                  source_phone: from,
                  contact_name: contactName,
                })
                .select("id")
                .single();

              if (insertError) {
                console.error("Sales request insert error:", insertError);
                await sendWhatsAppReply(from, "⚠️ Error al registrar tu solicitud. Intenta de nuevo.");
              } else {
                console.log("Sales request created:", inserted.id);

                // Trigger extraction if there's a file
                if (inserted?.id && fileUrl) {
                  supabase.functions.invoke("extract-sales-request", {
                    body: { requestId: inserted.id },
                  }).catch((err: any) => console.error("Extraction trigger error:", err));
                }

                await sendWhatsAppReply(
                  from,
                  `✅ ¡Solicitud recibida, ${requester.name}! Tu pedido ha sido registrado y será procesado. Te contactaremos pronto.`
                );
              }
            } else {
              await sendWhatsAppReply(
                from,
                "Hola, para registrar tu solicitud envía un texto con los productos, una imagen o un documento (PDF/Excel)."
              );
            }
          } else {
            console.log(`Regular message from ${from}. Stored for manual review.`);
          }
        }
      }

      // Status updates
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
