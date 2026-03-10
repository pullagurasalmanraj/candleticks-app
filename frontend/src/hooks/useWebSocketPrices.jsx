import { useEffect, useRef, useState } from "react";

export default function useWebSocketPrices(instrumentByKey) {

    const wsRef = useRef(null);

    const [prices, setPrices] = useState({});
    const [lastPrices, setLastPrices] = useState({});
    const [isConnected, setIsConnected] = useState(false);

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

                const keys = Object.keys(savedSubs);

                if (keys.length > 0) {

                    ws.send(
                        JSON.stringify({
                            subscribe: keys,
                            source: "restore"
                        })
                    );

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

                        const direction = change >= 0 ? "up" : "down";

                        const key = rawKey.trim().toUpperCase();

                        updatedPrices[key] = {
                            ltp,
                            change,
                            percent,
                            direction,
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

                        setLastPrices(prev => ({
                            ...prev,
                            ...updatedPrices
                        }));

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

                console.error("⚠ WS error");

                ws.close();

            };

        };

        connect();

        return () => {

            closed = true;

            wsRef.current?.close();

        };

    }, [instrumentByKey]);



    const sendMessage = (msg) => {

        if (wsRef.current?.readyState === WebSocket.OPEN) {

            wsRef.current.send(JSON.stringify(msg));

        }

    };


    return {
        prices,
        lastPrices,
        isConnected,
        wsRef,
        sendMessage
    };

}