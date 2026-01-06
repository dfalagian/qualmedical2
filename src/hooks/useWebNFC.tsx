import { useState, useCallback, useEffect, useRef } from 'react';

interface NFCReadResult {
  serialNumber: string;
  records: NFCRecord[];
}

interface NFCRecord {
  recordType: string;
  mediaType?: string;
  data: string;
}

interface UseWebNFCReturn {
  isSupported: boolean;
  isScanning: boolean;
  lastRead: NFCReadResult | null;
  error: string | null;
  startScan: () => Promise<void>;
  stopScan: () => void;
  writeTag: (data: string) => Promise<boolean>;
}

// Tipos para Web NFC API
declare global {
  interface Window {
    NDEFReader: typeof NDEFReader;
  }
  
  class NDEFReader {
    constructor();
    scan(): Promise<void>;
    write(message: string | NDEFMessageInit): Promise<void>;
    addEventListener(type: 'reading', listener: (event: NDEFReadingEvent) => void): void;
    addEventListener(type: 'readingerror', listener: () => void): void;
    removeEventListener(type: string, listener: (...args: any[]) => void): void;
  }

  interface NDEFReadingEvent extends Event {
    serialNumber: string;
    message: NDEFMessage;
  }

  interface NDEFMessage {
    records: NDEFRecord[];
  }

  interface NDEFRecord {
    recordType: string;
    mediaType?: string;
    data: ArrayBuffer;
    toText?: () => string;
  }

  interface NDEFMessageInit {
    records: NDEFRecordInit[];
  }

  interface NDEFRecordInit {
    recordType: string;
    data?: string | ArrayBuffer;
    mediaType?: string;
  }
}

export function useWebNFC(): UseWebNFCReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastRead, setLastRead] = useState<NFCReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readerRef = useRef<NDEFReader | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Verificar soporte de WebNFC
  useEffect(() => {
    const checkSupport = () => {
      if ('NDEFReader' in window) {
        setIsSupported(true);
      } else {
        setIsSupported(false);
        setError('WebNFC no está soportado en este navegador. Use Chrome en Android.');
      }
    };

    checkSupport();
  }, []);

  // Decodificar ArrayBuffer a string
  const decodeData = (record: NDEFRecord): string => {
    if (record.toText) {
      return record.toText();
    }
    
    try {
      const decoder = new TextDecoder();
      return decoder.decode(record.data);
    } catch {
      // Si no es texto, devolver representación hexadecimal
      const bytes = new Uint8Array(record.data);
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(':');
    }
  };

  const startScan = useCallback(async () => {
    if (!isSupported) {
      setError('WebNFC no está soportado en este dispositivo');
      return;
    }

    try {
      setError(null);
      setIsScanning(true);

      const reader = new window.NDEFReader();
      readerRef.current = reader;
      abortControllerRef.current = new AbortController();

      await reader.scan();

      reader.addEventListener('reading', (event: NDEFReadingEvent) => {
        const records: NFCRecord[] = event.message.records.map((record) => ({
          recordType: record.recordType,
          mediaType: record.mediaType,
          data: decodeData(record)
        }));

        const result: NFCReadResult = {
          serialNumber: event.serialNumber,
          records
        };

        setLastRead(result);
        console.log('NFC Tag leído:', result);
      });

      reader.addEventListener('readingerror', () => {
        setError('Error al leer el tag NFC. Intente con otro tag.');
      });

    } catch (err: any) {
      setIsScanning(false);
      
      if (err.name === 'NotAllowedError') {
        setError('Permiso denegado. Permita el acceso a NFC en la configuración del navegador.');
      } else if (err.name === 'NotSupportedError') {
        setError('Este dispositivo no soporta NFC o NFC está deshabilitado.');
      } else {
        setError(`Error al iniciar escaneo NFC: ${err.message}`);
      }
    }
  }, [isSupported]);

  const stopScan = useCallback(() => {
    setIsScanning(false);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    readerRef.current = null;
  }, []);

  const writeTag = useCallback(async (data: string): Promise<boolean> => {
    if (!isSupported) {
      setError('WebNFC no está soportado en este dispositivo');
      return false;
    }

    try {
      setError(null);
      const reader = new window.NDEFReader();
      await reader.write(data);
      return true;
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Permiso denegado para escribir en el tag NFC.');
      } else {
        setError(`Error al escribir en el tag NFC: ${err.message}`);
      }
      return false;
    }
  }, [isSupported]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  return {
    isSupported,
    isScanning,
    lastRead,
    error,
    startScan,
    stopScan,
    writeTag
  };
}
