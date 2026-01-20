import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Tag, 
  Package, 
  Boxes,
  CheckCircle,
  Search,
  Link2,
  Loader2,
  Radio
} from "lucide-react";

interface VirginTagAssignmentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AvailableTag {
  id: string;
  epc: string;
  created_at: string;
}

interface ProductBatch {
  id: string;
  product_id: string;
  batch_number: string;
  barcode: string;
  expiration_date: string;
  current_quantity: number;
  products: { name: string; sku: string } | null;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
}

export function VirginTagAssignment({ open, onOpenChange }: VirginTagAssignmentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [assignmentMode, setAssignmentMode] = useState<"individual" | "batch">("individual");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  // Fetch available (virgin) tags
  const { data: availableTags = [], isLoading: loadingTags } = useQuery({
    queryKey: ["available_tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfid_tags")
        .select("id, epc, created_at")
        .eq("status", "disponible")
        .is("product_id", null)
        .is("batch_id", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AvailableTag[];
    },
    enabled: open
  });

  // Fetch batches for assignment
  const { data: batches = [] } = useQuery({
    queryKey: ["product_batches_for_assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select(`
          id,
          product_id,
          batch_number,
          barcode,
          expiration_date,
          current_quantity,
          products:product_id (name, sku)
        `)
        .eq("is_active", true)
        .order("expiration_date", { ascending: true });

      if (error) throw error;
      return data as ProductBatch[];
    },
    enabled: open
  });

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ["products_for_assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, barcode")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data as Product[];
    },
    enabled: open
  });

  // Filter tags by search
  const filteredTags = useMemo(() => {
    if (!searchTerm) return availableTags;
    return availableTags.filter(tag => 
      tag.epc.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [availableTags, searchTerm]);

  // Assign tags mutation
  const assignTagsMutation = useMutation({
    mutationFn: async ({ 
      tagIds, 
      batchId, 
      productId 
    }: { 
      tagIds: string[]; 
      batchId?: string; 
      productId?: string;
    }) => {
      if (!batchId && !productId) {
        throw new Error("Debe seleccionar un lote o un producto");
      }

      let finalProductId = productId;
      
      // If batch is selected, get product from batch
      if (batchId) {
        const batch = batches.find(b => b.id === batchId);
        if (batch) {
          finalProductId = batch.product_id;
        }
      }

      // Update all selected tags
      const { error } = await supabase
        .from("rfid_tags")
        .update({
          product_id: finalProductId,
          batch_id: batchId || null,
          status: "asignado",
          notes: `Asignado masivamente el ${new Date().toLocaleString()}`,
          updated_at: new Date().toISOString()
        })
        .in("id", tagIds);

      if (error) throw error;

      return { count: tagIds.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["available_tags"] });
      
      toast({
        title: "Tags asignados",
        description: `${data.count} tag(s) fueron asignados correctamente.`
      });
      
      // Reset selection
      setSelectedTags(new Set());
      setSelectedBatchId("");
      setSelectedProductId("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error al asignar",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleToggleTag = (tagId: string) => {
    const newSelected = new Set(selectedTags);
    if (newSelected.has(tagId)) {
      newSelected.delete(tagId);
    } else {
      newSelected.add(tagId);
    }
    setSelectedTags(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTags.size === filteredTags.length) {
      setSelectedTags(new Set());
    } else {
      setSelectedTags(new Set(filteredTags.map(t => t.id)));
    }
  };

  const handleAssign = () => {
    if (selectedTags.size === 0) {
      toast({
        title: "Sin selección",
        description: "Seleccione al menos un tag para asignar.",
        variant: "destructive"
      });
      return;
    }

    assignTagsMutation.mutate({
      tagIds: Array.from(selectedTags),
      batchId: selectedBatchId || undefined,
      productId: selectedProductId || undefined
    });
  };

  const handleClose = () => {
    setSelectedTags(new Set());
    setSearchTerm("");
    setSelectedBatchId("");
    setSelectedProductId("");
    onOpenChange(false);
  };

  const selectedBatch = batches.find(b => b.id === selectedBatchId);
  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Asignar Tags Vírgenes
          </DialogTitle>
          <DialogDescription>
            Seleccione tags disponibles y asígnelos a productos o lotes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Panel - Available Tags */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Radio className="h-4 w-4" />
                Tags Disponibles ({availableTags.length})
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedTags.size === filteredTags.length ? "Deseleccionar todo" : "Seleccionar todo"}
              </Button>
            </div>
            
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar EPC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <ScrollArea className="flex-1 border rounded-lg min-h-[300px]">
              {loadingTags ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredTags.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                  <Tag className="h-8 w-8 mb-2 opacity-50" />
                  <p>No hay tags disponibles</p>
                  <p className="text-sm">Registre tags vírgenes primero</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredTags.map((tag) => (
                    <div
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                        selectedTags.has(tag.id) 
                          ? "bg-primary/10 border border-primary" 
                          : "hover:bg-muted border border-transparent"
                      }`}
                    >
                      <Checkbox 
                        checked={selectedTags.has(tag.id)}
                        onCheckedChange={() => handleToggleTag(tag.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm truncate">{tag.epc}</p>
                        <p className="text-xs text-muted-foreground">
                          Registrado: {new Date(tag.created_at).toLocaleString()}
                        </p>
                      </div>
                      {selectedTags.has(tag.id) && (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {selectedTags.size > 0 && (
              <div className="mt-2 p-2 bg-primary/10 rounded-lg">
                <p className="text-sm font-medium text-center">
                  {selectedTags.size} tag(s) seleccionado(s)
                </p>
              </div>
            )}
          </div>

          {/* Right Panel - Assignment Target */}
          <div className="flex flex-col min-h-0">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Destino de Asignación
            </h3>

            <Tabs value={assignmentMode} onValueChange={(v) => setAssignmentMode(v as "individual" | "batch")} className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="batch" className="gap-2">
                  <Boxes className="h-4 w-4" />
                  A Lote
                </TabsTrigger>
                <TabsTrigger value="individual" className="gap-2">
                  <Package className="h-4 w-4" />
                  A Producto
                </TabsTrigger>
              </TabsList>

              <TabsContent value="batch" className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label>Seleccionar Lote</Label>
                  <Select 
                    value={selectedBatchId} 
                    onValueChange={(value) => {
                      setSelectedBatchId(value);
                      setSelectedProductId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione un lote..." />
                    </SelectTrigger>
                    <SelectContent>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{batch.batch_number}</span>
                            <span className="text-xs text-muted-foreground">
                              {batch.products?.name} | Cad: {new Date(batch.expiration_date).toLocaleDateString()}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedBatch && (
                  <Card className="bg-muted/50">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Lote:</span>
                        <Badge variant="outline">{selectedBatch.batch_number}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Producto:</span>
                        <span className="font-medium">{selectedBatch.products?.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Código:</span>
                        <span className="font-mono text-sm">{selectedBatch.barcode}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Caducidad:</span>
                        <span>{new Date(selectedBatch.expiration_date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Cantidad actual:</span>
                        <Badge>{selectedBatch.current_quantity} unidades</Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="individual" className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label>Seleccionar Producto</Label>
                  <Select 
                    value={selectedProductId} 
                    onValueChange={(value) => {
                      setSelectedProductId(value);
                      setSelectedBatchId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione un producto..." />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{product.name}</span>
                            <span className="text-xs text-muted-foreground">
                              SKU: {product.sku}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedProduct && (
                  <Card className="bg-muted/50">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Producto:</span>
                        <span className="font-medium">{selectedProduct.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">SKU:</span>
                        <Badge variant="outline">{selectedProduct.sku}</Badge>
                      </div>
                      {selectedProduct.barcode && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Código de barras:</span>
                          <span className="font-mono text-sm">{selectedProduct.barcode}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <p className="text-sm text-muted-foreground">
                  ⚠️ Los tags asignados directamente a producto no estarán vinculados a un lote específico.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleAssign}
            disabled={
              selectedTags.size === 0 || 
              (!selectedBatchId && !selectedProductId) ||
              assignTagsMutation.isPending
            }
            className="gap-2"
          >
            {assignTagsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Asignando...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                Asignar {selectedTags.size} Tag(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
