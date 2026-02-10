import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox, FileText, MessageSquareText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function SalesRequestsList() {
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
                    <Badge className={statusColors[req.status] || "bg-muted"}>
                      {statusLabels[req.status] || req.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">{formatDate(req.created_at)}</p>

                  {req.raw_text && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{req.raw_text}</p>
                  )}

                  {req.file_url && (
                    <Button variant="ghost" size="sm" asChild className="gap-1 h-7 text-xs">
                      <a href={req.file_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                        Ver archivo
                      </a>
                    </Button>
                  )}

                  {req.extracted_data && Object.keys(req.extracted_data).length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Datos extraídos
                      </summary>
                      <pre className="mt-1 bg-muted p-2 rounded text-xs overflow-auto max-h-40">
                        {JSON.stringify(req.extracted_data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
