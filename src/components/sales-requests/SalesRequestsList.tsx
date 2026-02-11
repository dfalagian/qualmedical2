import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox, FileText, MessageSquareText, ExternalLink, RefreshCw, Loader2, Package, Receipt, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

const statusColors: Record<string, string> = {
  nueva: "bg-blue-100 text-blue-800",
  en_proceso: "bg-yellow-100 text-yellow-800",
  completada: "bg-green-100 text-green-800",
  rechazada: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  nueva: "Nueva",
  en_proceso: "En proceso",
  completada: "Completada",
  rechazada: "Rechazada",
};

const extractionStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  processing: "Procesando...",
  completed: "Extraído",
  failed: "Error",
};

const extractionStatusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export function SalesRequestsList() {
  const queryClient = useQueryClient();
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["sales-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("es-MX", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return d; }
  };

  const reprocessRequest = async (id: string) => {
    setReprocessingId(id);
    try {
      const { data, error } = await supabase.functions.invoke('extract-sales-request', {
        body: { requestId: id },
      });
      if (error) throw error;
      toast.success("Extracción completada");
      queryClient.invalidateQueries({ queryKey: ["sales-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Error al reprocesar");
    } finally {
      setReprocessingId(null);
    }
  };

  const renderExtractedData = (data: any) => {
    if (!data || Object.keys(data).length === 0) return null;

    return (
      <div className="mt-2 space-y-2 text-sm">
        {data.tipo_documento && (
          <div className="flex items-center gap-1">
            <FileSearch className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Tipo:</span>
            <span className="font-medium capitalize">{data.tipo_documento}</span>
          </div>
        )}

        {data.resumen && (
          <p className="text-muted-foreground italic">{data.resumen}</p>
        )}

        {data.datos_fiscales && (
          <div className="bg-muted/50 rounded p-2 space-y-1 text-xs">
            <div className="flex items-center gap-1 font-medium">
              <Receipt className="h-3 w-3" /> Datos fiscales
            </div>
            {data.datos_fiscales.emisor_nombre && (
              <p>Emisor: {data.datos_fiscales.emisor_nombre} ({data.datos_fiscales.emisor_rfc})</p>
            )}
            {data.datos_fiscales.receptor_nombre && (
              <p>Receptor: {data.datos_fiscales.receptor_nombre} ({data.datos_fiscales.receptor_rfc})</p>
            )}
            {data.datos_fiscales.total != null && (
              <p>Total: ${Number(data.datos_fiscales.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })} {data.datos_fiscales.moneda || 'MXN'}</p>
            )}
            {data.datos_fiscales.folio && <p>Folio: {data.datos_fiscales.folio}</p>}
            {data.datos_fiscales.uuid && <p className="truncate">UUID: {data.datos_fiscales.uuid}</p>}
          </div>
        )}

        {data.productos && data.productos.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Package className="h-3 w-3" />
              {data.productos.length} producto(s)
            </summary>
            <div className="mt-1 bg-muted/50 rounded p-2 space-y-1 max-h-40 overflow-auto">
              {data.productos.map((p: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate flex-1">{p.descripcion}</span>
                  <span className="ml-2 whitespace-nowrap">
                    {p.cantidad} × ${Number(p.precio_unitario || 0).toLocaleString('es-MX')}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        {data.texto_extraido && !data.datos_fiscales && !data.productos?.length && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Texto extraído
            </summary>
            <pre className="mt-1 bg-muted p-2 rounded text-xs overflow-auto max-h-40 whitespace-pre-wrap">
              {data.texto_extraido}
            </pre>
          </details>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          Solicitudes Recibidas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay solicitudes recibidas aún. Comparte la URL pública con los proveedores.
          </p>
        ) : (
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-3">
              {requests.map((req: any) => (
                <div
                  key={req.id}
                  className="p-4 rounded-lg border hover:bg-accent/10 transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {req.file_name ? (
                        <FileText className="h-4 w-4 text-primary" />
                      ) : (
                        <MessageSquareText className="h-4 w-4 text-primary" />
                      )}
                      <span className="font-medium text-sm">
                        {req.file_name || "Texto sin archivo"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={extractionStatusColors[req.extraction_status] || "bg-muted"}>
                        {extractionStatusLabels[req.extraction_status] || req.extraction_status}
                      </Badge>
                      <Badge className={statusColors[req.status] || "bg-muted"}>
                        {statusLabels[req.status] || req.status}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">{formatDate(req.created_at)}</p>

                  {req.raw_text && !req.extracted_data?.texto_extraido && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{req.raw_text}</p>
                  )}

                  <div className="flex items-center gap-2">
                    {req.file_url && (
                      <Button variant="ghost" size="sm" asChild className="gap-1 h-7 text-xs">
                        <a href={req.file_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                          Ver archivo
                        </a>
                      </Button>
                    )}
                    {(req.extraction_status === 'pending' || req.extraction_status === 'failed') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 h-7 text-xs"
                        disabled={reprocessingId === req.id}
                        onClick={() => reprocessRequest(req.id)}
                      >
                        {reprocessingId === req.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        {req.extraction_status === 'failed' ? 'Reintentar' : 'Extraer datos'}
                      </Button>
                    )}
                  </div>

                  {renderExtractedData(req.extracted_data)}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
