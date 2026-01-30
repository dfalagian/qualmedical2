import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickStockButtonsProps {
  productId: string;
  productName: string;
  currentStock: number;
  className?: string;
  onAdjustmentComplete?: () => void;
}

export function QuickStockButtons({
  productId,
  productName,
  currentStock,
  className,
  onAdjustmentComplete,
}: QuickStockButtonsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const adjustStock = async (mode: "increment" | "decrement") => {
    if (mode === "decrement" && currentStock <= 0) {
      toast({
        title: "Sin stock",
        description: "No hay stock disponible para retirar",
        variant: "destructive",
      });
      return;
    }

    setIsPending(true);
    try {
      const quantity = 1;
      const newStock = mode === "increment" 
        ? currentStock + quantity
        : Math.max(0, currentStock - quantity);

      // Update product stock
      const { error: productError } = await supabase
        .from("products")
        .update({ current_stock: newStock })
        .eq("id", productId);

      if (productError) throw productError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Register movement
      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          product_id: productId,
          movement_type: mode === "increment" ? "entrada" : "salida",
          quantity: mode === "increment" ? quantity : -quantity,
          previous_stock: currentStock,
          new_stock: newStock,
          notes: `Ajuste rápido (${mode === "increment" ? "+1" : "-1"})`,
          location: "Ajuste Manual",
          created_by: user?.id || null,
        });

      if (movementError) throw movementError;

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product_batches"] });

      toast({
        title: mode === "increment" ? "+1" : "-1",
        description: `${productName}: ${newStock}`,
      });

      onAdjustmentComplete?.();
    } catch (error) {
      console.error("Error adjusting stock:", error);
      toast({
        title: "Error",
        description: "No se pudo ajustar el stock",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-100"
        onClick={(e) => {
          e.stopPropagation();
          adjustStock("decrement");
        }}
        disabled={isPending || currentStock <= 0}
        title="Retirar 1 unidad"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100"
        onClick={(e) => {
          e.stopPropagation();
          adjustStock("increment");
        }}
        disabled={isPending}
        title="Agregar 1 unidad"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
