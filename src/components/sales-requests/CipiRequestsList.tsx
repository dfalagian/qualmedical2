import { useState } from "react";
import { todayLocalStr } from "@/lib/formatters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { toast } from "sonner";
import { Plus, FileSpreadsheet, ChevronDown, ChevronUp, Trash2, FileText, ArrowRight } from "lucide-react";
import { CipiUploadDialog } from "./CipiUploadDialog";
import { CipiItemsMatcher } from "./CipiItemsMatcher";
import { CipiConversionDialog } from "./CipiConversionDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CipiRequestsListProps {
  type: "cipi" | "cipi_pro" | "cemi";
  title: string;
}

const statusColors: Record<string, string> = {
  nueva: "bg-blue-100 text-blue-800",
  procesada: "bg-green-100 text-green-800",
  convertida: "bg-purple-100 text-purple-800",
};

const statusLabels: Record<string, string> = {
  nueva: "Nueva",
  procesada: "Procesada",
  convertida: "Convertida a cotización",
};

export function CipiRequestsList({ type, title }: CipiRequestsListProps) {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [conversionRequest, setConversionRequest] = useState<any | null>(null);
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["cipi-requests", type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cipi_requests")
        .select("*")
        .eq("type", type)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("es-MX", {
        day: "2-digit", month: "short", year: "numeric",
      });
    } catch { return d; }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from("cipi_requests").delete().eq("id", deletingId);
      if (error) throw error;
      toast.success("Solicitud eliminada");
      queryClient.invalidateQueries({ queryKey: ["cipi-requests", type] });
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  const handleConvertToQuote = async (request: any) => {
    setConvertingId(request.id);
    try {
      // Get items for this request
      const { data: items, error: itemsError } = await supabase
        .from("cipi_request_items")
        .select("*")
        .eq("cipi_request_id", request.id);
      if (itemsError) throw itemsError;

      // Find or use a default client
      let clientId: string;
      const clientName = request.empresa || request.razon_social || type.toUpperCase();
      
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .ilike("nombre_cliente", `%${clientName}%`)
        .limit(1)
        .single();

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const { data: newClient, error: clientError } = await supabase
          .from("clients")
          .insert({
            nombre_cliente: clientName,
            razon_social: request.razon_social,
            rfc: request.rfc,
            cfdi: request.cfdi,
          })
          .select("id")
          .single();
        if (clientError) throw clientError;
        clientId = newClient.id;
      }

      // Generate folio
      const { data: folioData } = await supabase.rpc("generate_quote_folio");
      const folio = folioData || `COT-${type.toUpperCase()}-${Date.now()}`;

      // Create quote
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          client_id: clientId,
          folio,
          concepto: request.concepto || `Solicitud ${type.toUpperCase()} - ${request.folio || ''}`,
          fecha_cotizacion: request.fecha_cotizacion || todayLocalStr(),
          fecha_entrega: request.fecha_entrega,
          factura_anterior: request.factura_anterior,
          fecha_factura_anterior: request.fecha_ultima_factura,
          monto_factura_anterior: request.monto_ultima_factura,
          subtotal: request.subtotal || 0,
          total: request.total || 0,
          status: "borrador",
          notes: `Importado desde ${type.toUpperCase()}. Folio original: ${request.folio || 'N/A'}`,
        })
        .select("id")
        .single();
      if (quoteError) throw quoteError;

      // Create quote items - attempt to match product_id from catalog if missing
      if (items && items.length > 0) {
        // Always fetch catalog to get OFFICIAL names and for fallback matching
        const { data: prods } = await supabase
          .from("products")
          .select("id, name, brand")
          .eq("is_active", true)
          .eq("catalog_only", false);
        const productsCatalog: Array<{ id: string; name: string; brand: string | null }> = prods || [];

        // Build a lookup map for quick access by id
        const catalogById = new Map(productsCatalog.map(p => [p.id, p]));

        const normalizeForMatch = (str: string) =>
          str.toLowerCase().replace(/\s+/g, '').replace(/\./g, '').replace(/\//g, '').trim();

        const quoteItems = items.map((item: any) => {
          let productId = item.product_id || null;
          let officialName: string | null = null;

          // If already linked, use the OFFICIAL catalog name (never the extracted name)
          if (productId) {
            const catalogProduct = catalogById.get(productId);
            if (catalogProduct) {
              officialName = catalogProduct.name;
            }
          }

          // If no product_id, try to find a match by normalized name + brand
          if (!productId) {
            const itemName = item.matched_product_name || item.descripcion;
            const normalizedItemName = normalizeForMatch(itemName);
            const matches = productsCatalog.filter(
              p => normalizeForMatch(p.name) === normalizedItemName
            );
            if (matches.length === 1) {
              productId = matches[0].id;
              officialName = matches[0].name; // Use official catalog name
            } else if (matches.length > 1 && item.marca) {
              const brandMatch = matches.find(
                p => p.brand && p.brand.toLowerCase().trim() === item.marca.toLowerCase().trim()
              );
              if (brandMatch) {
                productId = brandMatch.id;
                officialName = brandMatch.name; // Use official catalog name
              }
            }
          }

          // Use official catalog name if found, otherwise fall back to extracted description
          const nombreFinal = officialName || item.matched_product_name || item.descripcion;

          return {
            quote_id: quote.id,
            product_id: productId,
            nombre_producto: nombreFinal,
            marca: item.marca,
            lote: item.lote,
            fecha_caducidad: item.caducidad,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario || 0,
            importe: (item.precio_unitario || 0) * (item.cantidad || 1),
            tipo_precio: 'manual',
          };
        });

        const { error: itemsInsertError } = await supabase.from("quote_items").insert(quoteItems);
        if (itemsInsertError) throw itemsInsertError;
      }

      // Update request status
      await supabase.from("cipi_requests").update({
        status: "convertida",
        quote_id: quote.id,
      }).eq("id", request.id);

      toast.success(`Cotización ${folio} creada exitosamente`);
      queryClient.invalidateQueries({ queryKey: ["cipi-requests", type] });
    } catch (err: any) {
      toast.error(err.message || "Error al convertir");
    } finally {
      setConvertingId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {title}
          </CardTitle>
          <Button size="sm" onClick={() => setShowUpload(true)} className="gap-1">
            <Plus className="h-4 w-4" />
            Nueva solicitud
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay solicitudes {type.toUpperCase()} aún.
            </p>
          ) : (
            <div className="space-y-3">
              {requests.map((req: any) => (
                <div key={req.id} className="rounded-lg border">
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">
                          {req.folio || req.file_name || "Solicitud sin folio"}
                        </span>
                        {req.concepto && (
                          <span className="text-xs text-muted-foreground">— {req.concepto}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusColors[req.status] || "bg-muted"}>
                          {statusLabels[req.status] || req.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {req.empresa && <span>Empresa: {req.empresa}</span>}
                      {req.razon_social && <span>Razón Social: {req.razon_social}</span>}
                      {req.total > 0 && (
                        <span className="font-medium text-foreground">
                          Total: ${Number(req.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      <span>{formatDate(req.created_at)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 h-7 text-xs"
                        onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                      >
                        {expandedId === req.id ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        Ver productos
                      </Button>
                      {req.status !== "convertida" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 h-7 text-xs"
                          disabled={convertingId === req.id}
                          onClick={() => setConversionRequest(req)}
                        >
                          <ArrowRight className="h-3 w-3" />
                          Convertir a cotización
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => setDeletingId(req.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                        Eliminar
                      </Button>
                    </div>
                  </div>

                  {expandedId === req.id && (
                    <div className="border-t p-4">
                      <CipiItemsMatcher requestId={req.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CipiUploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        type={type}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["cipi-requests", type] });
        }}
      />

      {conversionRequest && (
        <CipiConversionDialog
          open={!!conversionRequest}
          onOpenChange={(open) => !open && setConversionRequest(null)}
          request={conversionRequest}
          onConfirm={() => {
            handleConvertToQuote(conversionRequest);
            setConversionRequest(null);
          }}
          converting={convertingId === conversionRequest?.id}
        />
      )}

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar solicitud?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán la solicitud y todos sus productos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
