import { useEffect, useRef, useState } from "react";

export default function useWebSocketPrices(instrumentByKey) {


    const [prices, setPrices] = useState({});
    const [lastPrices, setLastPrices] = useState({});
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true)

    const wsRef = useRef(null);

    useEffect(() => {

        // restore cached prices
        const cached = localStorage.getItem("lastPrices");

        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setPrices(parsed);
                setLastPrices(parsed);
            } catch { }
        }

    }, []);

    useEffect(() => {

        let closed = false;

        const savedSubs = JSON.parse(
            localStorage.getItem("activeSubscriptions") || "{}"
        );

        const connect = () => {

            const ws = new WebSocket("ws://localhost:9000");
            wsRef.current = ws;

            ws.onopen = () => {

                console.log("🟢 WS connected");

                setIsConnected(true);
                setIsLoading(false);   // ✅ IMPORTANT

                const keys = Object.keys(savedSubs);

                if (keys.length > 0) {
                    ws.send(JSON.stringify({
                        subscribe: keys,
                        source: "restore"
                    }));
                }

            };

            ws.onmessage = (evt) => {

                try {

                    const msg = JSON.parse(evt.data);
                    const feeds = msg?.data?.feeds;

                    if (!feeds) return;

                    const updatedPrices = {};

                    for (const [rawKey, feed] of Object.entries(feeds)) {

                        const ltpc = feed?.fullFeed?.marketFF?.ltpc;
                        if (!ltpc) continue;

                        const ltp = Number(ltpc.ltp);
                        const prevClose = Number(ltpc.cp);

                        if (!isFinite(ltp) || !isFinite(prevClose)) continue;

                        const change = +(ltp - prevClose).toFixed(2);
                        const percent = +((change / prevClose) * 100).toFixed(2);

                        const key = rawKey.trim().toUpperCase();

                        updatedPrices[key] = {
                            ltp,
                            change,
                            percent,
                            direction: change >= 0 ? "up" : "down",
                            ts: Date.now()
                        };

                    }

                    if (Object.keys(updatedPrices).length > 0) {

                        setPrices(prev => {

                            const merged = { ...prev, ...updatedPrices };

                            localStorage.setItem(
                                "lastPrices",
                                JSON.stringify(merged)
                            );

                            return merged;

                        });

                        setLastPrices(prev => ({ ...prev, ...updatedPrices }));
                    }

                } catch (err) {
                    console.error("Tick parse error:", err);
                }

            };

            ws.onclose = () => {

                console.warn("🔴 WS closed");
                setIsConnected(false);

                if (!closed) {
                    setTimeout(connect, 2000);
                }

            };

            ws.onerror = () => {
                console.warn("WS temporary error");
            };

        };

        connect();

        return () => {
            closed = true;
            wsRef.current?.close();
        };

    }, [instrumentByKey]);

    return {
        prices,
        lastPrices,
        isConnected,
        isLoading,
        wsRef
    };
}