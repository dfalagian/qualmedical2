import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Tag, 
  Radio,
  CheckCircle,
  AlertTriangle,
  Scan,
  X,
  Link2,
  Loader2,
  Package,
  Trash2
} from "lucide-react";

interface QuickTagAssignmentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Modo 1: Desde ProductEntry - producto y lote ya seleccionados
  productId?: string;
  productName?: string;
  batchId?: string;
  batchNumber?: string;
  // Modo 2: Desde listado de productos - solo producto seleccionado
  mode?: "product-entry" | "product-list";
  // Cantidad de tags a asignar (para multi-tag assignment)
  quantity?: number;
}

interface ExistingTag {
  id: string;
  epc: string;
  product_id: string | null;
  batch_id: string | null;
  status: string;
  products?: { name: string; sku: string } | null;
  product_batches?: { 
    batch_number: string; 
    products: { name: string } | null 
  } | null;
}

interface ScannedTagInfo {
  epc: string;
  existingTag: ExistingTag | null;
  canAssign: boolean;
  errorMessage?: string;
}

interface ProductBatch {
  id: string;
  batch_number: string;
  expiration_date: string;
  current_quantity: number;
}

export function QuickTagAssignment({
  open,
  onOpenChange,
  productId,
  productName,
  batchId,
  batchNumber,
  mode = "product-list",
  quantity = 1
}: QuickTagAssignmentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [epcInput, setEpcInput] = useState("");
  const [scannedTags, setScannedTags] = useState<ScannedTagInfo[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState(batchId || "");
  const [checkingTag, setCheckingTag] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const processedEpcsRef = useRef<Set<string>>(new Set());

  const targetQuantity = quantity || 1;
  const remainingTags = targetQuantity - scannedTags.length;
  const allTagsScanned = scannedTags.length >= targetQuantity;

  // Fetch batches for product (when in product-list mode)
  const { data: productBatches = [] } = useQuery({
    queryKey: ["product-batches-for-assignment", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, expiration_date, current_quantity")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("expiration_date", { ascending: true });
      
      if (error) throw error;
      return data as ProductBatch[];
    },
    enabled: open && !!productId && mode === "product-list"
  });

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setEpcInput("");
      setScannedTags([]);
      setSelectedBatchId(batchId || "");
      processedEpcsRef.current.clear();
      // Focus input after a small delay
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open, batchId]);

  // Auto-focus input periodically when scanning
  useEffect(() => {
    if (!open || allTagsScanned) return;
    
    const focusInterval = setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, 500);
    
    return () => clearInterval(focusInterval);
  }, [open, allTagsScanned]);

  // Check if tag exists in database
  const checkTagInDatabase = useCallback(async (epc: string) => {
    setCheckingTag(true);
    try {
      const { data, error } = await supabase
        .from("rfid_tags")
        .select(`
          id, epc, product_id, batch_id, status,
          products:product_id (name, sku),
          product_batches:batch_id (
            batch_number,
            products:product_id (name)
          )
        `)
        .eq("epc", epc)
        .maybeSingle();
      
      if (error) throw error;
      
      // Determine if tag can be assigned
      const isAlreadyAssignedToOther = data && data.product_id && data.product_id !== productId;
      
      const tagInfo: ScannedTagInfo = {
        epc,
        existingTag: data,
        canAssign: !isAlreadyAssignedToOther,
        errorMessage: isAlreadyAssignedToOther 
          ? `Ya asignado a: ${data?.products?.name || 'otro producto'}`
          : undefined
      };
      
      setScannedTags(prev => [...prev, tagInfo]);
      
      if (isAlreadyAssignedToOther) {
        toast({
          title: "Tag ya asignado",
          description: `EPC ${epc} ya está asignado a otro producto`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Tag escaneado",
          description: `EPC ${epc} listo para asignar (${scannedTags.length + 1}/${targetQuantity})`
        });
      }
    } catch (error) {
      console.error("Error checking tag:", error);
      toast({
        title: "Error al verificar tag",
        description: "No se pudo verificar si el tag existe",
        variant: "destructive"
      });
    } finally {
      setCheckingTag(false);
    }
  }, [toast, productId, scannedTags.length, targetQuantity]);

  // Process EPC input
  const processEpc = useCallback((epc: string) => {
    if (!epc) return;
    const cleanEpc = epc.trim().toUpperCase();
    if (cleanEpc.length < 10) return;
    
    // Check for duplicates within this session
    if (processedEpcsRef.current.has(cleanEpc)) {
      toast({
        title: "Tag duplicado",
        description: "Este tag ya fue escaneado en esta sesión",
        variant: "destructive"
      });
      setEpcInput("");
      return;
    }
    
    // Mark as processed immediately
    processedEpcsRef.current.add(cleanEpc);
    setEpcInput("");
    checkTagInDatabase(cleanEpc);
  }, [checkTagInDatabase, toast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      processEpc(epcInput);
    }
  };

  const handleRemoveTag = (epc: string) => {
    setScannedTags(prev => prev.filter(t => t.epc !== epc));
    processedEpcsRef.current.delete(epc);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Mutation to assign all tags
  const assignTagsMutation = useMutation({
    mutationFn: async () => {
      if (!productId) {
        throw new Error("Faltan datos para asignar los tags");
      }

      const tagsToAssign = scannedTags.filter(t => t.canAssign);
      if (tagsToAssign.length === 0) {
        throw new Error("No hay tags válidos para asignar");
      }

      const targetBatchId = selectedBatchId || batchId || null;

      for (const tagInfo of tagsToAssign) {
        if (tagInfo.existingTag) {
          // Tag exists - update it
          const { error } = await supabase
            .from("rfid_tags")
            .update({
              product_id: productId,
              batch_id: targetBatchId,
              status: "asignado",
              notes: `Asignado a ${productName}${batchNumber ? ` - Lote ${batchNumber}` : ""} el ${new Date().toLocaleString()}`,
              updated_at: new Date().toISOString()
            })
            .eq("id", tagInfo.existingTag.id);

          if (error) throw error;
        } else {
          // Tag doesn't exist - create it
          const { error } = await supabase
            .from("rfid_tags")
            .insert({
              epc: tagInfo.epc,
              product_id: productId,
              batch_id: targetBatchId,
              status: "asignado",
              notes: `Asignado a ${productName}${batchNumber ? ` - Lote ${batchNumber}` : ""} el ${new Date().toLocaleString()}`
            });

          if (error) throw error;
        }
      }

      return { count: tagsToAssign.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["available_tags"] });
      
      toast({
        title: "Tags asignados correctamente",
        description: `${data.count} tag(s) asignados a ${productName}`
      });
      
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error al asignar tags",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleClose = () => {
    setEpcInput("");
    setScannedTags([]);
    processedEpcsRef.current.clear();
    onOpenChange(false);
  };

  const validTagsCount = scannedTags.filter(t => t.canAssign).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Asignar Tags RFID
          </DialogTitle>
          <DialogDescription>
            {targetQuantity > 1 
              ? `Escanee ${targetQuantity} tags para asignarlos a este producto`
              : "Escanee un tag para asignarlo a este producto"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0">
          {/* Product info */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">{productName}</p>
                  {(batchNumber || selectedBatchId) && (
                    <p className="text-sm text-muted-foreground">
                      Lote: {batchNumber || productBatches.find(b => b.id === selectedBatchId)?.batch_number}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-lg px-3">
                  {scannedTags.length} / {targetQuantity}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Batch selector (only in product-list mode) */}
          {mode === "product-list" && productBatches.length > 0 && !batchId && (
            <div className="space-y-2">
              <Label>Lote (opcional)</Label>
              <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar a lote específico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin lote específico</SelectItem>
                  {productBatches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.batch_number} - Cad: {new Date(batch.expiration_date).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Scanning area */}
          {!allTagsScanned && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                <div className="flex items-center justify-center gap-2 text-primary mb-2">
                  <Scan className="h-5 w-5 animate-pulse" />
                  <span className="font-medium">
                    {remainingTags > 1 
                      ? `Esperando ${remainingTags} tags más...`
                      : "Esperando lectura RFID..."}
                  </span>
                </div>
                <Input
                  ref={inputRef}
                  value={epcInput}
                  onChange={(e) => setEpcInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escanee el tag..."
                  className="font-mono text-center"
                  autoComplete="off"
                  disabled={checkingTag}
                />
                {checkingTag && (
                  <div className="flex items-center justify-center gap-2 mt-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Verificando...</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Pase el tag por el lector RFID USB
              </p>
            </div>
          )}

          {/* Scanned tags list */}
          {scannedTags.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">Tags escaneados</Label>
              <ScrollArea className="max-h-[200px] border rounded-lg">
                <div className="p-2 space-y-2">
                  {scannedTags.map((tagInfo, index) => (
                    <div
                      key={tagInfo.epc}
                      className={`flex items-center gap-2 p-2 rounded-lg ${
                        tagInfo.canAssign 
                          ? "bg-primary/10 border border-primary/30" 
                          : "bg-destructive/10 border border-destructive/30"
                      }`}
                    >
                      {tagInfo.canAssign ? (
                        <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <code className="text-xs font-mono truncate block">{tagInfo.epc}</code>
                        {tagInfo.errorMessage && (
                          <p className="text-xs text-destructive truncate">{tagInfo.errorMessage}</p>
                        )}
                        {!tagInfo.existingTag && tagInfo.canAssign && (
                          <p className="text-xs text-muted-foreground">Nuevo tag</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        #{index + 1}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={() => handleRemoveTag(tagInfo.epc)}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Summary when all tags scanned */}
          {allTagsScanned && (
            <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">
                  {validTagsCount === targetQuantity 
                    ? "Todos los tags listos para asignar"
                    : `${validTagsCount} de ${targetQuantity} tags válidos`}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-shrink-0">
          <Button variant="outline" onClick={handleClose}>
            <X className="h-4 w-4 mr-2" />
            Cerrar
          </Button>
          
          {validTagsCount > 0 && (
            <Button 
              onClick={() => assignTagsMutation.mutate()}
              disabled={assignTagsMutation.isPending}
              className="gap-2"
            >
              {assignTagsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Asignando...
                </>
              ) : (
                <>
                  <Tag className="h-4 w-4" />
                  Asignar {validTagsCount} Tag{validTagsCount > 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}