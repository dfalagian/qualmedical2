import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';

interface PWAUpdatePromptProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

export const PWAUpdatePrompt = ({ onUpdate, onDismiss }: PWAUpdatePromptProps) => {
  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 p-3 md:bottom-4 md:left-auto md:right-4 md:max-w-md animate-in slide-in-from-bottom-5"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <Card className="p-3 md:p-4 shadow-lg border-2 border-primary/20 bg-background">
        <div className="flex items-start gap-2 md:gap-3">
          <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <RefreshCw className="h-5 w-5 md:h-6 md:w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base md:text-lg mb-0.5 md:mb-1">Nueva versión disponible</h3>
            <p className="text-xs md:text-sm text-muted-foreground mb-2 md:mb-3">
              Actualiza para obtener las últimas mejoras.
            </p>
            <div className="flex gap-2">
              <Button onClick={onUpdate} size="sm" className="flex-1 h-8 text-xs md:text-sm">
                Actualizar
              </Button>
              <Button onClick={onDismiss} size="sm" variant="outline" className="h-8 text-xs md:text-sm">
                Después
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
