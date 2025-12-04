import { useAuth0 } from "@auth0/auth0-react";
import { useConnectionStore } from "../stores/connectionStore";

export function ConnectionStatus(): React.ReactElement {
  const { isAuthenticated } = useAuth0();
  const isConnected = useConnectionStore((state) => state.isConnected);
  const currentConnection = useConnectionStore((state) =>
    state.getCurrentConnection()
  );

  // Determine if we should show the username in the connection status
  // Hide if: local connection (no auth), or if it's a KtrlPlane connection for the same user
  const shouldShowUsername = 
    currentConnection &&
    currentConnection.authProvider !== "none" &&
    !(currentConnection.isKtrlPlaneManaged && isAuthenticated);

  return (
    <div className="flex items-center gap-2">
      {/* Connection Status */}
      <div
        className={`h-2 w-2 rounded-full ${
          isConnected ? "bg-green-500" : "bg-gray-400"
        }`}
        title={isConnected ? "Connected" : "Disconnected"}
      />
      <span className="text-sm text-muted-foreground">
        {isConnected ? "Connected" : "Disconnected"}
      </span>
      
      {/* Show username only for connections with separate auth */}
      {shouldShowUsername && currentConnection.authConfig && (
        <span className="text-sm text-muted-foreground">
          (separate auth)
        </span>
      )}
    </div>
  );
}
