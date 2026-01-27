import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ScanSearch, 
  Package, 
  Tag, 
  Calendar,
  Boxes,
  X,
  CheckCircle,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface RFIDConsultaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TagInfo {
  epc: string;
  status: string;
  productName: string | null;
  productSku: string | null;
  batchNumber: string | null;
  expirationDate: string | null;
  currentStock: number | null;
  lastLocation: string | null;
}

export function RFIDConsultaDialog({ open, onOpenChange }: RFIDConsultaDialogProps) {
  const [epcInput, setEpcInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [tagInfo, setTagInfo] = useState<TagInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setEpcInput("");
      setTagInfo(null);
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // Keep input focused while dialog is open
  useEffect(() => {
    if (!open) return;
    
    const focusInterval = setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current && !tagInfo) {
        inputRef.current.focus();
      }
    }, 500);
    
    return () => clearInterval(focusInterval);
  }, [open, tagInfo]);

  const lookupTag = useCallback(async (epc: string) => {
    const cleanEpc = epc.trim().toUpperCase();
    if (!cleanEpc) return;

    setIsSearching(true);
    setError(null);
    setTagInfo(null);

    try {
      const { data: tag, error: tagError } = await supabase
        .from("rfid_tags")
        .select(`
          *,
          products:product_id (name, sku, current_stock),
          product_batches:batch_id (
            batch_number,
            expiration_date,
            current_quantity,
            products:product_id (name, sku, current_stock)
          )
        `)
        .eq("epc", cleanEpc)
        .maybeSingle();

      if (tagError) throw tagError;

      if (!tag) {
        setError(`Tag ${cleanEpc} no está registrado en el sistema.`);
        return;
      }

      // Extract info from tag
      const info: TagInfo = {
        epc: tag.epc,
        status: tag.status || "desconocido",
        productName: null,
        productSku: null,
        batchNumber: null,
        expirationDate: null,
        currentStock: null,
        lastLocation: tag.last_location
      };

      // Check batch first (more specific)
      if (tag.product_batches) {
        const batch = tag.product_batches as any;
        info.batchNumber = batch.batch_number;
        info.expirationDate = batch.expiration_date;
        info.currentStock = batch.current_quantity;
        if (batch.products) {
          info.productName = batch.products.name;
          info.productSku = batch.products.sku;
        }
      } else if (tag.products) {
        // Fallback to product
        const product = tag.products as any;
        info.productName = product.name;
        info.productSku = product.sku;
        info.currentStock = product.current_stock;
      }

      setTagInfo(info);
    } catch (err) {
      console.error("Error looking up tag:", err);
      setError("Error al buscar el tag. Intente nuevamente.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupTag(epcInput);
    }
  };

  const handleNewScan = () => {
    setTagInfo(null);
    setError(null);
    setEpcInput("");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "activo":
        return <Badge className="bg-green-500">Activo</Badge>;
      case "disponible":
        return <Badge className="bg-blue-500">Disponible</Badge>;
      case "inactivo":
        return <Badge variant="secondary">Inactivo</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5" />
            Consultar Artículo por RFID
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scan input area */}
          {!tagInfo && !error && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="relative">
                    <ScanSearch className="h-6 w-6 text-blue-600 animate-pulse" />
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-blue-500 rounded-full animate-ping" />
                  </div>
                  <span className="text-lg font-medium text-blue-700 dark:text-blue-300">
                    Esperando lectura RFID...
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Pase el tag por el lector USB
                </p>
              </div>

              <div className="relative">
                <Input
                  ref={inputRef}
                  value={epcInput}
                  onChange={(e) => setEpcInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="El EPC aparecerá aquí..."
                  className="font-mono text-center text-lg h-12"
                  autoComplete="off"
                  disabled={isSearching}
                />
                {epcInput && (
                  <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2">
                    {epcInput.length} chars
                  </Badge>
                )}
              </div>

              {isSearching && (
                <div className="text-center text-muted-foreground">
                  Buscando información del tag...
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="space-y-4">
              <div className="p-4 bg-destructive/10 rounded-lg flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Tag no encontrado</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
              <Button onClick={handleNewScan} className="w-full">
                <ScanSearch className="h-4 w-4 mr-2" />
                Escanear otro tag
              </Button>
            </div>
          )}

          {/* Tag info display */}
          {tagInfo && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4 space-y-3">
                  {/* EPC */}
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">EPC:</span>
                    <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                      {tagInfo.epc}
                    </code>
                    {getStatusBadge(tagInfo.status)}
                  </div>

                  {/* Product */}
                  {tagInfo.productName ? (
                    <>
                      <div className="flex items-start gap-2">
                        <Package className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="font-medium">{tagInfo.productName}</p>
                          {tagInfo.productSku && (
                            <p className="text-sm text-muted-foreground">
                              SKU: {tagInfo.productSku}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Batch */}
                      {tagInfo.batchNumber && (
                        <div className="flex items-center gap-2">
                          <Boxes className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            Lote: <span className="font-medium">{tagInfo.batchNumber}</span>
                          </span>
                        </div>
                      )}

                      {/* Expiration */}
                      {tagInfo.expirationDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            Vence: <span className="font-medium">
                              {new Date(tagInfo.expirationDate).toLocaleDateString()}
                            </span>
                          </span>
                        </div>
                      )}

                      {/* Stock */}
                      {tagInfo.currentStock !== null && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm">
                            Stock actual: <span className="font-bold text-lg">{tagInfo.currentStock}</span>
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded text-amber-700 dark:text-amber-300 text-sm">
                      <AlertTriangle className="h-4 w-4 inline mr-2" />
                      Este tag no tiene producto asignado
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button onClick={handleNewScan} className="w-full">
                <ScanSearch className="h-4 w-4 mr-2" />
                Escanear otro tag
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
