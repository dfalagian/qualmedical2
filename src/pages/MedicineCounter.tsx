import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Camera, Loader2 } from "lucide-react";

const MedicineCounter = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<{ count: number | null; analysis: string } | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Error",
          description: "Por favor selecciona una imagen válida",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      setResult(null);

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!preview) return;

    setIsAnalyzing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('count-medicine-boxes', {
        body: { imageBase64: preview }
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      setResult({
        count: data.count,
        analysis: data.analysis
      });

      toast({
        title: "Análisis completado",
        description: data.count 
          ? `Se detectaron ${data.count} cajas de medicamentos`
          : "Análisis realizado con éxito",
      });
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "No se pudo analizar la imagen. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Contador de Cajas de Medicamentos</h1>
          <p className="text-muted-foreground">
            Sube una imagen de una pila de medicamentos para contar automáticamente las cajas
          </p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Cargar Imagen
              </CardTitle>
              <CardDescription>
                Selecciona una foto de la pila de medicamentos que deseas analizar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image-upload">Imagen</Label>
                <Input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  disabled={isAnalyzing}
                />
              </div>

              {preview && (
                <div className="space-y-4">
                  <div className="relative rounded-lg overflow-hidden border bg-muted">
                    <img
                      src={preview}
                      alt="Vista previa"
                      className="w-full h-auto max-h-96 object-contain"
                    />
                  </div>

                  <Button
                    onClick={analyzeImage}
                    disabled={isAnalyzing}
                    className="w-full"
                    size="lg"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analizando imagen...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Analizar Imagen
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader>
                <CardTitle>Resultados del Análisis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.count !== null && (
                  <div className="p-6 rounded-lg bg-primary/10 border-2 border-primary">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-2">Total de Cajas Detectadas</p>
                      <p className="text-5xl font-bold text-primary">{result.count}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Análisis Detallado</Label>
                  <div className="p-4 rounded-lg bg-muted whitespace-pre-wrap">
                    {result.analysis}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MedicineCounter;
