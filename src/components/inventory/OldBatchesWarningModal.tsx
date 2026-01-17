import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Clock, 
  AlertTriangle, 
  Package, 
  Calendar,
  ArrowRight,
  Boxes
} from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface OldBatch {
  id: string;
  batch_number: string;
  barcode: string;
  expiration_date: string;
  received_at: string;
  current_quantity: number;
  initial_quantity: number;
  products: {
    name: string;
    sku: string;
  } | null;
}

export function OldBatchesWarningModal() {
  const [open, setOpen] = useState(false);

  // Fetch batches ordered by received_at (oldest first) with stock > 0
  const { data: oldBatches = [], isLoading } = useQuery({
    queryKey: ["old_batches_warning"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select(`
          id,
          batch_number,
          barcode,
          expiration_date,
          received_at,
          current_quantity,
          initial_quantity,
          products:product_id (name, sku)
        `)
        .gt("current_quantity", 0)
        .eq("is_active", true)
        .order("received_at", { ascending: true });

      if (error) throw error;
      return data as OldBatch[];
    },
    enabled: open
  });

  // Group batches by product to identify FIFO issues
  const batchesByProduct = oldBatches.reduce((acc, batch) => {
    const productId = batch.products?.sku || "unknown";
    if (!acc[productId]) {
      acc[productId] = [];
    }
    acc[productId].push(batch);
    return acc;
  }, {} as Record<string, OldBatch[]>);

  // Find products with multiple batches (potential FIFO warnings)
  const productsWithMultipleBatches = Object.entries(batchesByProduct)
    .filter(([_, batches]) => batches.length > 1)
    .map(([sku, batches]) => ({
      sku,
      productName: batches[0].products?.name || "Producto",
      batches: batches.sort((a, b) => 
        new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
      ),
      oldestBatch: batches[0],
      totalBatches: batches.length
    }));

  const getDaysInStorage = (receivedAt: string) => {
    return differenceInDays(new Date(), parseISO(receivedAt));
  };

  const getStorageStatus = (days: number) => {
    if (days > 180) return { label: "Muy antiguo", variant: "destructive" as const, color: "text-destructive" };
    if (days > 90) return { label: "Antiguo", variant: "secondary" as const, color: "text-orange-500" };
    if (days > 30) return { label: "Normal", variant: "outline" as const, color: "text-muted-foreground" };
    return { label: "Reciente", variant: "default" as const, color: "text-green-500" };
  };

  const oldestBatches = oldBatches
    .map(batch => ({
      ...batch,
      daysInStorage: getDaysInStorage(batch.received_at)
    }))
    .filter(batch => batch.daysInStorage > 30)
    .slice(0, 10);

  const warningCount = productsWithMultipleBatches.length + oldestBatches.filter(b => b.daysInStorage > 90).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Clock className="h-4 w-4" />
          Lotes Antiguos
          {warningCount > 0 && (
            <Badge variant="destructive" className="ml-1">
              {warningCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Control de Lotes Antiguos (FIFO)
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[65vh] pr-4">
          <div className="space-y-6">
            {/* FIFO Warning Section */}
            {productsWithMultipleBatches.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="font-semibold">Advertencias FIFO</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Los siguientes productos tienen múltiples lotes. Asegúrese de usar primero los lotes más antiguos.
                </p>
                
                <div className="grid gap-3">
                  {productsWithMultipleBatches.map(({ sku, productName, batches, totalBatches }) => (
                    <Card key={sku} className="border-l-4 border-l-orange-500">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-medium">{productName}</p>
                            <p className="text-sm text-muted-foreground font-mono">{sku}</p>
                          </div>
                          <Badge variant="secondary">
                            <Boxes className="h-3 w-3 mr-1" />
                            {totalBatches} lotes
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-wrap">
                          {batches.slice(0, 4).map((batch, index) => {
                            const days = getDaysInStorage(batch.received_at);
                            const status = getStorageStatus(days);
                            return (
                              <div key={batch.id} className="flex items-center gap-1">
                                <div className={`text-xs px-2 py-1 rounded border ${index === 0 ? 'bg-orange-50 border-orange-200' : 'bg-muted'}`}>
                                  <span className="font-mono">{batch.batch_number}</span>
                                  <span className={`ml-2 ${status.color}`}>
                                    ({days}d)
                                  </span>
                                  {index === 0 && (
                                    <span className="ml-1 text-orange-600">← Usar primero</span>
                                  )}
                                </div>
                                {index < batches.slice(0, 4).length - 1 && (
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            );
                          })}
                          {batches.length > 4 && (
                            <span className="text-xs text-muted-foreground">
                              +{batches.length - 4} más
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Old Batches Table */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                <h3 className="font-semibold">Lotes con Mayor Antigüedad</h3>
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="ml-2">Cargando...</span>
                </div>
              ) : oldestBatches.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No hay lotes antiguos almacenados
                  </CardContent>
                </Card>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead className="text-center">Fecha Recepción</TableHead>
                      <TableHead className="text-center">Días Almacenado</TableHead>
                      <TableHead className="text-center">Caducidad</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {oldestBatches.map((batch) => {
                      const status = getStorageStatus(batch.daysInStorage);
                      const expDays = differenceInDays(parseISO(batch.expiration_date), new Date());
                      
                      return (
                        <TableRow 
                          key={batch.id}
                          className={batch.daysInStorage > 90 ? "bg-orange-50/50" : ""}
                        >
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{batch.products?.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {batch.products?.sku}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">{batch.batch_number}</TableCell>
                          <TableCell className="text-center">
                            {format(parseISO(batch.received_at), "dd MMM yyyy", { locale: es })}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={status.variant}>
                              {batch.daysInStorage} días
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span className={expDays < 30 ? "text-destructive" : ""}>
                                {format(parseISO(batch.expiration_date), "dd/MM/yyyy")}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-medium">{batch.current_quantity}</span>
                            <span className="text-muted-foreground">/{batch.initial_quantity}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Legend */}
            <Card className="bg-muted/50">
              <CardContent className="py-3">
                <p className="text-sm font-medium mb-2">Leyenda de antigüedad:</p>
                <div className="flex flex-wrap gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-green-500" />
                    <span>Reciente (&lt;30 días)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-muted-foreground" />
                    <span>Normal (30-90 días)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-orange-500" />
                    <span>Antiguo (90-180 días)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-destructive" />
                    <span>Muy antiguo (&gt;180 días)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
