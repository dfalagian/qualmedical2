import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';

interface PWAUpdatePromptProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

export const PWAUpdatePrompt = ({ onUpdate, onDismiss }: PWAUpdatePromptProps) => {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-md animate-in slide-in-from-bottom-5">
      <Card className="p-4 shadow-lg border-2 border-primary/20 bg-background">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <RefreshCw className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg mb-1">Nueva versión disponible</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Hay una actualización lista. Actualiza ahora para obtener las últimas mejoras.
            </p>
            <div className="flex gap-2">
              <Button onClick={onUpdate} size="sm" className="flex-1">
                Actualizar ahora
              </Button>
              <Button onClick={onDismiss} size="sm" variant="outline">
                Más tarde
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
