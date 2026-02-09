import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Minus, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLogger";

interface QuickStockButtonsProps {
  productId: string;
  productName: string;
  currentStock: number;
  rfidRequired?: boolean;
  className?: string;
  onAdjustmentComplete?: () => void;
}

export function QuickStockButtons({
  productId,
  productName,
  currentStock,
  rfidRequired = false,
  className,
  onAdjustmentComplete,
}: QuickStockButtonsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const isProcessingRef = useRef(false);

  // If RFID is required, show disabled state with tooltip
  if (rfidRequired) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1 opacity-50", className)}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground cursor-not-allowed"
              disabled
            >
              <Radio className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Este producto requiere lectura RFID</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const adjustStock = useCallback(async (mode: "increment" | "decrement") => {
    // Prevent double-fires using ref
    if (isProcessingRef.current) {
      return;
    }

    if (mode === "decrement" && currentStock <= 0) {
      toast({
        title: "Sin stock",
        description: "No hay stock disponible para retirar",
        variant: "destructive",
      });
      return;
    }

    isProcessingRef.current = true;
    setIsPending(true);

    try {
      const quantity = 1;
      const newStock = mode === "increment" 
        ? currentStock + quantity
        : Math.max(0, currentStock - quantity);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Register movement
      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          product_id: productId,
          movement_type: mode === "increment" ? "entrada" : "salida",
          // IMPORTANT: quantity is always POSITIVE; direction is defined by movement_type.
          // This matches backend logic that updates stock based on movement_type.
          quantity,
          previous_stock: currentStock,
          new_stock: newStock,
          notes: `Ajuste rápido (${mode === "increment" ? "+1" : "-1"})`,
          location: "Ajuste Manual",
          created_by: user?.id || null,
        });

      if (movementError) throw movementError;

      // Read actual stock after backend processing (prevents +2 / -0 mismatches)
      const { data: updatedProduct, error: readError } = await supabase
        .from("products")
        .select("current_stock")
        .eq("id", productId)
        .maybeSingle();

      if (readError) throw readError;
      const actualStock = updatedProduct?.current_stock ?? newStock;

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["product_batches"] });

      logActivity({
        section: "inventario",
        action: mode === "increment" ? "ingreso" : "salida",
        entityType: "Producto",
        entityId: productId,
        entityName: productName,
        details: { previous_value: currentStock, new_value: actualStock, note: "Ajuste rápido" },
      });

      toast({
        title: mode === "increment" ? "+1" : "-1",
        description: `${productName}: ${actualStock}`,
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
      // Small delay before allowing next click to prevent rapid double-fires
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 300);
    }
  }, [productId, productName, currentStock, queryClient, toast, onAdjustmentComplete]);

  const handleDecrement = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    adjustStock("decrement");
  }, [adjustStock]);

  const handleIncrement = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    adjustStock("increment");
  }, [adjustStock]);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={handleDecrement}
        disabled={isPending || currentStock <= 0}
        title="Retirar 1 unidad"
      >
        <Minus className="h-3.5 w-3.5 pointer-events-none" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
        onClick={handleIncrement}
        disabled={isPending}
        title="Agregar 1 unidad"
      >
        <Plus className="h-3.5 w-3.5 pointer-events-none" />
      </Button>
    </div>
  );
}
