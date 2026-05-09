import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";
import { format } from "date-fns";
import { AlertTriangle, Info } from "lucide-react";

interface InventoryMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MovementType {
  code: string;
  label: string;
  direction: "E" | "S";
}

const initialForm = {
  product_id: "",
  batch_stock_id: "",
  movement_code: "",
  quantity: "" as number | "",
  notes: "",
};

const initialNewBatch = {
  batch_number: "",
  expiration_date: "",
  warehouse_id: "",
};

export function InventoryMovementModal({ open, onOpenChange }: InventoryMovementModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [newBatch, setNewBatch] = useState(initialNewBatch);

  const { data: movementTypes = [] } = useQuery<MovementType[]>({
    queryKey: ["inventory-movement-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movement_types")
        .select("code, label, direction")
        .eq("is_active", true)
        .order("direction")
        .order("label");
      if (error) throw error;
      return data as MovementType[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-list-movement-modal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, current_stock")
        .eq("is_active", true)
        .eq("catalog_only", false)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: batchStocks = [], isLoading: batchStocksLoading } = useQuery({
    queryKey: ["batch-stocks-for-movement", form.product_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_warehouse_stock")
        .select(`
          id,
          quantity,
          batch_id,
          warehouse_id,
          product_batches!inner(id, batch_number, expiration_date, product_id),
          warehouses!inner(id, name)
        `)
        .eq("product_batches.product_id", form.product_id)
        .gte("quantity", 0)
        .order("quantity", { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string;
        quantity: number;
        batch_id: string;
        warehouse_id: string;
        product_batches: { id: string; batch_number: string; expiration_date: string | null; product_id: string };
        warehouses: { id: string; name: string };
      }>;
    },
    enabled: open && !!form.product_id,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-for-movement"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
    enabled: open,
  });

  const selectedBatchStock = batchStocks.find((bs) => bs.id === form.batch_stock_id);
  const selectedMovement = movementTypes.find((m) => m.code === form.movement_code);
  const isExit = selectedMovement?.direction === "S";
  const qty = form.quantity !== "" ? Number(form.quantity) : 0;
  const exceedsStock = isExit && selectedBatchStock !== undefined && qty > selectedBatchStock.quantity;

  const hasNoBatches = !!form.product_id && !batchStocksLoading && batchStocks.length === 0;
  const isEntryNoBatch = hasNoBatches && !!form.movement_code && !isExit;
  const isExitNoBatch = hasNoBatches && !!form.movement_code && isExit;

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!form.product_id || !form.movement_code || form.quantity === "")
        throw new Error("Completa todos los campos requeridos");
      if (qty <= 0) throw new Error("La cantidad debe ser mayor a cero");

      if (isEntryNoBatch) {
        if (!newBatch.batch_number.trim()) throw new Error("Ingresa el número de lote");
        if (!newBatch.warehouse_id) throw new Error("Selecciona un almacén");

        // Create batch
        const { data: createdBatch, error: batchError } = await supabase
          .from("product_batches")
          .insert({
            product_id: form.product_id,
            batch_number: newBatch.batch_number.trim(),
            expiration_date: newBatch.expiration_date || null,
            barcode: "",
            initial_quantity: 0,
            current_quantity: 0,
          })
          .select("id")
          .single();
        if (batchError) throw batchError;

        // Create batch_warehouse_stock with qty=0
        const { data: createdBws, error: bwsError } = await supabase
          .from("batch_warehouse_stock")
          .insert({
            batch_id: createdBatch.id,
            warehouse_id: newBatch.warehouse_id,
            quantity: 0,
          })
          .select("id")
          .single();
        if (bwsError) throw bwsError;

        // Update quantity — SSOT trigger cascades to product_batches + products
        const { error: stockError } = await supabase
          .from("batch_warehouse_stock")
          .update({ quantity: qty, updated_at: new Date().toISOString() })
          .eq("id", createdBws.id);
        if (stockError) throw stockError;

        const { error: movError } = await supabase.from("inventory_movements").insert({
          product_id: form.product_id,
          batch_id: createdBatch.id,
          movement_type: "entrada",
          quantity: qty,
          previous_stock: 0,
          new_stock: qty,
          reference_type: form.movement_code,
          location: newBatch.warehouse_id,
          notes: form.notes.trim() || null,
        });
        if (movError) throw movError;

        return { newQty: qty };
      }

      // Normal flow (batch already exists)
      if (!form.batch_stock_id) throw new Error("Selecciona un lote / almacén");
      if (exceedsStock) throw new Error("La cantidad supera el stock disponible en este lote/almacén");

      const bs = selectedBatchStock!;
      const newQty = isExit ? bs.quantity - qty : bs.quantity + qty;

      const { error: stockError } = await supabase
        .from("batch_warehouse_stock")
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq("id", form.batch_stock_id);
      if (stockError) throw stockError;

      const { error: movError } = await supabase.from("inventory_movements").insert({
        product_id: form.product_id,
        batch_id: bs.batch_id,
        movement_type: isExit ? "salida" : "entrada",
        quantity: qty,
        previous_stock: bs.quantity,
        new_stock: newQty,
        reference_type: form.movement_code,
        location: bs.warehouse_id,
        notes: form.notes.trim() || null,
      });
      if (movError) throw movError;

      return { newQty };
    },
    onSuccess: ({ newQty }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batch-stocks-for-movement"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-movements-history"] });

      const product = products.find((p) => p.id === form.product_id);
      const batchLabel = isEntryNoBatch
        ? newBatch.batch_number
        : selectedBatchStock?.product_batches?.batch_number;
      const warehouseLabel = isEntryNoBatch
        ? warehouses.find((w) => w.id === newBatch.warehouse_id)?.name
        : selectedBatchStock?.warehouses?.name;

      logActivity({
        section: "inventario",
        action: isExit ? "ajuste" : "entrada",
        entityType: "Movimiento",
        entityName: product?.name || form.product_id,
        details: {
          tipo: form.movement_code,
          tipo_label: selectedMovement?.label,
          lote: batchLabel,
          almacen: warehouseLabel,
          cantidad: qty,
          stock_nuevo: newQty,
          notas: form.notes || null,
        },
      });

      toast.success(
        `Movimiento registrado: ${selectedMovement?.label} — ${qty} ${qty === 1 ? "unidad" : "unidades"}`
      );
      setForm(initialForm);
      setNewBatch(initialNewBatch);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || "Error al registrar el movimiento");
    },
  });

  const handleCancel = () => {
    setForm(initialForm);
    setNewBatch(initialNewBatch);
    onOpenChange(false);
  };

  const isDisabled =
    !form.product_id ||
    !form.movement_code ||
    form.quantity === "" ||
    qty <= 0 ||
    isExitNoBatch ||
    exceedsStock ||
    (!isEntryNoBatch && !form.batch_stock_id) ||
    (isEntryNoBatch && (!newBatch.batch_number.trim() || !newBatch.warehouse_id)) ||
    moveMutation.isPending;

  const entradas = movementTypes.filter((m) => m.direction === "E");
  const salidas = movementTypes.filter((m) => m.direction === "S");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Movimiento de Inventario</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Producto */}
          <div className="space-y-1">
            <Label className="text-xs">
              Producto <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.product_id || ""}
              onValueChange={(v) => {
                setForm({ ...initialForm, product_id: v });
                setNewBatch(initialNewBatch);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleccionar producto..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground ml-1 text-xs">({p.sku})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de movimiento — shown before batch when product has no batches */}
          <div className="space-y-1">
            <Label className="text-xs">
              Tipo de Movimiento <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.movement_code || ""}
              onValueChange={(v) => setForm({ ...form, movement_code: v, quantity: "", batch_stock_id: "" })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleccionar tipo..." />
              </SelectTrigger>
              <SelectContent>
                {entradas.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Entradas
                    </div>
                    {entradas.map((m) => (
                      <SelectItem key={m.code} value={m.code}>
                        <span className="font-mono text-xs text-green-600 mr-2">[{m.code}]</span>
                        {m.label}
                      </SelectItem>
                    ))}
                  </>
                )}
                {salidas.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Salidas
                    </div>
                    {salidas.map((m) => (
                      <SelectItem key={m.code} value={m.code}>
                        <span className="font-mono text-xs text-destructive mr-2">[{m.code}]</span>
                        {m.label}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Lote + Almacén */}
          {form.product_id && (
            <div className="space-y-1">
              <Label className="text-xs">
                Lote / Almacén <span className="text-destructive">*</span>
              </Label>

              {batchStocksLoading ? (
                <p className="text-xs text-muted-foreground py-1">Cargando lotes...</p>
              ) : isExitNoBatch ? (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-xs">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Este producto no tiene stock registrado en ningún almacén. No es posible registrar una salida.
                    Para ingresar existencias, selecciona un tipo de <strong>Entrada</strong>.
                  </span>
                </div>
              ) : isEntryNoBatch ? (
                <div className="space-y-3 p-3 border rounded-md bg-blue-50/50 dark:bg-blue-950/20">
                  <div className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-400">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      Este producto no tiene lotes. Se creará un lote nuevo al registrar la entrada.
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">
                        N° de lote <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={newBatch.batch_number}
                        onChange={(e) => setNewBatch({ ...newBatch, batch_number: e.target.value })}
                        placeholder="Ej: LOT-001"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fecha de vencimiento</Label>
                      <Input
                        type="date"
                        value={newBatch.expiration_date}
                        onChange={(e) => setNewBatch({ ...newBatch, expiration_date: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Almacén <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={newBatch.warehouse_id}
                      onValueChange={(v) => setNewBatch({ ...newBatch, warehouse_id: v })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Seleccionar almacén..." />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <Select
                  value={form.batch_stock_id || ""}
                  onValueChange={(v) => setForm({ ...form, batch_stock_id: v, quantity: "" })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleccionar lote..." />
                  </SelectTrigger>
                  <SelectContent>
                    {batchStocks.map((bs) => (
                      <SelectItem key={bs.id} value={bs.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{bs.product_batches.batch_number}</span>
                          <span className="text-muted-foreground text-xs">— {bs.warehouses.name}</span>
                          <Badge
                            variant={bs.quantity > 0 ? "secondary" : "destructive"}
                            className="text-xs ml-1"
                          >
                            {bs.quantity} uds
                          </Badge>
                          {bs.product_batches.expiration_date && (
                            <span className="text-muted-foreground text-xs">
                              Cad:{" "}
                              {format(
                                new Date(bs.product_batches.expiration_date + "T00:00:00"),
                                "dd/MM/yyyy"
                              )}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Cantidad */}
          {form.movement_code && !isExitNoBatch && (
            <div className="space-y-1">
              <Label htmlFor="mov-qty" className="text-xs">
                Cantidad <span className="text-destructive">*</span>
                {selectedBatchStock && (
                  <span className="text-muted-foreground ml-2">
                    (disponible en lote: <strong>{selectedBatchStock.quantity}</strong>)
                  </span>
                )}
              </Label>
              <Input
                id="mov-qty"
                type="text"
                inputMode="numeric"
                value={form.quantity}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm({ ...form, quantity: val === "" ? "" : Number(val) });
                }}
                placeholder="0"
                className="h-9"
              />
              {exceedsStock && (
                <div className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  Supera el stock disponible en este lote ({selectedBatchStock?.quantity} uds)
                </div>
              )}
              {selectedBatchStock && form.quantity !== "" && qty > 0 && !exceedsStock && (
                <p className="text-xs text-muted-foreground">
                  Stock resultante:{" "}
                  <strong>
                    {isExit ? selectedBatchStock.quantity - qty : selectedBatchStock.quantity + qty} uds
                  </strong>
                </p>
              )}
              {isEntryNoBatch && form.quantity !== "" && qty > 0 && (
                <p className="text-xs text-muted-foreground">
                  Stock resultante: <strong>{qty} uds</strong>
                </p>
              )}
            </div>
          )}

          {/* Notas */}
          {!isExitNoBatch && (
            <div className="space-y-1">
              <Label htmlFor="mov-notes" className="text-xs">
                Justificación / Notas
              </Label>
              <Textarea
                id="mov-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Describe el motivo del movimiento (opcional)"
                className="min-h-[60px] resize-none"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={moveMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => moveMutation.mutate()}
            disabled={isDisabled}
            variant={isExit ? "destructive" : "default"}
          >
            {moveMutation.isPending
              ? "Registrando..."
              : isExit
              ? "Registrar Salida"
              : "Registrar Entrada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
