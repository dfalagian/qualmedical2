import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Save, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CipiItemsMatcherProps {
  requestId: string;
}

export function CipiItemsMatcher({ requestId }: CipiItemsMatcherProps) {
  const queryClient = useQueryClient();
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // Local overrides to show selected product name immediately (before refetch completes)
  const [localSelections, setLocalSelections] = useState<Record<string, { productId: string; productName: string } | null>>({});

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["cipi-request-items", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cipi_request_items")
        .select("*, products(id, name, sku, brand, grupo_sat)")
        .eq("cipi_request_id", requestId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["all-products-for-matching"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, brand, grupo_sat, current_stock")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleProductMatch = async (itemId: string, productId: string, productName: string) => {
    try {
      // Update local state immediately so the UI reflects the selection
      setLocalSelections(prev => ({ ...prev, [itemId]: { productId, productName } }));
      setOpenPopoverId(null);
      setSearchTerm("");
      
      const { error } = await supabase
        .from("cipi_request_items")
        .update({ product_id: productId, matched_product_name: productName })
        .eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
      // Clear local override after refetch
      setLocalSelections(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err: any) {
      // Revert local state on error
      setLocalSelections(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      toast.error(err.message || "Error al vincular producto");
    }
  };

  const handleClearMatch = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("cipi_request_items")
        .update({ product_id: null, matched_product_name: null })
        .eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("cipi_request_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
      toast.success("Línea eliminada");
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar");
    }
  };

  const handleClearLote = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("cipi_request_items")
        .update({ lote: null })
        .eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["cipi-request-items", requestId] });
      toast.success("Lote eliminado");
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar lote");
    }
  };

  const categoryColors: Record<string, string> = {
    MEDICAMENTOS: "bg-blue-100 text-blue-800",
    ONCOLOGICOS: "bg-red-100 text-red-800",
    INMUNOTERAPIA: "bg-purple-100 text-purple-800",
    SOLUCIONES: "bg-cyan-100 text-cyan-800",
    INSUMOS: "bg-orange-100 text-orange-800",
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No hay productos extraídos.</p>;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground mb-2">
        Seleccione el producto del inventario correspondiente para cada fila. Al seleccionar, se sobreescribe la descripción.
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Cat.</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-[120px]">Marca</TableHead>
              <TableHead className="w-[80px]">Lote</TableHead>
              <TableHead className="w-[60px]">Cant.</TableHead>
              <TableHead className="w-[90px]">P. Unit.</TableHead>
              <TableHead className="w-[70px]">IVA</TableHead>
              <TableHead className="w-[90px]">Precio</TableHead>
              <TableHead className="w-[250px]">Producto inventario</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>
                  {item.categoria && (
                    <Badge variant="outline" className={cn("text-[10px] px-1", categoryColors[item.categoria])}>
                      {item.categoria.substring(0, 4)}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {item.matched_product_name || item.descripcion}
                  {item.matched_product_name && item.matched_product_name !== item.descripcion && (
                    <span className="block text-[10px] text-muted-foreground line-through">
                      {item.descripcion}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs">{item.marca || "—"}</TableCell>
                <TableCell className="text-xs">
                  {item.lote ? (
                    <span className="flex items-center gap-1">
                      {item.lote}
                      <button
                        onClick={() => handleClearLote(item.id)}
                        className="text-destructive hover:text-destructive/80 p-0.5 rounded"
                        title="Eliminar lote"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-xs text-center">{item.cantidad}</TableCell>
                <TableCell className="text-xs text-right">
                  ${Number(item.precio_unitario).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-xs text-right">
                  ${Number(item.iva).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-xs text-right font-medium">
                  ${Number(item.precio).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>
                  <Popover
                    open={openPopoverId === item.id}
                    onOpenChange={(open) => {
                      setOpenPopoverId(open ? item.id : null);
                      if (!open) setSearchTerm("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "w-full justify-between text-xs h-7",
                          (item.product_id || localSelections[item.id]) && "border-green-300 bg-green-50"
                        )}
                      >
                        <span className="truncate">
                          {localSelections[item.id]
                            ? localSelections[item.id]!.productName
                            : item.product_id
                              ? (item.products?.name || item.matched_product_name || "Vinculado")
                              : "Seleccionar..."}
                        </span>
                        <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Buscar producto..."
                          className="text-xs"
                          value={searchTerm}
                          onValueChange={setSearchTerm}
                        />
                        <CommandList>
                          <CommandEmpty>No encontrado.</CommandEmpty>
                          <CommandGroup className="max-h-[200px] overflow-auto">
                            {item.product_id && (
                              <CommandItem
                                onSelect={() => handleClearMatch(item.id)}
                                className="text-xs text-destructive"
                              >
                                ✕ Quitar vinculación
                              </CommandItem>
                            )}
                            {(() => {
                              const term = searchTerm.toLowerCase().trim();
                              const filtered = term
                                ? products.filter((p: any) =>
                                    p.name.toLowerCase().includes(term) ||
                                    p.sku.toLowerCase().includes(term) ||
                                    (p.brand && p.brand.toLowerCase().includes(term)) ||
                                    (p.grupo_sat && p.grupo_sat.toLowerCase().includes(term))
                                  )
                                : products.slice(0, 50);
                              return filtered.slice(0, 50).map((product: any) => (
                                <CommandItem
                                  key={product.id}
                                  value={product.id}
                                  onSelect={() => handleProductMatch(item.id, product.id, product.name)}
                                  className="text-xs"
                                >
                                  <Check
                                    className={cn(
                                      "mr-1 h-3 w-3",
                                      (item.product_id === product.id || localSelections[item.id]?.productId === product.id) ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="truncate font-medium">{product.name}</div>
                                    <div className="text-[10px] text-muted-foreground">
                                      SKU: {product.sku}
                                      {product.brand && ` | ${product.brand}`}
                                      {product.current_stock != null && ` | Stock: ${product.current_stock}`}
                                    </div>
                                  </div>
                                </CommandItem>
                              ));
                            })()}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="text-destructive hover:text-destructive/80 p-1 rounded hover:bg-destructive/10 transition-colors"
                    title="Eliminar línea"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
