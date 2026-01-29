import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  Boxes
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
  mode = "product-list"
}: QuickTagAssignmentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [epcInput, setEpcInput] = useState("");
  const [scannedEpc, setScannedEpc] = useState<string | null>(null);
  const [existingTag, setExistingTag] = useState<ExistingTag | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState(batchId || "");
  const [checkingTag, setCheckingTag] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

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
      setScannedEpc(null);
      setExistingTag(null);
      setIsScanning(true);
      setSelectedBatchId(batchId || "");
      // Focus input after a small delay
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open, batchId]);

  // Auto-focus input periodically when scanning
  useEffect(() => {
    if (!open || !isScanning) return;
    
    const focusInterval = setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, 500);
    
    return () => clearInterval(focusInterval);
  }, [open, isScanning]);

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
      
      setScannedEpc(epc);
      setExistingTag(data);
      setIsScanning(false);
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
  }, [toast]);

  // Process EPC input
  const processEpc = useCallback((epc: string) => {
    if (!epc) return;
    const cleanEpc = epc.trim().toUpperCase();
    if (cleanEpc.length < 10) return;
    
    setEpcInput("");
    checkTagInDatabase(cleanEpc);
  }, [checkTagInDatabase]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      processEpc(epcInput);
    }
  };

  // Mutation to assign tag
  const assignTagMutation = useMutation({
    mutationFn: async () => {
      if (!scannedEpc || !productId) {
        throw new Error("Faltan datos para asignar el tag");
      }

      const targetBatchId = selectedBatchId || batchId || null;

      if (existingTag) {
        // Tag exists - update it
        if (existingTag.product_id && existingTag.product_id !== productId) {
          throw new Error("Este tag ya está asignado a otro producto");
        }

        const { error } = await supabase
          .from("rfid_tags")
          .update({
            product_id: productId,
            batch_id: targetBatchId,
            status: "asignado",
            notes: `Asignado a ${productName}${batchNumber ? ` - Lote ${batchNumber}` : ""} el ${new Date().toLocaleString()}`,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingTag.id);

        if (error) throw error;
      } else {
        // Tag doesn't exist - create it
        const { error } = await supabase
          .from("rfid_tags")
          .insert({
            epc: scannedEpc,
            product_id: productId,
            batch_id: targetBatchId,
            status: "asignado",
            notes: `Asignado a ${productName}${batchNumber ? ` - Lote ${batchNumber}` : ""} el ${new Date().toLocaleString()}`
          });

        if (error) throw error;
      }

      return { epc: scannedEpc, isNew: !existingTag };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["available_tags"] });
      
      toast({
        title: "Tag asignado correctamente",
        description: `EPC ${data.epc} fue ${data.isNew ? "registrado y " : ""}asignado a ${productName}`
      });
      
      // Reset for next scan
      setScannedEpc(null);
      setExistingTag(null);
      setIsScanning(true);
      setEpcInput("");
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    onError: (error: Error) => {
      toast({
        title: "Error al asignar tag",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleClose = () => {
    setEpcInput("");
    setScannedEpc(null);
    setExistingTag(null);
    setIsScanning(true);
    onOpenChange(false);
  };

  const handleRetry = () => {
    setScannedEpc(null);
    setExistingTag(null);
    setIsScanning(true);
    setEpcInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Determine if tag can be assigned
  const canAssign = scannedEpc && productId && (
    !existingTag || // New tag
    !existingTag.product_id || // Tag exists but not assigned
    existingTag.product_id === productId // Tag already assigned to this product (update batch)
  );

  const isAlreadyAssignedToOther = existingTag && existingTag.product_id && existingTag.product_id !== productId;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Asignar Tag RFID
          </DialogTitle>
          <DialogDescription>
            Escanee un tag para asignarlo a este producto
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product info */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium">{productName}</p>
                  {(batchNumber || selectedBatchId) && (
                    <p className="text-sm text-muted-foreground">
                      Lote: {batchNumber || productBatches.find(b => b.id === selectedBatchId)?.batch_number}
                    </p>
                  )}
                </div>
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
          {isScanning ? (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                <div className="flex items-center justify-center gap-2 text-primary mb-2">
                  <Scan className="h-5 w-5 animate-pulse" />
                  <span className="font-medium">Esperando lectura RFID...</span>
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
          ) : (
            <div className="space-y-3">
              {/* Tag result */}
              <Card className={isAlreadyAssignedToOther ? "border-destructive" : "border-green-500"}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    {isAlreadyAssignedToOther ? (
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                    <span className="font-medium">Tag detectado</span>
                    {existingTag ? (
                      <Badge variant="secondary">Registrado</Badge>
                    ) : (
                      <Badge variant="outline">Nuevo</Badge>
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">EPC</Label>
                    <code className="block bg-muted px-3 py-2 rounded font-mono text-sm">
                      {scannedEpc}
                    </code>
                  </div>

                  {isAlreadyAssignedToOther && (
                    <div className="p-3 bg-destructive/10 rounded-lg">
                      <p className="text-sm text-destructive font-medium">
                        ⚠️ Este tag ya está asignado a:
                      </p>
                      <p className="text-sm mt-1">
                        {existingTag?.products?.name}
                        {existingTag?.product_batches && (
                          <span className="text-muted-foreground">
                            {" "}(Lote: {existingTag.product_batches.batch_number})
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {!existingTag && (
                    <p className="text-sm text-muted-foreground">
                      Este tag no está registrado. Se creará y asignará automáticamente.
                    </p>
                  )}

                  {existingTag && !existingTag.product_id && (
                    <p className="text-sm text-muted-foreground">
                      Este tag está disponible para asignación.
                    </p>
                  )}

                  {existingTag && existingTag.product_id === productId && (
                    <p className="text-sm text-green-600">
                      Este tag ya está asignado a este producto. Puede actualizar el lote si es necesario.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            <X className="h-4 w-4 mr-2" />
            Cerrar
          </Button>
          
          {!isScanning && (
            <>
              <Button variant="secondary" onClick={handleRetry}>
                <Radio className="h-4 w-4 mr-2" />
                Escanear otro
              </Button>
              
              {canAssign && (
                <Button 
                  onClick={() => assignTagMutation.mutate()}
                  disabled={assignTagMutation.isPending}
                  className="gap-2"
                >
                  {assignTagMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Asignando...
                    </>
                  ) : (
                    <>
                      <Tag className="h-4 w-4" />
                      Asignar Tag
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
