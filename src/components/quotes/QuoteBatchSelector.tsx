import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Package, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

interface Batch {
  id: string;
  batch_number: string;
  expiration_date: string;
  current_quantity: number;
}

interface SelectedBatchInfo {
  batchId: string;
  batchNumber: string;
  expirationDate: string;
  availableQuantity: number;
}

interface QuoteBatchSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  onSelect: (batch: SelectedBatchInfo | null) => void;
}

export const QuoteBatchSelector = ({
  open,
  onOpenChange,
  productId,
  productName,
  onSelect,
}: QuoteBatchSelectorProps) => {
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // Fetch batches for the product
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["product-batches-quote-selector", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, expiration_date, current_quantity")
        .eq("product_id", productId)
        .eq("is_active", true)
        .gt("current_quantity", 0)
        .order("expiration_date", { ascending: true });
      if (error) throw error;
      return data as Batch[];
    },
    enabled: open && !!productId,
  });

  // Auto-select first batch when batches load
  useEffect(() => {
    if (batches.length > 0 && !selectedBatchId && open) {
      setSelectedBatchId(batches[0].id);
    }
  }, [batches, open, selectedBatchId]);

  // Reset selection when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedBatchId(null);
    }
    onOpenChange(isOpen);
  };

  // Get expiration status
  const getExpirationStatus = (expirationDate: string) => {
    const daysUntilExpiry = differenceInDays(new Date(expirationDate), new Date());
    if (daysUntilExpiry < 0) return { label: "Caducado", variant: "destructive" as const };
    if (daysUntilExpiry <= 30) return { label: "Por caducar", variant: "secondary" as const, isWarning: true };
    if (daysUntilExpiry <= 90) return { label: "Próximo", variant: "outline" as const };
    return { label: "Vigente", variant: "default" as const };
  };

  // Handle confirm
  const handleConfirm = () => {
    if (selectedBatchId) {
      const batch = batches.find(b => b.id === selectedBatchId);
      if (batch) {
        onSelect({
          batchId: batch.id,
          batchNumber: batch.batch_number,
          expirationDate: batch.expiration_date,
          availableQuantity: batch.current_quantity,
        });
      }
    }
    setSelectedBatchId(null);
    onOpenChange(false);
  };

  // Handle skip (no batch selection)
  const handleSkip = () => {
    onSelect(null);
    setSelectedBatchId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Seleccionar Lote
          </DialogTitle>
          <DialogDescription>
            Elija el lote para <span className="font-semibold text-foreground">{productName}</span>. 
            {batches.length > 1 && " Hay múltiples lotes disponibles."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Cargando lotes disponibles...
          </div>
        ) : batches.length === 0 ? (
          <div className="py-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">No hay lotes con stock disponible</p>
            <p className="text-sm text-muted-foreground">
              Puede agregar el producto sin lote y seleccionarlo al aprobar la venta.
            </p>
          </div>
        ) : (
          <RadioGroup 
            value={selectedBatchId || ""} 
            onValueChange={setSelectedBatchId}
            className="space-y-2"
          >
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Número de Lote</TableHead>
                    <TableHead>Fecha Caducidad</TableHead>
                    <TableHead className="text-center">Stock Disponible</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => {
                    const expStatus = getExpirationStatus(batch.expiration_date);
                    const isSelected = selectedBatchId === batch.id;
                    
                    return (
                      <TableRow 
                        key={batch.id} 
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/50",
                          isSelected && "bg-primary/10"
                        )}
                        onClick={() => setSelectedBatchId(batch.id)}
                      >
                        <TableCell>
                          <RadioGroupItem value={batch.id} id={batch.id} />
                        </TableCell>
                        <TableCell>
                          <Label 
                            htmlFor={batch.id} 
                            className="font-medium cursor-pointer"
                          >
                            {batch.batch_number}
                          </Label>
                        </TableCell>
                        <TableCell>
                          {format(new Date(batch.expiration_date), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            "font-bold text-lg",
                            batch.current_quantity <= 5 ? "text-destructive" : "text-primary"
                          )}>
                            {batch.current_quantity}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={expStatus.variant}
                            className={cn(
                              expStatus.isWarning && "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-900/20"
                            )}
                          >
                            {expStatus.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </RadioGroup>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button 
            variant="ghost" 
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            Omitir (seleccionar después)
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedBatchId && batches.length > 0}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Lote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
