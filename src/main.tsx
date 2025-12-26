import { createRoot } from "react-dom/client";
import { createElement } from "react";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from 'virtual:pwa-register';
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt.tsx";

// Registrar el service worker de la PWA (solo en producción)
if (import.meta.env.PROD) {
  const updateSW = registerSW({
    onNeedRefresh() {
      // Crear un contenedor temporal para el componente de actualización
      const container = document.createElement('div');
      document.body.appendChild(container);

      const root = createRoot(container);

      const handleUpdate = () => {
        updateSW(true);
        root.unmount();
        document.body.removeChild(container);
      };

      const handleDismiss = () => {
        root.unmount();
        document.body.removeChild(container);
      };

      root.render(
        createElement(PWAUpdatePrompt, {
          onUpdate: handleUpdate,
          onDismiss: handleDismiss,
        })
      );
    },
    onOfflineReady() {
      console.log('La aplicación está lista para funcionar sin conexión');
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);
