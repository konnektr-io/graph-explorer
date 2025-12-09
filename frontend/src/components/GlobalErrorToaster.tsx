import { useEffect } from "react";
import { toast, Toaster } from "sonner";
import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";
import { useModelsStore } from "@/stores/modelsStore";
import { useQueryStore } from "@/stores/queryStore";

/**
 * Centralized error-to-toast component for all major stores.
 * Add more stores as needed.
 */
export function GlobalErrorToaster() {
  // Select errors and clearers from all relevant stores
  const digitalTwinsError = useDigitalTwinsStore((s) => s.error);
  const clearDigitalTwinsError = useDigitalTwinsStore((s) => s.clearError);

  const modelsError = useModelsStore((s) => s.error);
  const clearModelsError = useModelsStore((s) => s.clearError);

  const queryError = useQueryStore((s) => s.queryError);
  const clearQueryError = useQueryStore((s) => s.clearQueryResults);

  // Show toast for DigitalTwins errors
  useEffect(() => {
    if (digitalTwinsError) {
      toast.error(digitalTwinsError);
      clearDigitalTwinsError();
    }
  }, [digitalTwinsError, clearDigitalTwinsError]);

  // Show toast for Models errors
  useEffect(() => {
    if (modelsError) {
      toast.error(modelsError);
      clearModelsError();
    }
  }, [modelsError, clearModelsError]);

  // Show toast for Query errors
  useEffect(() => {
    if (queryError) {
      toast.error(queryError);
      clearQueryError();
    }
  }, [queryError, clearQueryError]);

  // Only need one Toaster in the app
  return <Toaster richColors position="top-center" />;
}
