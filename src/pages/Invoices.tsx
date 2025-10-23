import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Receipt, Upload, FileText, Download, DollarSign } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Invoices = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, profiles(full_name, company_name)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!pdfFile || !xmlFile || !user) {
        throw new Error("Los archivos PDF y XML son obligatorios");
      }

      setIsUploading(true);

      // Upload PDF
      const pdfExt = pdfFile.name.split(".").pop();
      const pdfFileName = `${user.id}/invoices/${Date.now()}.${pdfExt}`;
      const { error: pdfError } = await supabase.storage
        .from("invoices")
        .upload(pdfFileName, pdfFile);

      if (pdfError) throw pdfError;

      // Upload XML
      const xmlExt = xmlFile.name.split(".").pop();
      const xmlFileName = `${user.id}/invoices/${Date.now()}.${xmlExt}`;
      const { error: xmlError } = await supabase.storage
        .from("invoices")
        .upload(xmlFileName, xmlFile);

      if (xmlError) throw xmlError;

      // Validar XML ANTES de insertar en la base de datos
      const { data: validationData, error: validationError } = await supabase.functions.invoke(
        'validate-invoice-xml',
        {
          body: { xmlPath: xmlFileName }
        }
      );

      // Si hay error de validación, lanzar excepción para detener la subida
      if (validationError) {
        console.error('Error al validar XML:', validationError);
        throw new Error('Error al validar el archivo XML: ' + (validationError.message || 'Error desconocido'));
      }

      // Si la validación falló (por ejemplo, FormaPago=99 pero MetodoPago!=PPD)
      if (validationData?.success === false) {
        throw new Error(validationData.mensaje || validationData.error || 'Error de validación en el XML');
      }

      // Extraer datos del XML validado
      const invoiceNumber = validationData.invoiceNumber;
      const amount = validationData.amount;

      if (!invoiceNumber || !amount) {
        throw new Error('No se pudo extraer el número de factura o el monto del XML');
      }

      // Get URLs
      const { data: { publicUrl: pdfUrl } } = supabase.storage
        .from("invoices")
        .getPublicUrl(pdfFileName);

      const { data: { publicUrl: xmlUrl } } = supabase.storage
        .from("invoices")
        .getPublicUrl(xmlFileName);

      // Insert invoice solo si la validación fue exitosa
      const { error: insertError } = await supabase
        .from("invoices")
        .insert({
          supplier_id: user.id,
          invoice_number: invoiceNumber,
          amount: parseFloat(amount),
          pdf_url: pdfUrl,
          xml_url: xmlUrl,
        });

      if (insertError) throw insertError;

      // Si todo está bien pero requiere complemento de pago
      if (validationData?.requiereComplemento) {
        return { requiereComplemento: true, mensaje: validationData.mensaje };
      }

      return { requiereComplemento: false };
    },
    onSuccess: (data) => {
      toast.success("Factura subida exitosamente");
      
      // Mostrar mensaje de complemento de pago si es necesario
      if (data?.requiereComplemento) {
        setTimeout(() => {
          toast.info(data.mensaje, {
            duration: 8000,
          });
        }, 500);
      }
      
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setPdfFile(null);
      setXmlFile(null);
      setIsUploading(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al subir factura");
      setIsUploading(false);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ 
      id, 
      status 
    }: { 
      id: string; 
      status: "pendiente" | "procesando" | "pagado" | "rechazado";
    }) => {
      const updates: any = { status };
      
      if (status === "pagado") {
        updates.payment_date = new Date().toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado actualizado");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar");
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pagado":
        return <Badge className="bg-success">Pagado</Badge>;
      case "procesando":
        return <Badge className="bg-warning">Procesando</Badge>;
      case "rechazado":
        return <Badge variant="destructive">Rechazado</Badge>;
      default:
        return <Badge variant="secondary">Pendiente</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gestión de Facturas</h2>
          <p className="text-muted-foreground">
            {isAdmin ? "Administra las facturas de los proveedores" : "Sube y consulta tus facturas"}
          </p>
        </div>

        {!isAdmin && (
          <Card className="shadow-md border-accent/20">
            <CardHeader className="bg-gradient-accent/10">
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Subir Nueva Factura
              </CardTitle>
              <CardDescription>Los datos se extraen automáticamente del XML</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  uploadMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pdfFile">Archivo PDF *</Label>
                    <Input
                      id="pdfFile"
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="xmlFile">Archivo XML *</Label>
                    <Input
                      id="xmlFile"
                      type="file"
                      accept=".xml"
                      onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
                      required
                    />
                  </div>
                </div>

                <Button type="submit" disabled={isUploading} className="w-full">
                  {isUploading ? "Subiendo..." : "Subir Factura"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Facturas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando facturas...</p>
            ) : invoices && invoices.length > 0 ? (
              <div className="space-y-4">
                {invoices.map((invoice: any) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold flex items-center gap-2">
                          <Receipt className="h-4 w-4" />
                          {invoice.invoice_number}
                        </h4>
                        {getStatusBadge(invoice.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${invoice.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {invoice.currency}
                        </span>
                        <span>
                          {new Date(invoice.created_at).toLocaleDateString('es-MX')}
                        </span>
                        {invoice.payment_date && (
                          <span className="text-success">
                            Pagado: {new Date(invoice.payment_date).toLocaleDateString('es-MX')}
                          </span>
                        )}
                      </div>
                      {isAdmin && invoice.profiles && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Proveedor: {invoice.profiles.company_name || invoice.profiles.full_name}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer">
                          <FileText className="h-4 w-4 mr-1" />
                          PDF
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={invoice.xml_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4 mr-1" />
                          XML
                        </a>
                      </Button>

                      {isAdmin && invoice.status !== "pagado" && (
                        <Select
                          value={invoice.status}
                          onValueChange={(value: any) =>
                            updateStatusMutation.mutate({ id: invoice.id, status: value })
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendiente">Pendiente</SelectItem>
                            <SelectItem value="procesando">Procesando</SelectItem>
                            <SelectItem value="pagado">Pagado</SelectItem>
                            <SelectItem value="rechazado">Rechazado</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No hay facturas disponibles
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Invoices;