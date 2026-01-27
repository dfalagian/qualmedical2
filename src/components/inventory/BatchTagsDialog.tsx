import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tag, Cpu, MapPin, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface BatchTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  batchNumber: string;
  productName: string;
}

export function BatchTagsDialog({
  open,
  onOpenChange,
  batchId,
  batchNumber,
  productName,
}: BatchTagsDialogProps) {
  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["batch_tags", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfid_tags")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: open && !!batchId,
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "asignado":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Asignado</Badge>;
      case "disponible":
        return <Badge variant="secondary">Disponible</Badge>;
      case "baja":
        return <Badge variant="destructive">Baja</Badge>;
      default:
        return <Badge variant="outline">{status || "Sin estado"}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Tags RFID del Lote
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">{productName}</span>
            <span className="mx-2">•</span>
            <span className="font-mono">{batchNumber}</span>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-muted-foreground">Cargando tags...</span>
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Cpu className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No hay tags asignados a este lote</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-mono text-sm truncate">
                        {tag.epc}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {tag.last_location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {tag.last_location}
                        </span>
                      )}
                      {tag.last_read_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(tag.last_read_at), "dd MMM HH:mm", { locale: es })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-2 shrink-0">
                    {getStatusBadge(tag.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {tags.length > 0 && (
          <div className="text-sm text-muted-foreground text-center pt-2 border-t">
            Total: <span className="font-medium">{tags.length}</span> tag{tags.length !== 1 ? "s" : ""}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
