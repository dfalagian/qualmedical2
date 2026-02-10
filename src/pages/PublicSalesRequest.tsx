import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, Loader2 } from "lucide-react";

const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";

const PublicSalesRequest = () => {
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!file && !rawText.trim()) {
      toast.error("Adjunta un archivo o pega un texto para continuar");
      return;
    }

    setIsSubmitting(true);
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let fileType: string | null = null;

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("sales-requests")
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("sales-requests")
          .getPublicUrl(path);

        fileUrl = urlData.publicUrl;
        fileName = file.name;
        fileType = file.type;
      }

      const { error: insertError } = await supabase
        .from("sales_requests")
        .insert({
          file_url: fileUrl,
          file_name: fileName,
          file_type: fileType,
          raw_text: rawText.trim() || null,
          extraction_status: "pending",
          status: "nueva",
        });

      if (insertError) throw insertError;

      setSubmitted(true);
      toast.success("Solicitud enviada correctamente");
    } catch (err: any) {
      console.error("Error submitting:", err);
      toast.error(err.message || "Error al enviar la solicitud");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-2xl font-bold">¡Solicitud enviada!</h2>
            <p className="text-muted-foreground">
              Tu información ha sido recibida. Nos pondremos en contacto contigo.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSubmitted(false);
                setFile(null);
                setRawText("");
              }}
            >
              Enviar otra solicitud
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Solicitud de Venta</CardTitle>
          <CardDescription>
            Adjunta un archivo (PDF, imagen, Word, Excel) o pega el texto de tu solicitud
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Archivo (opcional)</label>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="font-medium">{file.name}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Haz clic para seleccionar un archivo
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, JPG, PNG, Word, Excel
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Text area */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Texto (opcional)</label>
            <Textarea
              placeholder="Pega aquí el texto de tu solicitud..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={6}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (!file && !rawText.trim())}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar solicitud"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublicSalesRequest;
