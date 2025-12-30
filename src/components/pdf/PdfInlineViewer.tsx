import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, Download } from "lucide-react";

// Ensure PDF.js worker is configured (Vite-compatible)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PdfInlineViewerProps {
  url: string;
  className?: string;
}

export function PdfInlineViewer({ url, className }: PdfInlineViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset page when url changes
  useEffect(() => {
    setPageNumber(1);
  }, [url]);

  // Load PDF
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setPdfDoc(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`No se pudo descargar el PDF (HTTP ${res.status})`);
        const data = await res.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages || 0);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "No se pudo cargar el PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Render page
  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!pdfDoc || !canvasRef.current) return;
      setRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No se pudo inicializar el canvas");

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        // Fit responsively
        canvas.style.width = "100%";
        canvas.style.height = "auto";

        await page.render({ canvasContext: ctx, viewport } as any).promise;
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "No se pudo renderizar el PDF");
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber]);

  const canPrev = pageNumber > 1;
  const canNext = numPages > 0 && pageNumber < numPages;

  return (
    <div className={className ?? "w-full"}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="text-xs text-muted-foreground">
          {numPages ? `Página ${pageNumber} de ${numPages}` : "PDF"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={!canPrev || loading || rendering}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
            disabled={!canNext || loading || rendering}
            className="gap-1"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="outline" size="sm" className="gap-1">
              <Download className="h-4 w-4" />
              Descargar
            </Button>
          </a>
        </div>
      </div>

      <div className="w-full h-[70vh] rounded-lg border bg-background overflow-auto">
        {loading ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Cargando PDF...</span>
          </div>
        ) : error ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-4 text-center">
            <span className="text-sm text-destructive">{error}</span>
            <span className="text-xs text-muted-foreground">Puedes intentar descargarlo con el botón "Descargar".</span>
          </div>
        ) : (
          <div className="p-3">
            {rendering && (
              <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Renderizando página...
              </div>
            )}
            <canvas ref={canvasRef} className="w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
