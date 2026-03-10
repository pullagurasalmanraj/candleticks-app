import React from "react";

export default function WebSocketStatus({
    isConnected,
    connectWebSocket,
    disconnectWebSocket
}) {
    return (
        <button
            onClick={isConnected ? disconnectWebSocket : connectWebSocket}
            className={[
                "inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all border",
                isConnected
                    ? "border-emerald-500/50 bg-emerald-600 text-white hover:bg-emerald-700"
                    : "border-slate-400 bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700",
            ].join(" ")}
        >
            <span
                className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-300 animate-pulse" : "bg-red-400"
                    }`}
            />

            {isConnected ? "Disconnect WebSocket" : "Connect WebSocket"}
        </button>
    );
}