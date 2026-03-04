import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Printer, ArrowRightLeft, Package, Tag as TagIcon, Check, X, Pencil, Trash2, ChevronDown, ChevronUp, Plus, Search, Eye, Truck, PackageCheck } from "lucide-react";
import { TransferReceptionScanDialog } from "./TransferReceptionScanDialog";
import { openWarehouseTransferPrint, TransferPrintItem, TransferPrintData } from "./warehouseTransferPrint";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLogger";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TransferRecord {
  id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  product_id: string | null;
  rfid_tag_id: string | null;
  batch_id: string | null;
  quantity: number | null;
  transfer_type: string;
  notes: string | null;
  created_at: string;
  status: string;
  transfer_group_id: string | null;
  from_warehouse?: { name: string } | null;
  to_warehouse?: { name: string } | null;
  products?: { name: string; brand: string | null; unit: string | null; sku?: string } | null;
  product_batches?: { batch_number: string; expiration_date: string } | null;
  rfid_tags?: {
    epc: string;
    product_id?: string | null;
    products?: { name: string; brand: string | null; unit: string | null } | null;
    product_batches?: { batch_number: string; expiration_date: string } | null;
  } | null;
}

interface GroupedTransfer {
  key: string;
  groupId: string | null;
  date: string;
  fromWarehouse: string;
  fromWarehouseId: string;
  toWarehouse: string;
  toWarehouseId: string;
  items: TransferRecord[];
  notes: string | null;
  status: string;
}

export function WarehouseTransferHistory() {
  const [transferSearch, setTransferSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "approve" | "confirm" | "cancel" | "deleteItem"; group?: GroupedTransfer; itemId?: string } | null>(null);
  const [editingItem, setEditingItem] = useState<{ id: string; quantity: number } | null>(null);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newProductId, setNewProductId] = useState<string>("");
  const [newBatchId, setNewBatchId] = useState<string>("");
  const [newQuantity, setNewQuantity] = useState<number>(1);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [receptionDialogGroup, setReceptionDialogGroup] = useState<GroupedTransfer | null>(null);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ["warehouse_transfers_history"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("warehouse_transfers")
        .select(`
          *,
          from_warehouse:warehouses!warehouse_transfers_from_warehouse_id_fkey(name),
          to_warehouse:warehouses!warehouse_transfers_to_warehouse_id_fkey(name),
          products:product_id(name, brand, unit, sku),
          product_batches:batch_id(batch_number, expiration_date),
          rfid_tags:rfid_tag_id(
            epc,
            product_id,
            products:product_id(name, brand, unit),
            product_batches:batch_id(batch_number, expiration_date)
          )
        `) as any)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as TransferRecord[];
    },
  });

  // Group transfers by transfer_group_id or by timestamp + warehouses
  const grouped: GroupedTransfer[] = [];
  const seen = new Set<string>();

  for (const t of transfers) {
    const key = t.transfer_group_id || `${t.created_at.slice(0, 16)}_${t.from_warehouse_id}_${t.to_warehouse_id}`;

    if (!seen.has(key)) {
      seen.add(key);
      const groupItems = transfers.filter(x =>
        t.transfer_group_id
          ? x.transfer_group_id === t.transfer_group_id
          : (x.created_at.slice(0, 16) === t.created_at.slice(0, 16) &&
             x.from_warehouse_id === t.from_warehouse_id &&
             x.to_warehouse_id === t.to_warehouse_id)
      );
      grouped.push({
        key,
        groupId: t.transfer_group_id,
        date: t.created_at,
        fromWarehouse: (t.from_warehouse as any)?.name || "—",
        fromWarehouseId: t.from_warehouse_id,
        toWarehouse: (t.to_warehouse as any)?.name || "—",
        toWarehouseId: t.to_warehouse_id,
        items: groupItems,
        notes: t.notes,
        status: t.status || "aprobada",
      });
    }
  }

  // Filter grouped transfers by search term
  const filteredGrouped = transferSearch.trim()
    ? grouped.filter((group) => {
        const term = transferSearch.toLowerCase();
        return group.items.some((item) => {
          const isRfid = item.transfer_type === "rfid";
          const prodName = isRfid
            ? (item.rfid_tags as any)?.products?.name
            : (item.products as any)?.name;
          const batchNum = isRfid
            ? (item.rfid_tags as any)?.product_batches?.batch_number
            : (item.product_batches as any)?.batch_number;
          const prodSku = isRfid
            ? null
            : (item.products as any)?.sku;
          return (
            (prodName && prodName.toLowerCase().includes(term)) ||
            (prodSku && prodSku.toLowerCase().includes(term)) ||
            (batchNum && batchNum.toLowerCase().includes(term)) ||
            (group.notes && group.notes.toLowerCase().includes(term))
          );
        });
      })
    : grouped;

  // Derive the group being added to (after grouped is built)
  const addingGroup = addingToGroup ? grouped.find(g => g.key === addingToGroup) : null;

  // Products available in source warehouse for adding to pending transfer
  const { data: availableProducts = [] } = useQuery({
    queryKey: ["products_for_transfer_add", addingGroup?.fromWarehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("product_id, current_stock, products:product_id(id, name, sku, brand, unit)")
        .eq("warehouse_id", addingGroup!.fromWarehouseId)
        .gt("current_stock", 0);
      if (error) throw error;
      return (data || []).map((ws: any) => ({
        id: ws.products?.id,
        name: ws.products?.name,
        brand: ws.products?.brand,
        unit: ws.products?.unit,
        current_stock: ws.current_stock,
      })).filter((p: any) => p.id).sort((a: any, b: any) => a.name?.localeCompare(b.name));
    },
    enabled: !!addingGroup?.fromWarehouseId,
  });

  // Batches for selected product
  const { data: newProductBatches = [] } = useQuery({
    queryKey: ["batches_for_transfer_add", newProductId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, expiration_date, current_quantity")
        .eq("product_id", newProductId)
        .eq("is_active", true)
        .gt("current_quantity", 0)
        .order("expiration_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!newProductId,
  });

  // Add product to pending transfer mutation
  const addProductMutation = useMutation({
    mutationFn: async ({ group, productId, batchId, quantity }: { group: GroupedTransfer; productId: string; batchId?: string; quantity: number }) => {
      const { error } = await supabase.from("warehouse_transfers").insert({
        from_warehouse_id: group.fromWarehouseId,
        to_warehouse_id: group.toWarehouseId,
        product_id: productId,
        batch_id: batchId || null,
        quantity,
        transfer_type: "manual",
        status: "pendiente",
        transfer_group_id: group.groupId,
        notes: group.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers_history"] });
      setNewProductId("");
      setNewBatchId("");
      setNewQuantity(1);
      setAddingToGroup(null);
      toast({ title: "Producto agregado a la transferencia" });
    },
    onError: (error: Error) => {
      toast({ title: "Error al agregar", description: error.message, variant: "destructive" });
    },
  });

  // Approve mutation - marks as "en_curso" (NO stock movement)
  const approveMutation = useMutation({
    mutationFn: async (group: GroupedTransfer) => {
      const itemIds = group.items.map(i => i.id);
      const { data: { user } } = await supabase.auth.getUser();

      const { data: updatedRows, error: statusError } = await supabase
        .from("warehouse_transfers")
        .update({
          status: "en_curso",
          approved_at: new Date().toISOString(),
          approved_by: user?.id || null,
        })
        .in("id", itemIds)
        .eq("status", "pendiente")
        .select("id");

      if (statusError) throw statusError;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error("Esta transferencia ya fue procesada anteriormente.");
      }
    },
    onSuccess: (_, group) => {
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers_history"] });

      logActivity({
        section: "inventario",
        action: "aprobar",
        entityType: "Transferencia Almacén",
        entityName: `${group.fromWarehouse} → ${group.toWarehouse} (en curso)`,
        details: { items_count: group.items.length },
      });

      toast({ title: "Traslado en curso", description: "La transferencia ha sido aprobada. Confirme la recepción cuando llegue al destino." });
    },
    onError: (error: Error) => {
      toast({ title: "Error al aprobar", description: error.message, variant: "destructive" });
    },
  });

  // Confirm mutation - applies stock changes (from "en_curso" to "completada")
  const confirmMutation = useMutation({
    mutationFn: async (group: GroupedTransfer) => {
      const itemIds = group.items.map(i => i.id);
      const { data: { user } } = await supabase.auth.getUser();

      // Atomically mark as completada to prevent double-click
      const { data: updatedRows, error: statusError } = await supabase
        .from("warehouse_transfers")
        .update({
          status: "completada",
          confirmed_at: new Date().toISOString(),
          confirmed_by: user?.id || null,
        })
        .in("id", itemIds)
        .eq("status", "en_curso")
        .select("id");

      if (statusError) throw statusError;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error("Esta transferencia ya fue procesada o no está en curso.");
      }

      // THEN: Apply stock changes
      try {
        for (const item of group.items) {
          if (item.transfer_type === "rfid" && item.rfid_tag_id) {
            const { error: tagError } = await supabase
              .from("rfid_tags")
              .update({
                warehouse_id: group.toWarehouseId,
                last_location: group.toWarehouse,
                last_read_at: new Date().toISOString(),
              })
              .eq("id", item.rfid_tag_id);
            if (tagError) throw tagError;
          } else if (item.transfer_type === "manual" && item.product_id && item.quantity) {
            const { data: sourceStock } = await supabase
              .from("warehouse_stock")
              .select("current_stock")
              .eq("product_id", item.product_id)
              .eq("warehouse_id", group.fromWarehouseId)
              .maybeSingle();

            if (!sourceStock || sourceStock.current_stock < item.quantity) {
              const prodName = (item.products as any)?.name || "Producto";
              throw new Error(`Stock insuficiente para ${prodName} en almacén origen`);
            }

            await supabase
              .from("warehouse_stock")
              .update({ current_stock: sourceStock.current_stock - item.quantity })
              .eq("product_id", item.product_id)
              .eq("warehouse_id", group.fromWarehouseId);

            const { data: destStock } = await supabase
              .from("warehouse_stock")
              .select("current_stock")
              .eq("product_id", item.product_id)
              .eq("warehouse_id", group.toWarehouseId)
              .maybeSingle();

            if (destStock) {
              await supabase
                .from("warehouse_stock")
                .update({ current_stock: destStock.current_stock + item.quantity })
                .eq("product_id", item.product_id)
                .eq("warehouse_id", group.toWarehouseId);
            } else {
              await supabase
                .from("warehouse_stock")
                .insert({
                  product_id: item.product_id,
                  warehouse_id: group.toWarehouseId,
                  current_stock: item.quantity,
                });
            }
          }
        }
      } catch (stockError) {
        // Revert status back to en_curso if stock changes fail
        await supabase
          .from("warehouse_transfers")
          .update({ status: "en_curso", confirmed_at: null, confirmed_by: null })
          .in("id", itemIds);
        throw stockError;
      }
    },
    onSuccess: (_, group) => {
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers_history"] });
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products_for_transfer"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_stock"] });

      logActivity({
        section: "inventario",
        action: "confirmar_recepcion",
        entityType: "Transferencia Almacén",
        entityName: `${group.fromWarehouse} → ${group.toWarehouse}`,
        details: { items_count: group.items.length },
      });

      handlePrint(group);

      toast({ title: "Transferencia completada", description: "El stock se ha movido correctamente al almacén destino." });
    },
    onError: (error: Error) => {
      toast({ title: "Error al confirmar", description: error.message, variant: "destructive" });
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (group: GroupedTransfer) => {
      const itemIds = group.items.map(i => i.id);
      await supabase
        .from("warehouse_transfers")
        .update({ status: "cancelada" })
        .in("id", itemIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers_history"] });
      toast({ title: "Transferencia cancelada" });
    },
  });

  // Delete single item from pending transfer
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("warehouse_transfers")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers_history"] });
      toast({ title: "Producto eliminado de la transferencia" });
    },
  });

  // Update quantity mutation for pending items
  const updateQuantityMutation = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      const { error } = await supabase
        .from("warehouse_transfers")
        .update({ quantity })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers_history"] });
      setEditingItem(null);
      toast({ title: "Cantidad actualizada" });
    },
    onError: (error: Error) => {
      toast({ title: "Error al actualizar", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveQuantity = useCallback(() => {
    if (editingItem && editingItem.quantity > 0) {
      updateQuantityMutation.mutate({ itemId: editingItem.id, quantity: editingItem.quantity });
    }
  }, [editingItem, updateQuantityMutation]);

  const handlePrint = (group: GroupedTransfer) => {
    const printItems: TransferPrintItem[] = group.items.map((item, idx) => {
      if (item.transfer_type === "rfid" && item.rfid_tags) {
        const tag = item.rfid_tags as any;
        return {
          index: idx + 1,
          productName: tag.products?.name || "Sin producto",
          brand: tag.products?.brand || "",
          batchNumber: tag.product_batches?.batch_number || "",
          expirationDate: tag.product_batches?.expiration_date
            ? format(new Date(tag.product_batches.expiration_date), "dd/MM/yyyy")
            : "",
          quantity: 1,
          unit: tag.products?.unit || "pieza",
          epc: tag.epc,
          type: "rfid" as const,
        };
      } else {
        const prod = item.products as any;
        const batch = item.product_batches as any;
        return {
          index: idx + 1,
          productName: prod?.name || "Sin producto",
          brand: prod?.brand || "",
          batchNumber: batch?.batch_number || "",
          expirationDate: batch?.expiration_date
            ? format(new Date(batch.expiration_date + "T00:00:00"), "dd/MM/yyyy")
            : "",
          quantity: item.quantity || 0,
          unit: prod?.unit || "pieza",
          type: "manual" as const,
        };
      }
    });

    openWarehouseTransferPrint({
      transferDate: new Date(group.date),
      fromWarehouse: group.fromWarehouse,
      toWarehouse: group.toWarehouse,
      items: printItems,
      notes: group.notes || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pendiente":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pendiente</Badge>;
      case "en_curso":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 gap-1"><Truck className="h-3 w-3" />Traslado en curso</Badge>;
      case "completada":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Completada</Badge>;
      case "aprobada":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Completada</Badge>;
      case "cancelada":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Cancelada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Cargando historial...</div>;
  }

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ArrowRightLeft className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">No hay transferencias registradas</p>
      </div>
    );
  }

  return (
    <>
      {/* Search bar */}
      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre de producto, lote o notas..."
          value={transferSearch}
          onChange={(e) => setTransferSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>
      {transferSearch.trim() && filteredGrouped.length > 0 && (() => {
        const term = transferSearch.toLowerCase();
        const completedGroups = filteredGrouped.filter(g => g.status === "completada");
        const matchedItemsTotal = completedGroups.reduce((sum, g) => {
          return sum + g.items.filter((item) => {
            const isRfid = item.transfer_type === "rfid";
            const prodName = isRfid ? (item.rfid_tags as any)?.products?.name : (item.products as any)?.name;
            const prodSku = isRfid ? null : (item.products as any)?.sku;
            const batchNum = isRfid ? (item.rfid_tags as any)?.product_batches?.batch_number : (item.product_batches as any)?.batch_number;
            return (
              (prodName && prodName.toLowerCase().includes(term)) ||
              (prodSku && prodSku.toLowerCase().includes(term)) ||
              (batchNum && batchNum.toLowerCase().includes(term))
            );
          }).reduce((s, i) => s + (i.quantity || 1), 0);
        }, 0);
        return (
          <div className="mb-3 p-3 bg-muted/50 rounded-lg border">
            <p className="text-sm font-medium">
              Total transferido del producto buscado (completadas):{" "}
              <span className="text-primary font-bold">
                {matchedItemsTotal} unidades
              </span>
              {" "}en {completedGroups.length} transferencia(s) completada(s) de {filteredGrouped.length} encontrada(s)
            </p>
          </div>
        );
      })()}
      <ScrollArea className="h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Productos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="w-[200px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredGrouped.map((group) => {
              const totalQty = group.items.reduce((s, i) => s + (i.quantity || 1), 0);
              const hasRfid = group.items.some((i) => i.transfer_type === "rfid");
              const hasManual = group.items.some((i) => i.transfer_type === "manual");
              const isPending = group.status === "pendiente";
              const isEnCurso = group.status === "en_curso";
              const canEdit = isPending;
              const isExpanded = expandedGroup === group.key;

              return (
                <React.Fragment key={group.key}>
                  <TableRow className={isPending ? "bg-yellow-50/50" : isEnCurso ? "bg-blue-50/50" : ""}>
                    <TableCell className="text-xs">
                      {format(new Date(group.date), "dd/MM/yyyy HH:mm", { locale: es })}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{group.fromWarehouse}</TableCell>
                    <TableCell className="text-sm font-medium">{group.toWarehouse}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                        className="flex items-center gap-1 hover:underline"
                      >
                        <Badge variant="secondary">{totalQty} unidad{totalQty !== 1 ? "es" : ""}</Badge>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </TableCell>
                    <TableCell>{getStatusBadge(group.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {hasRfid && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <TagIcon className="h-3 w-3" /> RFID
                          </Badge>
                        )}
                        {hasManual && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Package className="h-3 w-3" /> Manual
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                      {group.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {/* Ver */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                          title="Ver transferencia"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {/* Editar (solo pendientes) */}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-primary hover:text-primary"
                            onClick={() => setExpandedGroup(group.key)}
                            title="Editar transferencia"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Imprimir */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => handlePrint(group)}
                          title="Imprimir reporte"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        {/* Aprobar traslado (pendiente → en_curso) */}
                        {isPending && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => setConfirmAction({ type: "approve", group })}
                            title="Aprobar traslado"
                            disabled={approveMutation.isPending}
                          >
                            <Truck className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Confirmar recepción (en_curso → completada) */}
                        {isEnCurso && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => setReceptionDialogGroup(group)}
                            title="Confirmar recepción"
                            disabled={confirmMutation.isPending}
                          >
                            <PackageCheck className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Eliminar / Cancelar (solo pendientes o en_curso) */}
                        {(isPending || isEnCurso) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setConfirmAction({ type: "cancel", group })}
                            title="Cancelar transferencia"
                            disabled={cancelMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded detail rows */}
                  {isExpanded && group.items.map((item) => {
                    const isRfid = item.transfer_type === "rfid";
                    const prodName = isRfid
                      ? (item.rfid_tags as any)?.products?.name || "Sin producto"
                      : (item.products as any)?.name || "Sin producto";
                    const batchNum = isRfid
                      ? (item.rfid_tags as any)?.product_batches?.batch_number
                      : (item.product_batches as any)?.batch_number;
                    const qty = item.quantity || 1;
                    const isEditingThis = editingItem?.id === item.id;

                    return (
                      <TableRow key={item.id} className="bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={3} className="text-xs">
                          <div className="flex items-center gap-2">
                            {isRfid ? <TagIcon className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                            <span className="font-medium">{prodName}</span>
                            {batchNum && <span className="text-muted-foreground">Lote: {batchNum}</span>}
                            {isEditingThis ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min={1}
                                  value={editingItem.quantity}
                                  onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 1 })}
                                  className="h-6 w-16 text-xs"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveQuantity();
                                    if (e.key === "Escape") setEditingItem(null);
                                  }}
                                  autoFocus
                                />
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600" onClick={handleSaveQuantity} disabled={updateQuantityMutation.isPending}>
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingItem(null)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Badge variant="secondary" className="text-xs">{qty} ud{qty !== 1 ? "s" : ""}</Badge>
                            )}
                            {isRfid && <span className="font-mono text-xs text-muted-foreground">{(item.rfid_tags as any)?.epc}</span>}
                          </div>
                        </TableCell>
                        <TableCell colSpan={3} />
                        <TableCell>
                          {canEdit && (
                            <div className="flex gap-0.5">
                              {!isRfid && !isEditingThis && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  onClick={() => setEditingItem({ id: item.id, quantity: qty })}
                                  title="Editar cantidad"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => setConfirmAction({ type: "deleteItem", itemId: item.id })}
                                title="Quitar de la transferencia"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Add product row for pending transfers (only when canEdit) */}
                  {isExpanded && isPending && addingToGroup === group.key && (
                    <TableRow className="bg-muted/20">
                      <TableCell />
                      <TableCell colSpan={5} className="text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Plus className="h-3 w-3 text-muted-foreground" />
                          
                          {/* Searchable product selector */}
                          <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 w-[220px] text-xs justify-start font-normal">
                                <Search className="h-3 w-3 mr-1 shrink-0" />
                                {newProductId
                                  ? availableProducts.find((p: any) => p.id === newProductId)?.name || "Producto"
                                  : "Buscar producto..."}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[280px] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Buscar por nombre..." className="text-xs" />
                                <CommandList>
                                  <CommandEmpty className="text-xs p-2">No se encontraron productos</CommandEmpty>
                                  <CommandGroup>
                                    {availableProducts.map((p: any) => (
                                      <CommandItem
                                        key={p.id}
                                        value={`${p.name} ${p.brand || ""}`}
                                        onSelect={() => {
                                          setNewProductId(p.id);
                                          setNewBatchId("");
                                          setProductSearchOpen(false);
                                        }}
                                        className="text-xs"
                                      >
                                        <div className="flex flex-col">
                                          <span className="font-medium">{p.name}</span>
                                          <span className="text-muted-foreground">
                                            {p.brand ? `${p.brand} · ` : ""}Stock: {p.current_stock} {p.unit || "uds"}
                                          </span>
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>

                          {/* Batch selector (appears after product is selected) */}
                          {newProductId && newProductBatches.length > 0 && (
                            <Select value={newBatchId} onValueChange={setNewBatchId}>
                              <SelectTrigger className="h-7 w-[180px] text-xs">
                                <SelectValue placeholder="Lote (opcional)" />
                              </SelectTrigger>
                              <SelectContent>
                                {newProductBatches.map((b: any) => (
                                  <SelectItem key={b.id} value={b.id} className="text-xs">
                                    {b.batch_number} — Cad: {format(new Date(b.expiration_date + "T00:00:00"), "dd/MM/yyyy")} ({b.current_quantity} uds)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          <Input
                            type="number"
                            min={1}
                            value={newQuantity}
                            onChange={(e) => setNewQuantity(parseInt(e.target.value) || 1)}
                            className="h-7 w-16 text-xs"
                            placeholder="Cant."
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600"
                            disabled={!newProductId || newQuantity < 1 || addProductMutation.isPending}
                            onClick={() => addProductMutation.mutate({ group, productId: newProductId, batchId: newBatchId || undefined, quantity: newQuantity })}
                            title="Confirmar"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => { setAddingToGroup(null); setNewProductId(""); setNewBatchId(""); setNewQuantity(1); }}
                            title="Cancelar"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  )}

                  {/* Add product button */}
                  {isExpanded && isPending && addingToGroup !== group.key && (
                    <TableRow className="bg-muted/10">
                      <TableCell />
                      <TableCell colSpan={7}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                          onClick={() => { setAddingToGroup(group.key); setExpandedGroup(group.key); }}
                        >
                          <Plus className="h-3 w-3" /> Agregar producto
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Reception scan dialog */}
      {receptionDialogGroup && (
        <TransferReceptionScanDialog
          open={!!receptionDialogGroup}
          onOpenChange={(open) => { if (!open) setReceptionDialogGroup(null); }}
          groupId={receptionDialogGroup.groupId}
          transferItems={receptionDialogGroup.items}
          fromWarehouse={receptionDialogGroup.fromWarehouse}
          toWarehouse={receptionDialogGroup.toWarehouse}
          onComplete={() => {
            confirmMutation.mutate(receptionDialogGroup);
            setReceptionDialogGroup(null);
          }}
        />
      )}

      {/* Confirmation dialogs */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "approve" && "¿Aprobar traslado?"}
              {confirmAction?.type === "confirm" && "¿Confirmar recepción?"}
              {confirmAction?.type === "cancel" && "¿Cancelar transferencia?"}
              {confirmAction?.type === "deleteItem" && "¿Eliminar producto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "approve" && "El traslado pasará a estado \"en curso\". El stock NO se moverá hasta que se confirme la recepción en destino."}
              {confirmAction?.type === "confirm" && "Se moverá el stock del almacén origen al destino. Esta acción no se puede deshacer."}
              {confirmAction?.type === "cancel" && "La transferencia se marcará como cancelada. No se moverá stock."}
              {confirmAction?.type === "deleteItem" && "Se eliminará este producto de la transferencia pendiente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmAction?.type === "approve" && confirmAction.group) {
                approveMutation.mutate(confirmAction.group);
              } else if (confirmAction?.type === "confirm" && confirmAction.group) {
                confirmMutation.mutate(confirmAction.group);
              } else if (confirmAction?.type === "cancel" && confirmAction.group) {
                cancelMutation.mutate(confirmAction.group);
              } else if (confirmAction?.type === "deleteItem" && confirmAction.itemId) {
                deleteItemMutation.mutate(confirmAction.itemId);
              }
              setConfirmAction(null);
            }}>
              Sí, confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
