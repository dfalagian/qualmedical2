import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Smartphone, 
  Wifi, 
  WifiOff, 
  AlertTriangle, 
  CheckCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Package
} from "lucide-react";
import { useWebNFC } from "@/hooks/useWebNFC";

export type ScanMode = "entrada" | "salida" | null;

interface NFCScannerCardProps {
  onTagRead: (serialNumber: string, records: Array<{ recordType: string; data: string }>, mode: ScanMode) => void;
}

export function NFCScannerCard({ onTagRead }: NFCScannerCardProps) {
  const { isSupported, isScanning, lastRead, error, startScan, stopScan } = useWebNFC();
  const [lastReadTime, setLastReadTime] = useState<Date | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const lastProcessedKey = useRef<string | null>(null);

  const handleStartScan = async (mode: ScanMode) => {
    setScanMode(mode);
    lastProcessedKey.current = null; // Reset para permitir releer el mismo tag en diferente modo
    setProcessedCount(0);
    await startScan();
  };

  const handleStopScan = () => {
    stopScan();
    setScanMode(null);
    lastProcessedKey.current = null;
    setProcessedCount(0);
  };

  // Efecto para notificar cuando se lee un tag
  // Debounce de 3 segundos para el mismo tag, tags diferentes se procesan inmediatamente
  useEffect(() => {
    if (lastRead && scanMode) {
      const now = Date.now();
      const lastKey = lastProcessedKey.current;
      const lastSerial = lastKey?.split('-')[0];
      const lastTimestamp = lastKey ? parseInt(lastKey.split('-')[1] || '0') : 0;
      const timeDiff = now - lastTimestamp;
      
      // MISMO TAG: Solo procesar si han pasado más de 3 segundos (evita lecturas duplicadas)
      // TAG DIFERENTE: Procesar inmediatamente
      const isSameTag = lastRead.serialNumber === lastSerial;
      const debounceTime = 3000; // 3 segundos para el mismo tag
      
      if (!isSameTag || timeDiff > debounceTime) {
        lastProcessedKey.current = `${lastRead.serialNumber}-${now}`;
        setLastReadTime(new Date());
        setProcessedCount(prev => prev + 1);
        onTagRead(lastRead.serialNumber, lastRead.records, scanMode);
        console.log(`📦 Tag procesado: ${lastRead.serialNumber} (total: ${processedCount + 1})${isSameTag ? ' [mismo tag después de ' + (timeDiff/1000).toFixed(1) + 's]' : ' [tag nuevo]'}`);
      } else {
        console.log(`⏳ Tag ignorado (mismo tag, esperar ${((debounceTime - timeDiff)/1000).toFixed(1)}s más): ${lastRead.serialNumber}`);
      }
    }
  }, [lastRead, onTagRead, scanMode, processedCount]);

  const getModeLabel = () => {
    if (scanMode === "entrada") return "ENTRADA";
    if (scanMode === "salida") return "SALIDA";
    return "";
  };

  const getModeColor = () => {
    if (scanMode === "entrada") return "bg-green-500";
    if (scanMode === "salida") return "bg-orange-500";
    return "";
  };

  return (
    <Card className="border-2 border-dashed border-primary/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Lector NFC - Entrada/Salida
          {isSupported ? (
            <Badge variant="secondary" className="ml-2">
              <CheckCircle className="h-3 w-3 mr-1" />
              Soportado
            </Badge>
          ) : (
            <Badge variant="destructive" className="ml-2">
              <AlertTriangle className="h-3 w-3 mr-1" />
              No soportado
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSupported && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              WebNFC solo está disponible en <strong>Chrome para Android</strong>. 
              Para usar esta función, acceda desde un dispositivo Android con Chrome.
            </AlertDescription>
          </Alert>
        )}

        {error && isSupported && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Flujo de operación */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Package className="h-4 w-4" />
            Seleccione la operación:
          </h4>
          
          {!isScanning ? (
            <div className="grid grid-cols-2 gap-4">
              <Button 
                onClick={() => handleStartScan("entrada")}
                disabled={!isSupported}
                className="h-20 flex flex-col gap-2 bg-green-600 hover:bg-green-700"
                size="lg"
              >
                <ArrowDownToLine className="h-8 w-8" />
                <span className="text-lg font-bold">ENTRADA</span>
              </Button>
              
              <Button 
                onClick={() => handleStartScan("salida")}
                disabled={!isSupported}
                className="h-20 flex flex-col gap-2 bg-orange-600 hover:bg-orange-700"
                size="lg"
              >
                <ArrowUpFromLine className="h-8 w-8" />
                <span className="text-lg font-bold">SALIDA</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Indicador de modo activo */}
              <div className={`p-4 rounded-lg text-white text-center ${getModeColor()}`}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  {scanMode === "entrada" ? (
                    <ArrowDownToLine className="h-6 w-6" />
                  ) : (
                    <ArrowUpFromLine className="h-6 w-6" />
                  )}
                  <span className="text-2xl font-bold">{getModeLabel()}</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="relative">
                    <Wifi className="h-5 w-5 animate-pulse" />
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-white rounded-full animate-ping" />
                  </div>
                  <span>Acerque el tag NFC al dispositivo...</span>
                </div>
              </div>
              
              <Button 
                onClick={handleStopScan} 
                variant="destructive"
                className="w-full gap-2"
                size="lg"
              >
                <WifiOff className="h-4 w-4" />
                Detener Escaneo
              </Button>
            </div>
          )}
        </div>

        {/* Último tag leído */}
        {lastRead && lastReadTime && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Última operación
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge className={scanMode === "entrada" ? "bg-green-500" : "bg-orange-500"}>
                  {scanMode === "entrada" ? "ENTRADA" : "SALIDA"}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Serial NFC: </span>
                <code className="bg-background px-2 py-1 rounded font-mono">
                  {lastRead.serialNumber}
                </code>
              </div>
              {lastRead.records.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Registros: </span>
                  <ul className="mt-1 space-y-1">
                    {lastRead.records.map((record, idx) => (
                      <li key={idx} className="text-xs bg-background px-2 py-1 rounded">
                        <Badge variant="outline" className="mr-2">{record.recordType}</Badge>
                        <span className="font-mono">{record.data.substring(0, 50)}</span>
                        {record.data.length > 50 && '...'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Procesado: {lastReadTime.toLocaleTimeString()}
              </div>
            </div>
          </div>
        )}

        {/* Instrucciones */}
        <div className="text-sm text-muted-foreground space-y-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
          <p className="font-medium text-foreground">📦 Flujo de operación:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li><strong>ENTRADA:</strong> Para registrar medicamentos que llegan al almacén</li>
            <li><strong>SALIDA:</strong> Para registrar medicamentos que salen del almacén</li>
            <li>Seleccione el modo y acerque el tag NFC al dispositivo</li>
            <li>El sistema actualizará automáticamente el stock y registrará el movimiento</li>
          </ol>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          💡 <strong>Nota:</strong> WebNFC funciona solo en Chrome/Edge para Android con NFC habilitado.
        </p>
      </CardContent>
    </Card>
  );
}
