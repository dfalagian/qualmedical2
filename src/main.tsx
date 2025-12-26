import { createRoot } from "react-dom/client";
import { createElement } from "react";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from 'virtual:pwa-register';
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt.tsx";

// Registrar el service worker de la PWA (solo en producción)
if (import.meta.env.PROD) {
  const SW_MIGRATION_KEY = "qm_sw_migrated_20251226";

  const migrateOldServiceWorker = async (): Promise<boolean> => {
    if (!("serviceWorker" in navigator)) return false;

    // Si el usuario ya migró, no hacemos nada
    if (localStorage.getItem(SW_MIGRATION_KEY) === "1") return false;

    try {
      const regs = await navigator.serviceWorker.getRegistrations();

      // Si hay registros previos (posible SW con autoUpdate), los desregistramos
      if (regs.length > 0) {
        await Promise.all(regs.map((r) => r.unregister()));
        localStorage.setItem(SW_MIGRATION_KEY, "1");

        // Un solo reload para que la página deje de estar controlada por el SW anterior
        window.location.reload();
        return true;
      }

      // Si no había SW, marcamos como migrado igualmente
      localStorage.setItem(SW_MIGRATION_KEY, "1");
      return false;
    } catch {
      // Si algo falla, no bloqueamos la app
      return false;
    }
  };

  (async () => {
    const didReload = await migrateOldServiceWorker();
    if (didReload) return;

    const updateSW = registerSW({
      onNeedRefresh() {
        // Crear un contenedor temporal para el componente de actualización
        const container = document.createElement("div");
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
        console.log("La aplicación está lista para funcionar sin conexión");
      },
    });
  })();
}

createRoot(document.getElementById("root")!).render(<App />);
