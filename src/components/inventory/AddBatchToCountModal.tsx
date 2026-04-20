import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, PlusCircle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

interface BatchOption {
  id: string;
  batch_number: string;
  current_quantity: number;
  expiration_date: string;
}

interface AddBatchToCountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  /** Batch IDs already in the count list for this product */
  existingBatchIds: string[];
  onSelectBatch: (batch: BatchOption) => void;
  onCreateNewBatch: () => void;
}

export function AddBatchToCountModal({
  open,
  onOpenChange,
  productId,
  productName,
  existingBatchIds,
  onSelectBatch,
  onCreateNewBatch,
}: AddBatchToCountModalProps) {
  const [search, setSearch] = useState("");

  const { data: allBatches = [], isLoading } = useQuery({
    queryKey: ["add-batch-to-count", productId],
    enabled: open && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, current_quantity, expiration_date")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("expiration_date");
      if (error) throw error;
      return (data || []) as BatchOption[];
    },
  });

  const filteredBatches = useMemo(() => {
    if (!search) return allBatches;
    const s = search.toLowerCase();
    return allBatches.filter((b) => b.batch_number.toLowerCase().includes(s));
  }, [allBatches, search]);

  const handleSelect = (batch: BatchOption) => {
    onSelectBatch(batch);
    setSearch("");
    onOpenChange(false);
  };

  const handleCreateNew = () => {
    setSearch("");
    onOpenChange(false);
    onCreateNewBatch();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Agregar Lote — {productName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar lote..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="border rounded-md max-h-[280px] overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Cargando lotes...</p>
            ) : filteredBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {allBatches.length === 0 ? "No hay lotes para este producto" : "Sin resultados"}
              </p>
            ) : (
              filteredBatches.map((batch) => {
                const alreadyAdded = existingBatchIds.includes(batch.id);
                return (
                  <div
                    key={batch.id}
                    className={`flex items-center justify-between px-4 py-2.5 border-b last:border-b-0 text-sm ${
                      alreadyAdded ? "bg-muted/50 opacity-60" : "hover:bg-muted/50 cursor-pointer"
                    }`}
                    onClick={() => !alreadyAdded && handleSelect(batch)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono font-medium">{batch.batch_number}</span>
                      <span className="text-xs text-muted-foreground">
                        Caduca: {format(new Date(batch.expiration_date), "dd/MM/yyyy")} • Stock: {batch.current_quantity}
                      </span>
                    </div>
                    {alreadyAdded ? (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Check className="h-3 w-3" /> Agregado
                      </Badge>
                    ) : (
                      <Button size="sm" variant="ghost" className="text-xs">
                        Seleccionar
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="default" onClick={handleCreateNew} className="gap-1.5">
            <PlusCircle className="h-4 w-4" />
            Crear Nuevo Lote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
