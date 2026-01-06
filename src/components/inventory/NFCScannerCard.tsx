import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Smartphone, Wifi, WifiOff, AlertTriangle, CheckCircle } from "lucide-react";
import { useWebNFC } from "@/hooks/useWebNFC";

interface NFCScannerCardProps {
  onTagRead: (serialNumber: string, records: Array<{ recordType: string; data: string }>) => void;
}

export function NFCScannerCard({ onTagRead }: NFCScannerCardProps) {
  const { isSupported, isScanning, lastRead, error, startScan, stopScan } = useWebNFC();
  const [lastReadTime, setLastReadTime] = useState<Date | null>(null);
  const lastProcessedSerial = useRef<string | null>(null);

  const handleStartScan = async () => {
    await startScan();
  };

  const handleStopScan = () => {
    stopScan();
  };

  // Efecto para notificar cuando se lee un tag - usando useEffect correctamente
  useEffect(() => {
    if (lastRead && lastRead.serialNumber !== lastProcessedSerial.current) {
      lastProcessedSerial.current = lastRead.serialNumber;
      setLastReadTime(new Date());
      onTagRead(lastRead.serialNumber, lastRead.records);
    }
  }, [lastRead, onTagRead]);

  return (
    <Card className="border-2 border-dashed border-primary/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Lector NFC (WebNFC)
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

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-2">
              {isScanning 
                ? "Acerque un tag NFC al dispositivo para leerlo..."
                : "Presione el botón para iniciar el escaneo NFC."
              }
            </p>
            
            {isScanning && (
              <div className="flex items-center gap-2 text-sm text-primary">
                <div className="relative">
                  <Wifi className="h-5 w-5 animate-pulse" />
                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-ping" />
                </div>
                <span>Escaneando...</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {!isScanning ? (
              <Button 
                onClick={handleStartScan} 
                disabled={!isSupported}
                className="gap-2"
              >
                <Wifi className="h-4 w-4" />
                Iniciar Escaneo
              </Button>
            ) : (
              <Button 
                onClick={handleStopScan} 
                variant="destructive"
                className="gap-2"
              >
                <WifiOff className="h-4 w-4" />
                Detener
              </Button>
            )}
          </div>
        </div>

        {lastRead && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Último tag leído
            </h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Serial: </span>
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
              {lastReadTime && (
                <div className="text-xs text-muted-foreground">
                  Leído: {lastReadTime.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2">
          💡 <strong>Nota:</strong> WebNFC funciona solo en Chrome/Edge para Android con NFC habilitado.
          Para iOS u otros navegadores, considere usar una app nativa.
        </p>
      </CardContent>
    </Card>
  );
}
