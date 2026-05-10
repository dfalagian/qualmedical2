import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";
import { format } from "date-fns";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Info,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InventoryMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MovementType {
  code: string;
  label: string;
  direction: "E" | "S";
}

interface BatchStock {
  id: string;
  quantity: number;
  batch_id: string;
  warehouse_id: string;
  product_batches: {
    id: string;
    batch_number: string;
    expiration_date: string | null;
    product_id: string;
  };
  warehouses: { id: string; name: string };
}

interface MovementRow {
  rowId: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  batch_stock_id: string;
  movement_code: string;
  quantity: number | "";
  notes: string;
  // For products without existing batches (entry only)
  newBatchNumber: string;
  newBatchExpiration: string;
  newBatchWarehouseId: string;
}

const emptyRow = (productId: string, productName: string, productSku: string): MovementRow => ({
  rowId: crypto.randomUUID(),
  product_id: productId,
  product_name: productName,
  product_sku: productSku,
  batch_stock_id: "",
  movement_code: "",
  quantity: "",
  notes: "",
  newBatchNumber: "",
  newBatchExpiration: "",
  newBatchWarehouseId: "",
});

export function InventoryMovementModal({ open, onOpenChange }: InventoryMovementModalProps) {
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<MovementRow[]>([]);
  const [batchCache, setBatchCache] = useState<Record<string, BatchStock[]>>({});
  const [addProductId, setAddProductId] = useState("");
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [movTypeOpen, setMovTypeOpen] = useState<Record<string, boolean>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
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
        .select("id, sku, name")
        .eq("is_active", true)
        .eq("catalog_only", false)
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; sku: string; name: string }>;
    },
    enabled: open,
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

  const entradas = movementTypes.filter((m) => m.direction === "E");
  const salidas = movementTypes.filter((m) => m.direction === "S");

  // ── Helpers ───────────────────────────────────────────────────────────────
  const updateRow = (rowId: string, patch: Partial<MovementRow>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const removeRow = (rowId: string) =>
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));

  const getRowBatches = (row: MovementRow): BatchStock[] =>
    batchCache[row.product_id] ?? [];

  const getRowMovement = (row: MovementRow): MovementType | undefined =>
    movementTypes.find((m) => m.code === row.movement_code);

  const getRowBatchStock = (row: MovementRow): BatchStock | undefined =>
    getRowBatches(row).find((bs) => bs.id === row.batch_stock_id);

  const getRowStatus = (row: MovementRow): { valid: boolean; error?: string } => {
    const batches = getRowBatches(row);
    const mt = getRowMovement(row);
    const qty = typeof row.quantity === "number" ? row.quantity : 0;

    if (!row.movement_code) return { valid: false, error: "Selecciona tipo de movimiento" };
    if (qty <= 0) return { valid: false, error: "Ingresa una cantidad válida" };

    if (batches.length === 0) {
      if (mt?.direction === "S") return { valid: false, error: "Sin stock — no se puede registrar salida" };
      if (!row.newBatchNumber.trim()) return { valid: false, error: "Ingresa el número de lote" };
      if (!row.newBatchWarehouseId) return { valid: false, error: "Selecciona un almacén" };
    } else {
      if (!row.batch_stock_id) return { valid: false, error: "Selecciona lote / almacén" };
      const bs = getRowBatchStock(row);
      if (mt?.direction === "S" && bs && qty > bs.quantity)
        return { valid: false, error: `Supera stock (${bs.quantity} uds)` };
    }

    return { valid: true };
  };

  const validRows = rows.filter((r) => getRowStatus(r).valid);

  // ── Add product ───────────────────────────────────────────────────────────
  const handleAddProduct = async () => {
    if (!addProductId) return;
    const product = products.find((p) => p.id === addProductId);
    if (!product) return;

    setIsAdding(true);
    try {
      if (!(addProductId in batchCache)) {
        const { data, error } = await supabase
          .from("batch_warehouse_stock")
          .select(
            `id, quantity, batch_id, warehouse_id,
             product_batches!inner(id, batch_number, expiration_date, product_id),
             warehouses!inner(id, name)`
          )
          .eq("product_batches.product_id", addProductId)
          .gte("quantity", 0)
          .order("quantity", { ascending: false });
        if (error) throw error;
        setBatchCache((prev) => ({ ...prev, [addProductId]: (data as BatchStock[]) ?? [] }));

        const batches = (data as BatchStock[]) ?? [];
        const newRow = emptyRow(addProductId, product.name, product.sku);
        if (batches.length === 1) newRow.batch_stock_id = batches[0].id;
        setRows((prev) => [...prev, newRow]);
      } else {
        const batches = batchCache[addProductId];
        const newRow = emptyRow(addProductId, product.name, product.sku);
        if (batches.length === 1) newRow.batch_stock_id = batches[0].id;
        setRows((prev) => [...prev, newRow]);
      }
    } catch {
      toast.error("Error al cargar lotes del producto");
    } finally {
      setAddProductId("");
      setIsAdding(false);
    }
  };

  // ── Save all ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (validRows.length === 0) return;
    setIsSaving(true);

    let successCount = 0;
    const errors: string[] = [];

    for (const row of validRows) {
      try {
        const mt = getRowMovement(row)!;
        const isExit = mt.direction === "S";
        const qty = row.quantity as number;
        const batches = getRowBatches(row);

        if (batches.length === 0) {
          // Create new batch for entry
          const { data: createdBatch, error: batchErr } = await supabase
            .from("product_batches")
            .insert({
              product_id: row.product_id,
              batch_number: row.newBatchNumber.trim(),
              expiration_date: row.newBatchExpiration || null,
              barcode: "",
              initial_quantity: 0,
              current_quantity: 0,
            })
            .select("id")
            .single();
          if (batchErr) throw batchErr;

          const { data: createdBws, error: bwsErr } = await supabase
            .from("batch_warehouse_stock")
            .insert({
              batch_id: createdBatch.id,
              warehouse_id: row.newBatchWarehouseId,
              quantity: 0,
            })
            .select("id")
            .single();
          if (bwsErr) throw bwsErr;

          const { error: stockErr } = await supabase
            .from("batch_warehouse_stock")
            .update({ quantity: qty, updated_at: new Date().toISOString() })
            .eq("id", createdBws.id);
          if (stockErr) throw stockErr;

          await supabase.from("inventory_movements").insert({
            product_id: row.product_id,
            batch_id: createdBatch.id,
            movement_type: "entrada",
            quantity: qty,
            previous_stock: 0,
            new_stock: qty,
            reference_type: row.movement_code,
            location: row.newBatchWarehouseId,
            notes: row.notes.trim() || null,
          });
        } else {
          const bs = getRowBatchStock(row)!;
          const newQty = isExit ? bs.quantity - qty : bs.quantity + qty;

          const { error: stockErr } = await supabase
            .from("batch_warehouse_stock")
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq("id", row.batch_stock_id);
          if (stockErr) throw stockErr;

          await supabase.from("inventory_movements").insert({
            product_id: row.product_id,
            batch_id: bs.batch_id,
            movement_type: isExit ? "salida" : "entrada",
            quantity: qty,
            previous_stock: bs.quantity,
            new_stock: newQty,
            reference_type: row.movement_code,
            location: bs.warehouse_id,
            notes: row.notes.trim() || null,
          });
        }

        logActivity({
          section: "inventario",
          action: isExit ? "ajuste" : "entrada",
          entityType: "Movimiento",
          entityName: row.product_name,
          details: { tipo: row.movement_code, cantidad: qty },
        });

        successCount++;
      } catch {
        errors.push(row.product_name);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["batch-stocks-for-movement"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-movements-history"] });

    if (successCount > 0)
      toast.success(`${successCount} movimiento(s) registrado(s) correctamente`);
    if (errors.length > 0)
      toast.error(`Error en: ${errors.join(", ")}`);

    setIsSaving(false);
    if (errors.length === 0) handleClose();
    else {
      // Remove successfully saved rows, keep failed ones
      const failedNames = new Set(errors);
      setRows((prev) =>
        prev.filter((r) => failedNames.has(r.product_name) && !getRowStatus(r).valid)
      );
    }
  };

  const handleClose = () => {
    setRows([]);
    setBatchCache({});
    setAddProductId("");
    setMovTypeOpen({});
    onOpenChange(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl flex flex-col" style={{ maxHeight: "90vh" }}>
        <DialogHeader>
          <DialogTitle>Movimientos de Inventario</DialogTitle>
        </DialogHeader>

        {/* ── Product selector ── */}
        <div className="flex items-center gap-2 shrink-0">
          <Popover open={addProductOpen} onOpenChange={setAddProductOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={addProductOpen}
                className="flex-1 justify-between font-normal h-9"
              >
                {addProductId
                  ? products.find((p) => p.id === addProductId)?.name
                  : <span className="text-muted-foreground">Seleccionar producto para agregar...</span>}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar por nombre o SKU..." className="h-9" />
                <CommandList>
                  <CommandEmpty>No se encontró el producto.</CommandEmpty>
                  <CommandGroup>
                    {products.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`${p.name} ${p.sku}`}
                        onSelect={() => {
                          setAddProductId(p.id);
                          setAddProductOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            addProductId === p.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="flex-1 truncate">
                          {p.name}
                          <span className="text-muted-foreground ml-1 text-xs">({p.sku})</span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Button
            onClick={handleAddProduct}
            disabled={!addProductId || isAdding}
            className="h-9 shrink-0"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="ml-1">Agregar</span>
          </Button>
        </div>

        {/* ── Grid ── */}
        <div className="flex-1 min-h-0 border rounded-md overflow-auto">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Plus className="h-8 w-8 opacity-30" />
              <p className="text-sm">Agrega productos para registrar movimientos</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="min-w-[160px]">Producto</TableHead>
                  <TableHead className="min-w-[200px]">Lote / Almacén</TableHead>
                  <TableHead className="min-w-[180px]">Tipo de movimiento</TableHead>
                  <TableHead className="w-20 text-right">Disp.</TableHead>
                  <TableHead className="w-24">Cantidad</TableHead>
                  <TableHead className="min-w-[140px]">Notas</TableHead>
                  <TableHead className="w-8" />
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const batches = getRowBatches(row);
                  const mt = getRowMovement(row);
                  const bs = getRowBatchStock(row);
                  const isExit = mt?.direction === "S";
                  const qty = typeof row.quantity === "number" ? row.quantity : 0;
                  const exceeds = isExit && bs !== undefined && qty > bs.quantity;
                  const status = getRowStatus(row);
                  const hasNoBatches = row.product_id in batchCache && batches.length === 0;
                  const isExitNoBatch = hasNoBatches && isExit;
                  const isEntryNoBatch = hasNoBatches && !isExit && !!row.movement_code;

                  return (
                    <TableRow
                      key={row.rowId}
                      className={cn(
                        status.valid ? "bg-green-50/30" : "",
                        isExitNoBatch ? "bg-destructive/5" : ""
                      )}
                    >
                      {/* Producto */}
                      <TableCell className="py-2">
                        <p className="text-xs font-medium leading-tight truncate max-w-[155px]">
                          {row.product_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{row.product_sku}</p>
                      </TableCell>

                      {/* Lote / Almacén */}
                      <TableCell className="py-2">
                        {!hasNoBatches && batches.length > 0 ? (
                          <Select
                            value={row.batch_stock_id}
                            onValueChange={(v) =>
                              updateRow(row.rowId, { batch_stock_id: v, quantity: "" })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs w-full">
                              <SelectValue placeholder="Seleccionar lote..." />
                            </SelectTrigger>
                            <SelectContent>
                              {batches.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  <span className="font-mono text-xs">
                                    {b.product_batches.batch_number}
                                  </span>
                                  <span className="text-muted-foreground text-xs ml-1">
                                    — {b.warehouses.name}
                                  </span>
                                  <Badge
                                    variant={b.quantity > 0 ? "secondary" : "destructive"}
                                    className="ml-1 text-xs"
                                  >
                                    {b.quantity}
                                  </Badge>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : isExitNoBatch ? (
                          <span className="text-xs text-destructive flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Sin stock
                          </span>
                        ) : isEntryNoBatch ? (
                          <div className="space-y-1">
                            <Input
                              value={row.newBatchNumber}
                              onChange={(e) =>
                                updateRow(row.rowId, { newBatchNumber: e.target.value })
                              }
                              placeholder="N° lote *"
                              className="h-7 text-xs"
                            />
                            <Select
                              value={row.newBatchWarehouseId}
                              onValueChange={(v) =>
                                updateRow(row.rowId, { newBatchWarehouseId: v })
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Almacén *" />
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
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Selecciona tipo primero
                          </span>
                        )}
                      </TableCell>

                      {/* Tipo de movimiento */}
                      <TableCell className="py-2">
                        <Popover
                          open={movTypeOpen[row.rowId] ?? false}
                          onOpenChange={(o) =>
                            setMovTypeOpen((prev) => ({ ...prev, [row.rowId]: o }))
                          }
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="h-8 w-full justify-between font-normal text-xs px-2"
                            >
                              {mt ? (
                                <span className="flex items-center gap-1 truncate min-w-0">
                                  <span
                                    className={cn(
                                      "font-mono text-xs shrink-0",
                                      mt.direction === "E" ? "text-green-600" : "text-destructive"
                                    )}
                                  >
                                    [{mt.code}]
                                  </span>
                                  <span className="truncate">{mt.label}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Tipo...</span>
                              )}
                              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar por código o nombre..." className="h-8" />
                              <CommandList>
                                <CommandEmpty>No se encontró el tipo.</CommandEmpty>
                                {entradas.length > 0 && (
                                  <CommandGroup heading="Entradas">
                                    {entradas.map((m) => (
                                      <CommandItem
                                        key={m.code}
                                        value={`${m.code} ${m.label}`}
                                        onSelect={() => {
                                          updateRow(row.rowId, {
                                            movement_code: m.code,
                                            quantity: "",
                                            batch_stock_id: "",
                                          });
                                          setMovTypeOpen((prev) => ({ ...prev, [row.rowId]: false }));
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-3.5 w-3.5 shrink-0",
                                            row.movement_code === m.code ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <span className="font-mono text-xs text-green-600 mr-1.5">
                                          [{m.code}]
                                        </span>
                                        {m.label}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {entradas.length > 0 && salidas.length > 0 && <CommandSeparator />}
                                {salidas.length > 0 && (
                                  <CommandGroup heading="Salidas">
                                    {salidas.map((m) => (
                                      <CommandItem
                                        key={m.code}
                                        value={`${m.code} ${m.label}`}
                                        onSelect={() => {
                                          updateRow(row.rowId, {
                                            movement_code: m.code,
                                            quantity: "",
                                            batch_stock_id: "",
                                          });
                                          setMovTypeOpen((prev) => ({ ...prev, [row.rowId]: false }));
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-3.5 w-3.5 shrink-0",
                                            row.movement_code === m.code ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <span className="font-mono text-xs text-destructive mr-1.5">
                                          [{m.code}]
                                        </span>
                                        {m.label}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </TableCell>

                      {/* Disponible */}
                      <TableCell className="py-2 text-right">
                        <span className="text-xs text-muted-foreground">
                          {bs ? bs.quantity : hasNoBatches && !isExitNoBatch ? "—" : "—"}
                        </span>
                      </TableCell>

                      {/* Cantidad */}
                      <TableCell className="py-2">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={row.quantity}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateRow(row.rowId, {
                              quantity: v === "" ? "" : Number(v),
                            });
                          }}
                          placeholder="0"
                          className={cn(
                            "h-8 text-xs w-full",
                            exceeds ? "border-destructive" : ""
                          )}
                          disabled={isExitNoBatch}
                        />
                        {exceeds && (
                          <p className="text-xs text-destructive mt-0.5">
                            Max: {bs?.quantity}
                          </p>
                        )}
                      </TableCell>

                      {/* Notas */}
                      <TableCell className="py-2">
                        <Input
                          value={row.notes}
                          onChange={(e) => updateRow(row.rowId, { notes: e.target.value })}
                          placeholder="Notas opcionales"
                          className="h-8 text-xs w-full"
                        />
                      </TableCell>

                      {/* Estado */}
                      <TableCell className="py-2 px-1">
                        {status.valid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <span title={status.error}>
                            <AlertTriangle className="h-4 w-4 text-orange-400" />
                          </span>
                        )}
                      </TableCell>

                      {/* Eliminar */}
                      <TableCell className="py-2 px-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(row.rowId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between shrink-0 pt-1">
          <div className="text-xs text-muted-foreground">
            {rows.length > 0 && (
              <>
                <span className="text-green-600 font-medium">{validRows.length}</span>
                {" listo(s) · "}
                <span>{rows.length - validRows.length} pendiente(s)</span>
              </>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={validRows.length === 0 || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                `Guardar${validRows.length > 0 ? ` (${validRows.length})` : ""}`
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
