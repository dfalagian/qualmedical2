import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QuoteItem {
  id: string;
  product_id: string | null;
  batch_id: string | null;
  nombre_producto: string;
  marca: string;
  lote: string;
  fecha_caducidad: Date | null;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  tipo_precio: string; // "1", "2", "3", "4", or "manual"
}

interface SaveQuoteParams {
  clientId: string;
  folio: string;
  concepto: string;
  fechaCotizacion: Date;
  fechaEntrega?: Date;
  facturaAnterior?: string;
  fechaFacturaAnterior?: Date;
  montoFacturaAnterior?: number;
  subtotal: number;
  total: number;
  items: QuoteItem[];
  notes?: string;
}

interface UpdateQuoteParams extends SaveQuoteParams {
  quoteId: string;
}

interface ApproveQuoteParams {
  quoteId: string;
  items: Array<{
    product_id: string;
    batch_id: string;
    cantidad: number;
    nombre_producto: string;
  }>;
  forceApprove?: boolean; // Permitir aprobar sin stock suficiente (con advertencia)
}

interface StockValidationResult {
  isValid: boolean;
  warnings: string[];
}

export const useQuoteActions = () => {
  const queryClient = useQueryClient();

  // Guardar cotización (borrador)
  const saveQuoteMutation = useMutation({
    mutationFn: async (params: SaveQuoteParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Insertar cotización
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          client_id: params.clientId,
          folio: params.folio,
          concepto: params.concepto,
          fecha_cotizacion: params.fechaCotizacion.toISOString().split('T')[0],
          fecha_entrega: params.fechaEntrega?.toISOString().split('T')[0] || null,
          factura_anterior: params.facturaAnterior || null,
          fecha_factura_anterior: params.fechaFacturaAnterior?.toISOString().split('T')[0] || null,
          monto_factura_anterior: params.montoFacturaAnterior || null,
          subtotal: params.subtotal,
          total: params.total,
          status: "borrador",
          notes: params.notes || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (quoteError) throw quoteError;

      // Insertar items
      const itemsToInsert = params.items.map(item => ({
        quote_id: quote.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        nombre_producto: item.nombre_producto,
        marca: item.marca,
        lote: item.lote,
        fecha_caducidad: item.fecha_caducidad?.toISOString().split('T')[0] || null,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        importe: item.importe,
        tipo_precio: item.tipo_precio || "1",
      }));

      const { error: itemsError } = await supabase
        .from("quote_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      return quote;
    },
    onSuccess: () => {
      toast.success("Cotización guardada correctamente");
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    onError: (error: any) => {
      toast.error("Error al guardar: " + error.message);
    },
  });

  // Actualizar cotización existente
  const updateQuoteMutation = useMutation({
    mutationFn: async (params: UpdateQuoteParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Actualizar cotización
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .update({
          client_id: params.clientId,
          concepto: params.concepto,
          fecha_cotizacion: params.fechaCotizacion.toISOString().split('T')[0],
          fecha_entrega: params.fechaEntrega?.toISOString().split('T')[0] || null,
          factura_anterior: params.facturaAnterior || null,
          fecha_factura_anterior: params.fechaFacturaAnterior?.toISOString().split('T')[0] || null,
          monto_factura_anterior: params.montoFacturaAnterior || null,
          subtotal: params.subtotal,
          total: params.total,
          notes: params.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.quoteId)
        .select()
        .single();

      if (quoteError) throw quoteError;

      // Eliminar items existentes
      const { error: deleteError } = await supabase
        .from("quote_items")
        .delete()
        .eq("quote_id", params.quoteId);

      if (deleteError) throw deleteError;

      // Insertar nuevos items
      const itemsToInsert = params.items.map(item => ({
        quote_id: params.quoteId,
        product_id: item.product_id,
        batch_id: item.batch_id,
        nombre_producto: item.nombre_producto,
        marca: item.marca,
        lote: item.lote,
        fecha_caducidad: item.fecha_caducidad?.toISOString().split('T')[0] || null,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        importe: item.importe,
        tipo_precio: item.tipo_precio || "1",
      }));

      const { error: itemsError } = await supabase
        .from("quote_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      return quote;
    },
    onSuccess: () => {
      toast.success("Cotización actualizada correctamente");
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    onError: (error: any) => {
      toast.error("Error al actualizar: " + error.message);
    },
  });

  // Validar stock disponible - retorna resultado con advertencias en lugar de bloquear
  const validateStock = async (items: ApproveQuoteParams["items"]): Promise<StockValidationResult> => {
    const warnings: string[] = [];

    for (const item of items) {
      const { data: batch } = await supabase
        .from("product_batches")
        .select("current_quantity, batch_number")
        .eq("id", item.batch_id)
        .single();

      if (!batch || batch.current_quantity < item.cantidad) {
        warnings.push(
          `${item.nombre_producto} (Lote: ${batch?.batch_number || item.batch_id}): Disponible ${batch?.current_quantity || 0}, Solicitado ${item.cantidad}`
        );
      }
    }

    return {
      isValid: warnings.length === 0,
      warnings
    };
  };

  // Aprobar cotización (convertir en venta)
  const approveQuoteMutation = useMutation({
    mutationFn: async (params: ApproveQuoteParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Validar stock - solo bloquear si no se fuerza la aprobación
      const stockValidation = await validateStock(params.items);
      if (!stockValidation.isValid && !params.forceApprove) {
        // Retornar las advertencias para que el UI muestre el diálogo de confirmación
        throw { 
          type: "STOCK_WARNING", 
          warnings: stockValidation.warnings,
          message: `Stock insuficiente:\n${stockValidation.warnings.join("\n")}`
        };
      }

      // Procesar cada item: descontar stock, crear movimiento y guardar batch_id
      for (const item of params.items) {
        // Obtener stock actual del lote
        const { data: batch } = await supabase
          .from("product_batches")
          .select("current_quantity, product_id, batch_number, expiration_date")
          .eq("id", item.batch_id)
          .single();

        if (!batch) throw new Error(`Lote no encontrado: ${item.batch_id}`);

        const newBatchQuantity = batch.current_quantity - item.cantidad;

        // Actualizar stock del lote
        const { error: batchError } = await supabase
          .from("product_batches")
          .update({ current_quantity: newBatchQuantity })
          .eq("id", item.batch_id);

        if (batchError) throw batchError;

        // Obtener stock actual del producto
        const { data: product } = await supabase
          .from("products")
          .select("current_stock")
          .eq("id", item.product_id)
          .single();

        if (product) {
          // Actualizar stock del producto
          const newProductStock = (product.current_stock || 0) - item.cantidad;
          await supabase
            .from("products")
            .update({ current_stock: newProductStock })
            .eq("id", item.product_id);
        }

        // Crear movimiento de inventario (salida)
        const { error: movementError } = await supabase
          .from("inventory_movements")
          .insert({
            product_id: item.product_id,
            movement_type: "salida",
            quantity: item.cantidad,
            previous_stock: batch.current_quantity,
            new_stock: newBatchQuantity,
            reference_type: "venta",
            reference_id: params.quoteId,
            notes: `Venta - Cotización ${params.quoteId}`,
            created_by: user.id,
          });

        if (movementError) throw movementError;

        // Actualizar quote_item con batch_id, lote y fecha_caducidad seleccionados
        await supabase
          .from("quote_items")
          .update({
            batch_id: item.batch_id,
            lote: batch.batch_number,
            fecha_caducidad: batch.expiration_date,
          })
          .eq("quote_id", params.quoteId)
          .eq("product_id", item.product_id);
      }

      // Actualizar estado de la cotización
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          status: "aprobada",
          approved_at: new Date().toISOString(),
          approved_by: user.id,
          inventory_exit_status: "pending", // Track inventory exit status
        })
        .eq("id", params.quoteId);

      if (quoteError) throw quoteError;

      return params.quoteId;
    },
    onSuccess: () => {
      toast.success("¡Cotización aprobada! Stock actualizado correctamente.");
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["product-batches"] });
    },
    onError: (error: any) => {
      toast.error("Error al aprobar: " + error.message);
    },
  });

  // Cancelar cotización aprobada (devolver stock)
  const cancelQuoteMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Obtener items de la cotización
      const { data: items, error: itemsError } = await supabase
        .from("quote_items")
        .select("product_id, batch_id, cantidad, nombre_producto")
        .eq("quote_id", quoteId);

      if (itemsError) throw itemsError;
      if (!items || items.length === 0) throw new Error("No se encontraron items");

      // Devolver stock para cada item
      for (const item of items) {
        if (!item.batch_id || !item.product_id) continue;

        // Obtener stock actual del lote
        const { data: batch } = await supabase
          .from("product_batches")
          .select("current_quantity")
          .eq("id", item.batch_id)
          .single();

        if (!batch) continue;

        const newBatchQuantity = batch.current_quantity + item.cantidad;

        // Actualizar stock del lote
        await supabase
          .from("product_batches")
          .update({ current_quantity: newBatchQuantity })
          .eq("id", item.batch_id);

        // Obtener y actualizar stock del producto
        const { data: product } = await supabase
          .from("products")
          .select("current_stock")
          .eq("id", item.product_id)
          .single();

        if (product) {
          const newProductStock = (product.current_stock || 0) + item.cantidad;
          await supabase
            .from("products")
            .update({ current_stock: newProductStock })
            .eq("id", item.product_id);
        }

        // Crear movimiento de inventario (entrada por cancelación)
        await supabase
          .from("inventory_movements")
          .insert({
            product_id: item.product_id,
            movement_type: "entrada",
            quantity: item.cantidad,
            previous_stock: batch.current_quantity,
            new_stock: newBatchQuantity,
            reference_type: "cancelacion_venta",
            reference_id: quoteId,
            notes: `Cancelación de venta - Cotización ${quoteId}`,
            created_by: user.id,
          });
      }

      // Actualizar estado de la cotización
      const { error: quoteError } = await supabase
        .from("quotes")
        .update({
          status: "cancelada",
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.id,
        })
        .eq("id", quoteId);

      if (quoteError) throw quoteError;

      return quoteId;
    },
    onSuccess: () => {
      toast.success("Venta cancelada. Stock devuelto correctamente.");
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["product-batches"] });
    },
    onError: (error: any) => {
      toast.error("Error al cancelar: " + error.message);
    },
  });

  return {
    saveQuote: saveQuoteMutation.mutateAsync,
    updateQuote: updateQuoteMutation.mutateAsync,
    approveQuote: approveQuoteMutation.mutateAsync,
    cancelQuote: cancelQuoteMutation.mutateAsync,
    isSaving: saveQuoteMutation.isPending,
    isUpdating: updateQuoteMutation.isPending,
    isApproving: approveQuoteMutation.isPending,
    isCancelling: cancelQuoteMutation.isPending,
    validateStock,
  };
};
