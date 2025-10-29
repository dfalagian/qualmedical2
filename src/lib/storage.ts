import { supabase } from "@/integrations/supabase/client";

/**
 * Obtiene una URL firmada (signed URL) para acceder a un archivo privado en Storage
 * @param bucket - El nombre del bucket de storage
 * @param path - La ruta del archivo dentro del bucket
 * @param expiresIn - Tiempo de expiración en segundos (default: 3600 = 1 hora)
 * @returns URL firmada o null si hay error
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
): Promise<string | null> {
  try {
    // Extraer el path relativo si viene de un URL completo
    let relativePath = path;
    if (path.includes(`/${bucket}/`)) {
      relativePath = path.split(`/${bucket}/`)[1];
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(relativePath, expiresIn);

    if (error) {
      console.error("Error creating signed URL:", error);
      return null;
    }

    return data?.signedUrl || null;
  } catch (error) {
    console.error("Exception in getSignedUrl:", error);
    return null;
  }
}

/**
 * Obtiene múltiples URLs firmadas de forma eficiente
 * @param bucket - El nombre del bucket de storage
 * @param paths - Array de rutas de archivos
 * @param expiresIn - Tiempo de expiración en segundos (default: 3600 = 1 hora)
 * @returns Array de URLs firmadas (null para archivos con error)
 */
export async function getSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn: number = 3600
): Promise<(string | null)[]> {
  const signedUrls = await Promise.all(
    paths.map((path) => getSignedUrl(bucket, path, expiresIn))
  );
  
  return signedUrls;
}
