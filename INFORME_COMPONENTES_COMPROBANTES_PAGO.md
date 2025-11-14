# INFORME TÉCNICO: COMPONENTES DE CARGA DE COMPROBANTES DE PAGO

## DESCRIPCIÓN GENERAL

Este documento contiene el código fuente completo de los dos componentes desarrollados para la gestión de comprobantes de pago en el sistema:

1. **InvoicePaymentProofUpload** - Componente para cargar comprobantes desde la vista de Facturas
2. **PaymentProofUpload** - Componente para cargar comprobantes desde la vista de Pagos

Ambos componentes comparten funcionalidad similar pero están optimizados para sus respectivos contextos de uso.

---

## 1. COMPONENTE: InvoicePaymentProofUpload

**Ubicación:** `src/components/invoices/InvoicePaymentProofUpload.tsx`

**Descripción:** Componente especializado para cargar comprobantes de pago desde la tabla de facturas. Crea automáticamente el registro de pago si no existe.

### CÓDIGO COMPLETO:

```typescript
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Loader2, FileCheck, RefreshCw } from "lucide-react";
import { getSignedUrl } from "@/lib/storage";
import { convertPDFToImages } from "@/lib/pdfToImages";
import { useAuth } from "@/hooks/useAuth";

interface InvoicePaymentProofUploadProps {
  invoiceId: string;
  supplierId: string;
  hasProof: boolean;
  proofUrl?: string | null;
}

export function InvoicePaymentProofUpload({ 
  invoiceId, 
  supplierId, 
  hasProof, 
  proofUrl 
}: InvoicePaymentProofUploadProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  // Cargar la URL firmada cuando se abre el diálogo y ya existe un comprobante
  useEffect(() => {
    const loadSignedUrl = async () => {
      if (open && proofUrl && hasProof) {
        setLoadingImage(true);
        try {
          // Extraer el path del archivo desde la URL completa
          const urlPath = new URL(proofUrl).pathname;
          const filePath = urlPath.split('/').slice(-3).join('/');
          
          const url = await getSignedUrl('documents', filePath, 3600);
          setSignedUrl(url);
        } catch (error) {
          console.error('Error loading signed URL:', error);
        } finally {
          setLoadingImage(false);
        }
      }
    };

    loadSignedUrl();
  }, [open, proofUrl, hasProof]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // Primero, buscar si existe un registro de pago para esta factura
      let { data: pagoData, error: pagoError } = await supabase
        .from("pagos")
        .select("id")
        .eq("invoice_id", invoiceId)
        .maybeSingle();

      if (pagoError) throw pagoError;

      // Si no existe el registro de pago, crearlo automáticamente
      if (!pagoData) {
        console.log("No se encontró registro de pago, creando uno nuevo...");
        
        // Obtener datos bancarios aprobados del proveedor
        const { data: bankDocsData, error: bankDocsError } = await supabase
          .from("documents")
          .select("id, nombre_banco")
          .eq("supplier_id", supplierId)
          .eq("document_type", "datos_bancarios")
          .eq("status", "aprobado")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (bankDocsError) throw bankDocsError;

        if (!bankDocsData) {
          throw new Error("No se encontraron datos bancarios aprobados para este proveedor");
        }

        // Obtener el monto de la factura
        const { data: invoiceData, error: invoiceError } = await supabase
          .from("invoices")
          .select("amount")
          .eq("id", invoiceId)
          .single();

        if (invoiceError) throw invoiceError;

        // Crear el registro de pago
        const { data: newPago, error: createPagoError } = await supabase
          .from("pagos")
          .insert({
            supplier_id: supplierId,
            datos_bancarios_id: bankDocsData.id,
            invoice_id: invoiceId,
            amount: invoiceData.amount,
            status: "pendiente",
            nombre_banco: bankDocsData.nombre_banco,
          })
          .select()
          .single();

        if (createPagoError) throw createPagoError;
        
        pagoData = newPago;
        console.log("Registro de pago creado:", pagoData);
      }

      // Convertir PDF a imagen si es necesario
      let imageFiles: Blob[] = [];
      
      if (file.type === 'application/pdf') {
        const { images } = await convertPDFToImages(file, 1);
        imageFiles = images;
      } else {
        imageFiles = [file];
      }

      if (imageFiles.length === 0) {
        throw new Error("No se pudo procesar el archivo");
      }

      // Subir archivo a Storage
      const timestamp = Date.now();
      const fileName = `${supplierId}/${timestamp}_comprobante_pago.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, imageFiles[0], {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Llamar a edge function para extraer info del comprobante
      const { data: extractionData, error: extractionError } = await supabase.functions.invoke(
        'extract-payment-proof-info',
        {
          body: { 
            pagoId: pagoData.id,
            filePath: fileName 
          }
        }
      );

      if (extractionError) {
        console.error('Error extrayendo información:', extractionError);
        throw extractionError;
      }

      return extractionData;
    },
    onSuccess: () => {
      toast.success("Comprobante de pago subido exitosamente");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      setOpen(false);
      setFile(null);
      setIsChanging(false);
    },
    onError: (error: any) => {
      console.error('Error al subir comprobante:', error);
      toast.error(error.message || "Error al subir comprobante de pago");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validar tipo de archivo
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!validTypes.includes(selectedFile.type)) {
        toast.error("Por favor selecciona una imagen JPG, PNG o PDF");
        return;
      }

      // Validar tamaño (máximo 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error("El archivo no debe superar los 10MB");
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleUpload = () => {
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleChangeProof = () => {
    setIsChanging(true);
    setSignedUrl(null);
  };

  const handleCancelChange = () => {
    setIsChanging(false);
    setFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant={hasProof ? "outline" : "default"}
                size="sm"
                className={hasProof ? "text-green-600 border-green-600 hover:bg-green-50" : ""}
              >
                {hasProof ? (
                  <>
                    <FileCheck className="h-4 w-4 mr-1" />
                    Ver Comprobante
                  </>
                ) : (
                  <>
                    <Loader2 className="h-4 w-4 mr-1" />
                    Pendiente
                  </>
                )}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{hasProof ? "Ver comprobante de pago" : "Subir comprobante de pago"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {hasProof && !isChanging ? "Comprobante de Pago" : "Subir Comprobante de Pago"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {hasProof && !isChanging ? (
            // Mostrar comprobante existente
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4">
                {loadingImage ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : signedUrl ? (
                  <img
                    src={signedUrl}
                    alt="Comprobante de pago"
                    className="w-full h-auto rounded-md"
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No se pudo cargar la imagen
                  </div>
                )}
              </div>
              
              {isAdmin && (
                <Button
                  onClick={handleChangeProof}
                  variant="outline"
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Cambiar Comprobante
                </Button>
              )}
            </div>
          ) : isAdmin ? (
            // Formulario de carga para admin
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="proof-file">Archivo del Comprobante</Label>
                <Input
                  id="proof-file"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,application/pdf"
                  onChange={handleFileChange}
                  disabled={uploadMutation.isPending}
                />
                <p className="text-sm text-muted-foreground">
                  Formatos soportados: JPG, PNG, PDF (máx. 10MB)
                </p>
              </div>

              {file && (
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-sm">
                    <span className="font-medium">Archivo seleccionado:</span> {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tamaño: {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                {isChanging && (
                  <Button
                    onClick={handleCancelChange}
                    variant="outline"
                    disabled={uploadMutation.isPending}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                )}
                <Button
                  onClick={handleUpload}
                  disabled={!file || uploadMutation.isPending}
                  className="flex-1"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Subiendo...
                    </>
                  ) : (
                    <>
                      <FileCheck className="mr-2 h-4 w-4" />
                      {isChanging ? "Guardar Nuevo Comprobante" : "Subir Comprobante"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            // Mensaje para proveedores
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                El comprobante de pago será subido por el administrador
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 2. COMPONENTE: PaymentProofUpload

**Ubicación:** `src/components/payments/PaymentProofUpload.tsx`

**Descripción:** Componente para cargar comprobantes de pago desde la tabla de pagos. Requiere que el registro de pago ya exista.

### CÓDIGO COMPLETO:

```typescript
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, FileText, CheckCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { convertPDFToImages } from "@/lib/pdfToImages";
import { getSignedUrl } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";

interface PaymentProofUploadProps {
  pagoId: string;
  supplierId: string;
  hasProof: boolean;
  proofUrl?: string | null;
}

export function PaymentProofUpload({ pagoId, supplierId, hasProof, proofUrl }: PaymentProofUploadProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  // Obtener URL firmada cuando se abre el diálogo y ya hay comprobante
  useEffect(() => {
    if (open && hasProof && proofUrl) {
      setLoadingImage(true);
      // Extraer el path del archivo de la URL
      const urlParts = proofUrl.split('/documents/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        getSignedUrl('documents', filePath, 3600).then((url) => {
          setSignedUrl(url);
          setLoadingImage(false);
        }).catch((error) => {
          console.error('Error obteniendo URL firmada:', error);
          toast.error('Error cargando imagen');
          setLoadingImage(false);
        });
      }
    }
  }, [open, hasProof, proofUrl]);

  const uploadMutation = useMutation({
    mutationFn: async (selectedFile: File) => {
      // 1. Convertir PDF a imágenes o usar la imagen directamente
      let imageFiles: Blob[] = [];
      
      if (selectedFile.type === 'application/pdf') {
        const { images } = await convertPDFToImages(selectedFile, 1); // Solo primera página
        imageFiles = images;
      } else {
        imageFiles = [selectedFile];
      }

      if (imageFiles.length === 0) {
        throw new Error("No se pudo procesar el archivo");
      }

      // 2. Subir imagen a Storage
      const timestamp = Date.now();
      const fileName = `${supplierId}/${timestamp}_comprobante_pago.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, imageFiles[0], {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 3. Llamar edge function para extraer fecha de pago
      // Enviamos el path del archivo en lugar de la URL pública
      const { data: extractionData, error: extractionError } = await supabase.functions.invoke(
        'extract-payment-proof-info',
        {
          body: { 
            pagoId,
            filePath: fileName 
          }
        }
      );

      if (extractionError) {
        console.error('Error extrayendo información:', extractionError);
        throw extractionError;
      }

      return extractionData;
    },
    onSuccess: () => {
      toast.success("Comprobante de pago subido exitosamente");
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      setOpen(false);
      setFile(null);
    },
    onError: (error: any) => {
      console.error('Error al subir comprobante:', error);
      toast.error(error.message || "Error al subir comprobante de pago");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validar tipo de archivo
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!validTypes.includes(selectedFile.type)) {
        toast.error("Por favor selecciona una imagen JPG, PNG o PDF");
        return;
      }

      // Validar tamaño (máximo 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error("El archivo no debe superar los 10MB");
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleUpload = () => {
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant={hasProof ? "ghost" : "outline"} 
          size="sm"
          className={hasProof ? "text-success hover:text-success" : ""}
        >
          {hasProof ? (
            <>
              <CheckCircle className="h-4 w-4 mr-1" />
              Ver Comprobante
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-1" />
              Subir
            </>
          )}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {hasProof ? "Ver Comprobante de Pago" : "Subir Comprobante de Pago"}
          </DialogTitle>
          <DialogDescription>
            {hasProof 
              ? "Visualiza el comprobante de pago subido" 
              : "Sube la imagen o PDF del comprobante de pago para este registro"
            }
          </DialogDescription>
        </DialogHeader>

        {hasProof ? (
          // Vista de comprobante existente
          <div className="space-y-4">
            {loadingImage ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : signedUrl ? (
              <div className="rounded-lg border overflow-hidden">
                <img 
                  src={signedUrl} 
                  alt="Comprobante de pago" 
                  className="w-full h-auto"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mb-2" />
                <p>No se pudo cargar el comprobante</p>
              </div>
            )}
          </div>
        ) : isAdmin ? (
          // Vista de carga para admin
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proof-upload">Seleccionar archivo</Label>
              <Input
                id="proof-upload"
                type="file"
                accept="image/jpeg,image/jpg,image/png,application/pdf"
                onChange={handleFileChange}
                disabled={uploadMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Formatos soportados: JPG, PNG, PDF (máx. 10MB)
              </p>
            </div>

            {file && (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium">Archivo seleccionado:</p>
                <p className="text-sm text-muted-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tamaño: {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={!file || uploadMutation.isPending}
              className="w-full"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Subir Comprobante
                </>
              )}
            </Button>
          </div>
        ) : (
          // Vista para proveedores
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Eye className="h-12 w-12 mb-4" />
            <p className="text-center">
              El comprobante de pago será subido por el administrador
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

---

## 3. DEPENDENCIAS COMPARTIDAS

Ambos componentes utilizan las siguientes dependencias y utilidades:

### Librerías UI:
- `@/components/ui/dialog` - Componente de diálogo modal
- `@/components/ui/button` - Componente de botón
- `@/components/ui/input` - Componente de input de archivo
- `@/components/ui/label` - Componente de etiqueta
- `@/components/ui/tooltip` - Componente de tooltip (solo InvoicePaymentProofUpload)
- `lucide-react` - Iconos SVG

### Librerías de Estado:
- `@tanstack/react-query` - Manejo de estado asíncrono y cache
- `sonner` - Sistema de notificaciones toast

### Utilidades Personalizadas:
- `@/lib/storage` - Función `getSignedUrl` para obtener URLs firmadas de Supabase Storage
- `@/lib/pdfToImages` - Función `convertPDFToImages` para convertir PDFs a imágenes
- `@/hooks/useAuth` - Hook personalizado para autenticación y roles

### Cliente Supabase:
- `@/integrations/supabase/client` - Cliente configurado de Supabase

---

## 4. EDGE FUNCTION RELACIONADA

Ambos componentes invocan la edge function `extract-payment-proof-info`:

**Ubicación:** `supabase/functions/extract-payment-proof-info/index.ts`

**Función:** Extrae la fecha de pago de la imagen del comprobante usando IA y actualiza el registro en la base de datos.

---

## 5. FLUJO DE FUNCIONAMIENTO

### InvoicePaymentProofUpload:
1. Usuario hace clic en el botón de comprobante
2. Si no existe registro de pago, lo crea automáticamente obteniendo datos bancarios y monto de factura
3. Convierte PDF a imagen si es necesario
4. Sube el archivo a Supabase Storage
5. Invoca edge function para extraer fecha de pago con IA
6. Actualiza el registro de pago con la URL y fecha extraída
7. Invalida queries para refrescar la UI

### PaymentProofUpload:
1. Usuario hace clic en el botón de comprobante
2. Requiere que el registro de pago ya exista (falla si no existe)
3. Convierte PDF a imagen si es necesario
4. Sube el archivo a Supabase Storage
5. Invoca edge function para extraer fecha de pago con IA
6. Actualiza el registro de pago con la URL y fecha extraída
7. Invalida queries para refrescar la UI

---

## 6. DIFERENCIAS CLAVE ENTRE COMPONENTES

| Característica | InvoicePaymentProofUpload | PaymentProofUpload |
|---------------|---------------------------|-------------------|
| **Contexto de uso** | Tabla de Facturas | Tabla de Pagos |
| **Creación automática de pago** | ✅ Sí | ❌ No |
| **Props requeridas** | invoiceId, supplierId | pagoId, supplierId |
| **Botón cambiar comprobante** | ✅ Sí (con RefreshCw) | ❌ No |
| **Estado isChanging** | ✅ Sí | ❌ No |
| **Tooltip** | ✅ Sí | ❌ No |
| **Invalidación de queries** | invoices + pagos | solo pagos |

---

## 7. VALIDACIONES IMPLEMENTADAS

Ambos componentes validan:
- ✅ Tipo de archivo: JPG, PNG, PDF
- ✅ Tamaño máximo: 10MB
- ✅ Existencia de archivo seleccionado antes de subir
- ✅ Permisos de usuario (isAdmin)

---

## 8. ESTADOS MANEJADOS

### InvoicePaymentProofUpload:
- `open` - Estado del diálogo
- `file` - Archivo seleccionado
- `signedUrl` - URL firmada para visualización
- `loadingImage` - Cargando imagen
- `isChanging` - Modo cambio de comprobante

### PaymentProofUpload:
- `open` - Estado del diálogo
- `file` - Archivo seleccionado
- `signedUrl` - URL firmada para visualización
- `loadingImage` - Cargando imagen

---

## 9. SEGURIDAD

- ✅ URLs firmadas con expiración de 1 hora
- ✅ Validación de permisos de administrador
- ✅ Almacenamiento privado en bucket 'documents'
- ✅ Organización por supplierId en Storage
- ✅ Validación de tipos de archivo en cliente

---

## FECHA DE CREACIÓN
14 de noviembre de 2025

## VERSIÓN
1.0.0

---

**FIN DEL INFORME**
