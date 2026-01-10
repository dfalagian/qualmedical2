import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Package,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import { ScanMode } from "./NFCScannerCard";

export interface NFCMovementResult {
  mode: ScanMode;
  productName: string;
  productSku: string;
  previousStock: number;
  newStock: number;
  epc: string;
  timestamp: Date;
}

interface NFCConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  result: NFCMovementResult | null;
}

export function NFCConfirmationModal({ open, onClose, result }: NFCConfirmationModalProps) {
  if (!result) return null;

  const isEntry = result.mode === "entrada";
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CheckCircle className="h-6 w-6 text-green-500" />
            Operación Completada
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Tipo de movimiento - Grande y llamativo */}
          <div className={`p-4 rounded-lg text-white text-center ${
            isEntry ? "bg-green-600" : "bg-orange-600"
          }`}>
            <div className="flex items-center justify-center gap-3">
              {isEntry ? (
                <ArrowDownToLine className="h-8 w-8" />
              ) : (
                <ArrowUpFromLine className="h-8 w-8" />
              )}
              <span className="text-3xl font-bold">
                {isEntry ? "ENTRADA" : "SALIDA"}
              </span>
            </div>
          </div>

          {/* Información del producto */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 mt-1 text-primary" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Artículo</p>
                <p className="font-semibold text-lg">{result.productName}</p>
                <Badge variant="outline" className="mt-1 font-mono">
                  {result.productSku}
                </Badge>
              </div>
            </div>
          </div>

          {/* Actualización del stock - Lo más importante */}
          <div className="p-4 bg-primary/5 border-2 border-primary/20 rounded-lg">
            <p className="text-sm text-muted-foreground text-center mb-3">Actualización de Stock</p>
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Anterior</p>
                <p className="text-2xl font-bold text-muted-foreground">
                  {result.previousStock}
                </p>
              </div>
              
              <div className={`p-2 rounded-full ${
                isEntry ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
              }`}>
                {isEntry ? (
                  <TrendingUp className="h-6 w-6" />
                ) : (
                  <TrendingDown className="h-6 w-6" />
                )}
              </div>
              
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Nuevo</p>
                <p className={`text-3xl font-bold ${
                  isEntry ? "text-green-600" : "text-orange-600"
                }`}>
                  {result.newStock}
                </p>
              </div>
            </div>
            
            <p className={`text-center mt-3 text-sm font-medium ${
              isEntry ? "text-green-600" : "text-orange-600"
            }`}>
              {isEntry ? "+1 unidad" : "-1 unidad"}
            </p>
          </div>

          {/* EPC del tag */}
          <div className="text-center text-sm text-muted-foreground">
            <span>Tag NFC: </span>
            <code className="bg-muted px-2 py-1 rounded font-mono text-xs">
              {result.epc}
            </code>
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={onClose} 
            className="w-full h-12 text-lg"
            size="lg"
          >
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
