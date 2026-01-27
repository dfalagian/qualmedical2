import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Package,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Search,
  Info
} from "lucide-react";
import { ScanMode } from "./RFIDScannerCard";

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
  const isConsulta = result.mode === "consulta";
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {isConsulta ? (
              <>
                <Info className="h-6 w-6 text-blue-500" />
                Consulta de Artículo
              </>
            ) : (
              <>
                <CheckCircle className="h-6 w-6 text-green-500" />
                Operación Completada
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Tipo de movimiento - Grande y llamativo */}
          <div className={`p-4 rounded-lg text-white text-center ${
            isConsulta ? "bg-blue-600" : isEntry ? "bg-green-600" : "bg-orange-600"
          }`}>
            <div className="flex items-center justify-center gap-3">
              {isConsulta ? (
                <Search className="h-8 w-8" />
              ) : isEntry ? (
                <ArrowDownToLine className="h-8 w-8" />
              ) : (
                <ArrowUpFromLine className="h-8 w-8" />
              )}
              <span className="text-3xl font-bold">
                {isConsulta ? "CONSULTA" : isEntry ? "ENTRADA" : "SALIDA"}
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

          {/* Stock - Para consulta solo muestra el stock actual */}
          {isConsulta ? (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-muted-foreground text-center mb-3">Stock Actual</p>
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <p className={`text-5xl font-bold ${
                    result.newStock <= 0 ? "text-red-600" : "text-blue-600"
                  }`}>
                    {Math.max(0, result.newStock)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">unidades disponibles</p>
                </div>
              </div>
              
              {/* Alerta de stock agotado en consulta */}
              {result.newStock <= 0 && (
                <div className="mt-4 p-3 bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-lg text-center">
                  <p className="text-red-600 dark:text-red-400 font-bold flex items-center justify-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    ⚠️ STOCK AGOTADO
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Actualización del stock - Para entrada/salida */
            <div className="p-4 bg-primary/5 border-2 border-primary/20 rounded-lg">
              <p className="text-sm text-muted-foreground text-center mb-3">Actualización de Stock</p>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Anterior</p>
                  <p className="text-2xl font-bold text-muted-foreground">
                    {Math.max(0, result.previousStock)}
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
                    {Math.max(0, result.newStock)}
                  </p>
                </div>
              </div>
              
              <p className={`text-center mt-3 text-sm font-medium ${
                isEntry ? "text-green-600" : "text-orange-600"
              }`}>
                {isEntry ? "+1 unidad" : "-1 unidad"}
              </p>

              {/* Alerta de stock agotado */}
              {result.newStock <= 0 && !isEntry && (
                <div className="mt-4 p-3 bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-lg text-center">
                  <p className="text-red-600 dark:text-red-400 font-bold flex items-center justify-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    ⚠️ STOCK AGOTADO
                  </p>
                  <p className="text-red-500 dark:text-red-400 text-sm mt-1">
                    Este producto ya no tiene unidades disponibles
                  </p>
                </div>
              )}
            </div>
          )}

          {/* EPC del tag */}
          <div className="text-center text-sm text-muted-foreground">
            <span>Tag RFID: </span>
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
