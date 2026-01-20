import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { 
  Radio, 
  CheckCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  Scan,
  X
} from "lucide-react";

export type ScanMode = "entrada" | "salida" | "consulta" | null;

interface RFIDScannerCardProps {
  onTagRead: (epc: string, records: Array<{ recordType: string; data: string }>, mode: ScanMode) => void;
}

export function RFIDScannerCard({ onTagRead }: RFIDScannerCardProps) {
  const [scanMode, setScanMode] = useState<ScanMode>(null);
  const [epcInput, setEpcInput] = useState<string>("");
  const [lastProcessedEpc, setLastProcessedEpc] = useState<string | null>(null);
  const [lastProcessedMode, setLastProcessedMode] = useState<ScanMode>(null);
  const [lastReadTime, setLastReadTime] = useState<Date | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const lastProcessedKey = useRef<string | null>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Focus input when mode is selected
  useEffect(() => {
    if (scanMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [scanMode]);

  // Auto-focus input periodically when in scan mode (in case user clicks elsewhere)
  useEffect(() => {
    if (!scanMode) return;
    
    const focusInterval = setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, 500);
    
    return () => clearInterval(focusInterval);
  }, [scanMode]);

  const handleStartScan = (mode: ScanMode) => {
    setScanMode(mode);
    setEpcInput("");
    lastProcessedKey.current = null;
    console.log(`🔄 Modo RFID activado: ${mode}`);
  };

  const handleStopScan = () => {
    setScanMode(null);
    setEpcInput("");
    lastProcessedKey.current = null;
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    console.log('🛑 Escaneo RFID detenido');
  };

  const processEpc = useCallback((epc: string) => {
    if (!epc || !scanMode) return;

    const cleanEpc = epc.trim().toUpperCase();
    if (!cleanEpc) return;

    const now = Date.now();
    const lastKey = lastProcessedKey.current;
    const [lastEpc, lastTimestampStr] = lastKey?.split('|') || ['', '0'];
    const lastTimestamp = parseInt(lastTimestampStr || '0');
    const timeDiff = now - lastTimestamp;

    // Debounce: ignore same EPC within 3 seconds
    const debounceTime = 3000;
    const isSameEpc = cleanEpc === lastEpc;

    if (isSameEpc && timeDiff < debounceTime) {
      console.log(`⏳ EPC ignorado (mismo EPC, esperar ${((debounceTime - timeDiff) / 1000).toFixed(1)}s más): ${cleanEpc}`);
      setEpcInput("");
      return;
    }

    // Process the EPC
    const currentMode = scanMode;
    lastProcessedKey.current = `${cleanEpc}|${now}`;
    setLastProcessedEpc(cleanEpc);
    setLastProcessedMode(currentMode);
    setLastReadTime(new Date());

    console.log(`📦 EPC RFID procesado: ${cleanEpc} (modo: ${currentMode})`);

    // Call the callback with empty records array (RFID doesn't have NFC records)
    onTagRead(cleanEpc, [], currentMode);

    // Stop scanning after successful read (safe mode)
    console.log('🛑 Escaneo detenido automáticamente después de lectura exitosa');
    setScanMode(null);
    setEpcInput("");
    lastProcessedKey.current = null;
  }, [scanMode, onTagRead]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEpcInput(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      processEpc(epcInput);
    }
  };

  // Also process on blur in case Enter doesn't fire properly
  const handleBlur = () => {
    if (epcInput.length >= 10 && scanMode) {
      // If there's a substantial EPC in the input, process it
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      debounceTimeout.current = setTimeout(() => {
        if (epcInput.length >= 10) {
          processEpc(epcInput);
        }
      }, 100);
    }
  };

  const getModeLabel = (mode: ScanMode) => {
    if (mode === "entrada") return "ENTRADA";
    if (mode === "salida") return "SALIDA";
    if (mode === "consulta") return "CONSULTA";
    return "";
  };

  const getModeColor = (mode: ScanMode) => {
    if (mode === "entrada") return "bg-green-500";
    if (mode === "salida") return "bg-orange-500";
    if (mode === "consulta") return "bg-blue-500";
    return "";
  };

  return (
    <Card className="border-2 border-dashed border-primary/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Radio className="h-5 w-5" />
          Lector RFID USB - Entrada/Salida
          <Badge variant="secondary" className="ml-2">
            <CheckCircle className="h-3 w-3 mr-1" />
            USB/HID
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Flujo de operación */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Package className="h-4 w-4" />
            Seleccione la operación:
          </h4>
          
          {!scanMode ? (
            <div className="grid grid-cols-2 gap-4">
              <Button 
                onClick={() => handleStartScan("entrada")}
                className="h-20 flex flex-col gap-2 bg-green-600 hover:bg-green-700"
                size="lg"
              >
                <ArrowDownToLine className="h-8 w-8" />
                <span className="text-lg font-bold">ENTRADA</span>
              </Button>
              
              <Button 
                onClick={() => handleStartScan("salida")}
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
              <div className={`p-4 rounded-lg text-white text-center ${getModeColor(scanMode)}`}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  {scanMode === "entrada" ? (
                    <ArrowDownToLine className="h-6 w-6" />
                  ) : (
                    <ArrowUpFromLine className="h-6 w-6" />
                  )}
                  <span className="text-2xl font-bold">{getModeLabel(scanMode)}</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="relative">
                    <Scan className="h-5 w-5 animate-pulse" />
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-white rounded-full animate-ping" />
                  </div>
                  <span>Escanee el tag RFID...</span>
                </div>
              </div>

              {/* Input oculto para capturar el EPC del lector USB */}
              <div className="relative">
                <Input
                  ref={inputRef}
                  value={epcInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  placeholder="Esperando lectura RFID..."
                  className="font-mono text-center text-lg h-12 bg-background/80"
                  autoFocus
                  autoComplete="off"
                />
                {epcInput && (
                  <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2">
                    {epcInput.length} chars
                  </Badge>
                )}
              </div>
              
              <Button 
                onClick={handleStopScan} 
                variant="destructive"
                className="w-full gap-2"
                size="lg"
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
            </div>
          )}
        </div>

        {/* Último tag leído */}
        {lastProcessedEpc && lastReadTime && lastProcessedMode && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Última operación completada
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge className={getModeColor(lastProcessedMode)}>
                  {getModeLabel(lastProcessedMode)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  (Escaneo finalizado - seleccione nueva operación)
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">EPC: </span>
                <code className="bg-background px-2 py-1 rounded font-mono text-sm">
                  {lastProcessedEpc}
                </code>
              </div>
              <div className="text-xs text-muted-foreground">
                Procesado: {lastReadTime.toLocaleTimeString()}
              </div>
            </div>
          </div>
        )}

        {/* Instrucciones */}
        <div className="text-sm text-muted-foreground space-y-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
          <p className="font-medium text-foreground">📦 Flujo de operación (lector USB):</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Seleccione <strong>ENTRADA</strong> o <strong>SALIDA</strong></li>
            <li>El campo de texto se enfocará automáticamente</li>
            <li>Pase el tag RFID por el lector USB</li>
            <li>El lector "escribirá" el EPC y presionará Enter</li>
            <li>El sistema procesará la operación automáticamente</li>
          </ol>
          <p className="text-xs mt-2 text-amber-600 dark:text-amber-400">
            ⚠️ Cada lectura requiere seleccionar nuevamente el tipo de operación para evitar errores.
          </p>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          💡 <strong>Lector USB:</strong> Configurado en modo HID (teclado). El EPC se escribe en el campo de texto.
        </p>
      </CardContent>
    </Card>
  );
}
