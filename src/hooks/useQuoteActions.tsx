import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";
import { toLocalDateStr } from "@/lib/formatters";

interface QuoteItem {
  id: string;
  product_id: string | null;
  batch_id: string | null;
  warehouse_id?: string | null;
  nombre_producto: string;
  marca: string;
  lote: string;
  fecha_caducidad: Date | null;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  tipo_precio: string; // "1", "2", "3", "4", or "manual"
  is_sub_product?: boolean;
  parent_item_id?: string | null;
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
  warehouseId: string;
  items: Array<{
    item_id: string;
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
          fecha_cotizacion: toLocalDateStr(params.fechaCotizacion),
          fecha_entrega: params.fechaEntrega ? toLocalDateStr(params.fechaEntrega) : null,
          factura_anterior: params.facturaAnterior || null,
          fecha_factura_anterior: params.fechaFacturaAnterior ? toLocalDateStr(params.fechaFacturaAnterior) : null,
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
      // First pass: insert parent items to get their DB ids
      const parentItems = params.items.filter(item => !item.is_sub_product);
      const subItems = params.items.filter(item => item.is_sub_product);

      const parentItemsToInsert = parentItems.map(item => ({
        quote_id: quote.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        warehouse_id: item.warehouse_id || null,
        nombre_producto: item.nombre_producto,
        marca: item.marca,
        lote: item.lote,
        fecha_caducidad: item.fecha_caducidad ? toLocalDateStr(item.fecha_caducidad) : null,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        importe: item.importe,
        tipo_precio: item.tipo_precio || "1",
        is_sub_product: false,
      }));

      let parentIdMap = new Map<string, string>();

      if (parentItemsToInsert.length > 0) {
        const { data: insertedParents, error: parentError } = await supabase
          .from("quote_items")
          .insert(parentItemsToInsert)
          .select("id");
        if (parentError) throw parentError;
        // Map local item id to DB id
        parentItems.forEach((item, idx) => {
          if (insertedParents?.[idx]) {
            parentIdMap.set(item.id, insertedParents[idx].id);
          }
        });
      }

      // Second pass: insert sub-items with resolved parent_item_id
      if (subItems.length > 0) {
        const subItemsToInsert = subItems.map(item => ({
          quote_id: quote.id,
          product_id: item.product_id,
          batch_id: item.batch_id,
          warehouse_id: item.warehouse_id || null,
          nombre_producto: item.nombre_producto,
          marca: item.marca,
          lote: item.lote,
          fecha_caducidad: item.fecha_caducidad ? toLocalDateStr(item.fecha_caducidad) : null,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          importe: item.importe,
          tipo_precio: item.tipo_precio || "1",
          is_sub_product: true,
          parent_item_id: item.parent_item_id ? (parentIdMap.get(item.parent_item_id) || item.parent_item_id) : null,
        }));

        const { error: subError } = await supabase
          .from("quote_items")
          .insert(subItemsToInsert);
        if (subError) throw subError;
      }

      const itemsInserted = true;

      // Items already inserted above

      return quote;
    },
    onSuccess: (quote) => {
      toast.success("Cotización guardada correctamente");
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      logActivity({ section: "cotizaciones", action: "crear", entityType: "cotización", entityId: quote?.id, entityName: quote?.folio, details: { amount: quote?.total } });
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
          folio: params.folio,
          concepto: params.concepto,
          fecha_cotizacion: toLocalDateStr(params.fechaCotizacion),
          fecha_entrega: params.fechaEntrega ? toLocalDateStr(params.fechaEntrega) : null,
          factura_anterior: params.facturaAnterior || null,
          fecha_factura_anterior: params.fechaFacturaAnterior ? toLocalDateStr(params.fechaFacturaAnterior) : null,
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

      // Insert parent items first, then sub-items with resolved parent_item_id
      const parentItems = params.items.filter(item => !item.is_sub_product);
      const subItems = params.items.filter(item => item.is_sub_product);

      let parentIdMap = new Map<string, string>();

      if (parentItems.length > 0) {
        const parentItemsToInsert = parentItems.map(item => ({
          quote_id: params.quoteId,
          product_id: item.product_id,
          batch_id: item.batch_id,
          warehouse_id: item.warehouse_id || null,
          nombre_producto: item.nombre_producto,
          marca: item.marca,
          lote: item.lote,
          fecha_caducidad: item.fecha_caducidad ? toLocalDateStr(item.fecha_caducidad) : null,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          importe: item.importe,
          tipo_precio: item.tipo_precio || "1",
          is_sub_product: false,
        }));

        const { data: insertedParents, error: parentError } = await supabase
          .from("quote_items")
          .insert(parentItemsToInsert)
          .select("id");
        if (parentError) throw parentError;
        parentItems.forEach((item, idx) => {
          if (insertedParents?.[idx]) {
            parentIdMap.set(item.id, insertedParents[idx].id);
          }
        });
      }

      if (subItems.length > 0) {
        const subItemsToInsert = subItems.map(item => ({
          quote_id: params.quoteId,
          product_id: item.product_id,
          batch_id: item.batch_id,
          warehouse_id: item.warehouse_id || null,
          nombre_producto: item.nombre_producto,
          marca: item.marca,
          lote: item.lote,
          fecha_caducidad: item.fecha_caducidad ? toLocalDateStr(item.fecha_caducidad) : null,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          importe: item.importe,
          tipo_precio: item.tipo_precio || "1",
          is_sub_product: true,
          parent_item_id: item.parent_item_id ? (parentIdMap.get(item.parent_item_id) || null) : null,
        }));

        const { error: subError } = await supabase
          .from("quote_items")
          .insert(subItemsToInsert);
        if (subError) throw subError;
      }

      return quote;
    },
    onSuccess: (quote) => {
      toast.success("Cotización actualizada correctamente");
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      logActivity({ section: "cotizaciones", action: "editar", entityType: "cotización", entityId: quote?.id, entityName: quote?.folio });
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

      // 🛡️ BLINDAJE 1: Idempotencia. Si esta cotización ya tiene movimientos
      // de salida registrados, hubo un intento previo a medias. NO volver a
      // descontar stock; pedir intervención manual para revertir antes de re-aprobar.
      const { data: prevMovs, error: prevMovsError } = await supabase
        .from("inventory_movements")
        .select("id")
        .eq("reference_id", params.quoteId)
        .eq("reference_type", "venta")
        .eq("movement_type", "salida")
        .limit(1);
      if (prevMovsError) throw prevMovsError;
      if (prevMovs && prevMovs.length > 0) {
        throw new Error(
          "Esta cotización ya tiene movimientos de salida registrados de un intento anterior. " +
          "Contacta al administrador para revertir esos movimientos antes de re-aprobar (evita doble descuento de stock)."
        );
      }

      // Validar stock - solo bloquear si no se fuerza la aprobación
      const stockValidation = await validateStock(params.items);
      if (!stockValidation.isValid && !params.forceApprove) {
        throw { 
          type: "STOCK_WARNING", 
          warnings: stockValidation.warnings,
          message: `Stock insuficiente:\n${stockValidation.warnings.join("\n")}`
        };
      }

      // 🛡️ BLINDAJE 2: Pre-validación atómica. Verificar stock REAL en
      // batch_warehouse_stock para TODOS los items contra el almacén elegido
      // ANTES de tocar nada. Si alguno falla, abortar sin descontar.
      const preflightErrors: string[] = [];
      for (const item of params.items) {
        const { data: bwsCheck } = await (supabase as any)
          .from("batch_warehouse_stock")
          .select("quantity")
          .eq("batch_id", item.batch_id)
          .eq("warehouse_id", params.warehouseId)
          .maybeSingle();
        const available = bwsCheck?.quantity ?? 0;
        if (available < item.cantidad) {
          preflightErrors.push(
            `${item.nombre_producto}: disponible ${available}, solicitado ${item.cantidad}`
          );
        }
      }
      if (preflightErrors.length > 0) {
        throw new Error(
          "Stock insuficiente en el almacén seleccionado. No se descontó nada:\n" +
          preflightErrors.join("\n")
        );
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

        // Descontar stock del lote en batch_warehouse_stock
        // El trigger sync_stock_from_batch_warehouse se encarga de actualizar:
        // - product_batches.current_quantity
        // - warehouse_stock.current_stock
        // - products.current_stock
        const { data: bwsRow } = await (supabase as any)
          .from("batch_warehouse_stock")
          .select("id, quantity")
          .eq("batch_id", item.batch_id)
          .eq("warehouse_id", params.warehouseId)
          .maybeSingle();

        if (bwsRow && bwsRow.quantity > 0) {
          const availableBwsQty = bwsRow.quantity;
          if (availableBwsQty < item.cantidad) {
            throw new Error(
              `Stock insuficiente en almacén para ${item.nombre_producto}: disponible ${availableBwsQty}, solicitado ${item.cantidad}`
            );
          }
          const newBwsQty = availableBwsQty - item.cantidad;
          if (newBwsQty === 0) {
            await (supabase as any)
              .from("batch_warehouse_stock")
              .delete()
              .eq("id", bwsRow.id);
          } else {
            await (supabase as any)
              .from("batch_warehouse_stock")
              .update({ quantity: newBwsQty })
              .eq("id", bwsRow.id);
          }
        } else {
          throw new Error(
            `No hay stock del lote en el almacén seleccionado para ${item.nombre_producto}`
          );
        }

        // Crear movimiento de inventario (salida) con referencia al almacén y lote
        const { error: movementError } = await supabase
          .from("inventory_movements")
          .insert({
            product_id: item.product_id,
            batch_id: item.batch_id,
            movement_type: "salida",
            quantity: item.cantidad,
            previous_stock: batch.current_quantity,
            new_stock: newBatchQuantity,
            reference_type: "venta",
            reference_id: params.quoteId,
            location: params.warehouseId,
            notes: `Venta - Cotización ${params.quoteId}`,
            created_by: user.id,
          });

        if (movementError) throw movementError;

        // Actualizar quote_item con batch_id, lote y fecha_caducidad seleccionados
        // Usar item_id para precisión en caso de multi-lote (mismo producto, distintos lotes)
        await supabase
          .from("quote_items")
          .update({
            batch_id: item.batch_id,
            lote: batch.batch_number,
            fecha_caducidad: batch.expiration_date,
          })
          .eq("id", item.item_id);
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
    onSuccess: (quoteId) => {
      toast.success("¡Cotización aprobada! Stock actualizado correctamente.");
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["product-batches"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      logActivity({ section: "cotizaciones", action: "aprobar", entityType: "cotización", entityId: quoteId });
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

      // Obtener el almacén origen desde los movimientos de inventario de esta venta
      const { data: saleMovements } = await supabase
        .from("inventory_movements")
        .select("location, product_id")
        .eq("reference_id", quoteId)
        .eq("reference_type", "venta");

      const warehouseIdByProduct: Record<string, string> = {};
      (saleMovements || []).forEach(m => {
        if (m.product_id && m.location) warehouseIdByProduct[m.product_id] = m.location;
      });

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

        // Restaurar stock en batch_warehouse_stock
        // El trigger sync_stock_from_batch_warehouse se encarga de actualizar:
        // - product_batches.current_quantity
        // - warehouse_stock.current_stock
        // - products.current_stock
        const warehouseId = warehouseIdByProduct[item.product_id];
        if (warehouseId) {
          const { data: bwsRow } = await (supabase as any)
            .from("batch_warehouse_stock")
            .select("id, quantity")
            .eq("batch_id", item.batch_id)
            .eq("warehouse_id", warehouseId)
            .maybeSingle();

          if (bwsRow) {
            await (supabase as any)
              .from("batch_warehouse_stock")
              .update({ quantity: bwsRow.quantity + item.cantidad })
              .eq("id", bwsRow.id);
          } else {
            await (supabase as any)
              .from("batch_warehouse_stock")
              .insert({
                batch_id: item.batch_id,
                warehouse_id: warehouseId,
                quantity: item.cantidad,
              });
          }
        }

        // Crear movimiento de inventario (entrada por cancelación) con lote
        await supabase
          .from("inventory_movements")
          .insert({
            product_id: item.product_id,
            batch_id: item.batch_id,
            movement_type: "entrada",
            quantity: item.cantidad,
            previous_stock: batch.current_quantity,
            new_stock: newBatchQuantity,
            reference_type: "cancelacion_venta",
            reference_id: quoteId,
            location: warehouseId || null,
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
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
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
