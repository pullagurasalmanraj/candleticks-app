// src/pages/Dashboard.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import DatePicker from "react-datepicker";
import { format } from "date-fns";
import "react-datepicker/dist/react-datepicker.css";
import { useTheme } from "../context/ThemeContext";
import SkeletonLoader from "../components/SkeletonLoader";

import { INDEX_LIST, INDEX_DEFAULTS } from "../context/indexes";
import ChangeBadge from "../components/ChangeBadge";
import { startOfDay } from "../utils/dateUtils";
import { normalizeKey } from "../utils/instrumentUtils";
import { getLtpForInstrument } from "../utils/priceUtils";
import { formatYMD } from "../utils/dateUtils";
import { normalizeDate } from "../utils/dateUtils";

import SearchBar from "../components/SearchBar";
import WebSocketStatus from "../components/WebSocketStatus";
import MarketSummary from "../components/MarketSummary";
import IndexStrip from "../components/IndexStrip";
import SelectedInstruments from "../components/SelectedInstruments";
import ToolsPanel from "../components/ToolsPanel";




export default function Dashboard() {
    const { theme } = useTheme();
    const isLight = theme === "light";
    const searchCacheRef = useRef({}); // ✅ ADD THIS


    // ---------- State ----------
    const [instruments, setInstruments] = useState([]);
    const [prices, setPrices] = useState({});
    const [lastPrices, setLastPrices] = useState({});
    const [isApplyingIndicators, setIsApplyingIndicators] = useState(false);

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [showResults, setShowResults] = useState(false);

    const [watchlist, setWatchlist] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState("");
    const [selectedInstrument, setSelectedInstrument] = useState(null);

    const [selectedInstruments, setSelectedInstruments] = useState([]);
    const [activeSubscriptions, setActiveSubscriptions] = useState({});

    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);

    const [mode, setMode] = useState("");
    const [years, setYears] = useState("");

    const [timeframes, setTimeframes] = useState([]);
    const [timeframe, setTimeframe] = useState("");
    const [histStart, setHistStart] = useState(null);
    const [histEnd, setHistEnd] = useState(null);
    const [isFetchingHistory, setIsFetchingHistory] = useState(false);


    const [isConnected, setIsConnected] = useState(false);
    const [indexData, setIndexData] = useState({});
    const [marketSummary, setMarketSummary] = useState(null);
    const [asOf, setAsOf] = useState(null);
    const [toast, setToast] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const wsRef = useRef(null);
    // Manual WebSocket Control Mode
    const [manualWS, setManualWS] = useState(false);

    const connectWebSocket = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            return setToast("Already connected.");
        }

        setManualWS(true);
        const ws = new WebSocket("ws://localhost:9000");
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            setToast("🟢 WebSocket Connected");
        };

        ws.onclose = () => {
            setIsConnected(false);
            if (manualWS) {
                setTimeout(connectWebSocket, 2000);
            }
        };

        ws.onerror = () => {
            setToast("⚠ WebSocket Error");
            ws.close();
        };
    };

    const disconnectWebSocket = () => {
        setManualWS(false);
        if (wsRef.current) {
            wsRef.current.close();
            setIsConnected(false);
            setToast("🔴 WebSocket Disconnected");
        }
    };


    // 🔁 Restore last prices immediately on refresh
    useEffect(() => {
        const cached = localStorage.getItem("lastPrices");
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setPrices(parsed);
                setLastPrices(parsed);
            } catch { }
        }
    }, []);



    // preload visible index placeholders
    useEffect(() => {
        setIndexData(INDEX_DEFAULTS);
    }, []);

    // auto hide toast
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }, [toast]);

    // Load activeSubscriptions from localStorage
    useEffect(() => {
        const saved = localStorage.getItem("activeSubscriptions");
        if (saved) setActiveSubscriptions(JSON.parse(saved));
    }, []);

    useEffect(() => {
        localStorage.setItem("activeSubscriptions", JSON.stringify(activeSubscriptions));
    }, [activeSubscriptions]);



    const symbolMap = useMemo(() => {
        const map = {};
        instruments.forEach((i) => {
            const sym = i.symbol?.toUpperCase().trim();
            const key = i.instrument_key?.trim();
            const seg = (i.segment || "").toUpperCase();

            let exch = null;
            if (seg.includes("BSE")) exch = "BSE";
            else if (seg.includes("NSE")) exch = "NSE";

            if (!sym || !key || !exch) return;

            if (!map[sym]) map[sym] = {};
            map[sym][exch] = key;
        });
        return map;
    }, [instruments]);

    const instrumentBySymbol = useMemo(() => {
        const map = {};
        instruments.forEach((i) => {
            const sym = (i.symbol || "").toUpperCase().trim();
            if (sym && !map[sym]) {
                map[sym] = i;
            }
        });
        return map;
    }, [instruments]);

    const instrumentByKey = useMemo(() => {
        const map = {};
        instruments.forEach((inst) => {
            const key = inst.instrument_key?.trim().toUpperCase();
            if (!key) return;
            map[key] = inst;
        });
        return map;
    }, [instruments]);




    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 150);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        try {
            const saved = localStorage.getItem("watchlist");
            if (saved) setWatchlist(JSON.parse(saved));
        } catch {
            setWatchlist([]);
        }
    }, []);

    useEffect(() => {
        try {
            const saved = localStorage.getItem("selectedInstruments");
            if (saved) setSelectedInstruments(JSON.parse(saved));
        } catch {
            setSelectedInstruments([]);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem("selectedInstruments", JSON.stringify(selectedInstruments));
        } catch { }
    }, [selectedInstruments]);

    useEffect(() => {
        try {
            localStorage.setItem("watchlist", JSON.stringify(watchlist));
        } catch { }
    }, [watchlist]);


    useEffect(() => {
        // 🔒 minimum 2 chars – prevents useless DB calls
        if (debouncedSearch.length < 2) {
            setInstruments([]);
            return;
        }

        // ⚡ instant result from cache
        if (searchCacheRef.current[debouncedSearch]) {
            setInstruments(searchCacheRef.current[debouncedSearch]);
            return;
        }

        const controller = new AbortController();

        fetch(
            `/api/instruments?q=${encodeURIComponent(debouncedSearch)}`,
            { signal: controller.signal }
        )
            .then((r) => r.json())
            .then((d) => {
                const results = Array.isArray(d.instruments) ? d.instruments : [];

                // 🧠 cache results
                searchCacheRef.current[debouncedSearch] = results;

                setInstruments(results);
            })
            .catch((err) => {
                if (err.name !== "AbortError") {
                    setInstruments([]);
                }
            });

        return () => controller.abort();
    }, [debouncedSearch]);


    useEffect(() => {
        let mounted = true;
        fetch("/api/timeframes")
            .then((r) => r.json())
            .then((d) => {
                if (!mounted) return;
                setTimeframes(Array.isArray(d.timeframes) ? d.timeframes : []);
            })
            .catch((e) => {
                console.error("Failed to load timeframes:", e);
                if (mounted) setTimeframes([]);
            });
        return () => {
            mounted = false;
        };
    }, []);

    const subscribeToStock = async (inst) => {
        if (!inst) return;
        const key = inst.instrument_key?.trim();
        const sym = inst.symbol?.toUpperCase().trim();
        const isActive = !!activeSubscriptions[key];

        if (!key) return setToast("Missing instrument key.");

        try {
            if (!isActive) {
                await fetch(
                    `/api/ws-subscribe?symbol=${encodeURIComponent(sym)}`
                );

                wsRef.current?.send(
                    JSON.stringify({ subscribe: [key], source: "user" })
                );

                setActiveSubscriptions((prev) => ({ ...prev, [key]: true }));
                setSelectedSymbol(sym);
                setSelectedInstrument(inst);
                setToast(`Subscribed: ${sym}`);
            } else {
                await fetch(`/api/unsubscribe`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ instrument_key: key }),
                });

                wsRef.current?.send(
                    JSON.stringify({ unsubscribe: [key], source: "user" })
                );

                setActiveSubscriptions((prev) => {
                    const u = { ...prev };
                    delete u[key];
                    return u;
                });
                setToast(`Unsubscribed: ${sym}`);
            }
        } catch (err) {
            console.error(err);
            setToast("Failed to update subscription");
        }
    };

    // WebSocket hook — CONNECT ONCE (PRICE SOURCE OF TRUTH)
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
                setIsLoading(false);

                const keys = Object.keys(savedSubs);
                if (keys.length > 0) {
                    ws.send(JSON.stringify({ subscribe: keys, source: "restore" }));
                }
            };

            ws.onmessage = (evt) => {
                try {
                    const msg = JSON.parse(evt.data);
                    const feeds = msg?.data?.feeds;
                    if (!feeds) return;

                    const updatedPrices = {};
                    const updatedTrends = {};

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

                        // 🔑 STORE PRICES BY INSTRUMENT_KEY ONLY
                        updatedPrices[key] = {
                            ltp,
                            change,
                            percent,
                            direction,
                            ts: Date.now()
                        };


                        // OPTIONAL: trend by symbol (UI arrows)
                        const inst = instrumentByKey[key];
                        if (inst?.symbol) {
                            updatedTrends[inst.symbol.toUpperCase()] = direction;
                        }
                    }

                    if (Object.keys(updatedPrices).length > 0) {
                        setPrices((prev) => {
                            const merged = { ...prev, ...updatedPrices };

                            // 🔐 Persist prices so refresh / reconnect does not clear UI
                            localStorage.setItem("lastPrices", JSON.stringify(merged));

                            return merged;
                        });

                        setLastPrices((prev) => ({ ...prev, ...updatedPrices }));
                    }


                    if (Object.keys(updatedTrends).length > 0) {
                        setPriceChange((prev) => ({ ...prev, ...updatedTrends }));
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
    }, []); // ✅ DO NOT ADD DEPENDENCIES


    const toggleWatchlist = (inst) => {
        const sym = (inst.symbol || "").toUpperCase().trim();
        const exists = watchlist.find((w) => w.symbol === sym);
        if (exists) {
            setWatchlist((prev) => prev.filter((w) => w.symbol !== sym));
        } else {
            setWatchlist((prev) => [...prev, { ...inst, symbol: sym }]);
        }
    };

    const applyIndicators = async () => {
        if (!selectedSymbol || !timeframe) {
            return setToast("Select a symbol and timeframe first.");
        }

        setIsApplyingIndicators(true);

        const normalizeTF = (tf) => {
            const t = tf.toString().toLowerCase();
            const map = {
                "1": "1m",
                "1m": "1m",
                "3": "3m",
                "3m": "3m",
                "5": "5m",
                "5m": "5m",
                "15": "15m",
                "15m": "15m",
                "30": "30m",
                "30m": "30m",
                "60": "60m",
                "60m": "60m",
                "1d": "1d",
                day: "1d",
                daily: "1d",
                "1440": "1d",
            };
            return map[t] || t;
        };

        const finalTF = normalizeTF(timeframe);
        const isDaily = finalTF === "1d";

        const url = isDaily
            ? `/api/indicators/daily?symbol=${selectedSymbol}&store=true`
            : `/api/indicators/intraday?symbol=${selectedSymbol}&timeframe=${finalTF}&store=true`;

        try {
            setToast("Generating indicators...");

            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok || data.error) {
                return setToast(
                    data.error || "Indicator processing failed"
                );
            }

            setToast(
                `Saved ${data.count || data.rows || 0} rows for ${selectedSymbol} (${finalTF})`
            );
        } catch (err) {
            console.error(err);
            setToast("Error applying indicators");
        } finally {
            setIsApplyingIndicators(false);
        }
    };



    const fetchHistoricalCandles = async () => {
        if (!selectedSymbol || !timeframe || !histStart || !histEnd) {
            return setToast("Select symbol, timeframe and date range.");
        }

        if (!selectedInstrument) {
            return setToast("Select from search list before fetching data.");
        }

        const sym = selectedSymbol.trim().toUpperCase();
        const key = selectedInstrument.instrument_key;
        const s = formatYMD(histStart);
        const e = formatYMD(histEnd);

        // Today in YYYY-MM-DD
        const todayStr = format(new Date(), "yyyy-MM-dd");
        const isTodayRange = (s === todayStr && e === todayStr);

        setIsFetchingHistory(true);

        try {
            let endpoint = "";
            let payload = {
                symbol: sym,
                instrument_key: key,
                start_date: s,
                end_date: e,
            };

            // DAILY mode → history-daily
            if (["1D", "1DAY", "DAY", "1440"].includes(timeframe)) {
                endpoint = "/api/candles/daily";
            }
            // TODAY → use /api/candles/store (intraday live fetch)
            else if (isTodayRange) {
                endpoint = "/api/candles/store";
                payload.timeframe = timeframe;
            }
            // PAST DATES → use /api/candles/history
            else {
                endpoint = "/api/candles/history";
                payload.timeframe = timeframe;
            }

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await res.json();

            if (!res.ok) {
                return setToast(result.error || "API error");
            }

            setToast(
                `Stored ${result.inserted} ${["1D", "DAY", "1DAY"].includes(timeframe)
                    ? "daily"
                    : timeframe
                } candles for ${sym}`
            );
        } catch (err) {
            console.error(err);
            setToast("Fetch error.");
        } finally {
            setIsFetchingHistory(false);
        }
    };

    const runBulkFetch = async () => {
        if (!selectedInstrument) return setToast("Select stock first.");
        if (!years) return setToast("Select a year range.");

        const sym = selectedSymbol.toUpperCase();
        const key = selectedInstrument.instrument_key;
        const months = years * 12;

        const ranges = [];
        let today = new Date();
        let year = today.getFullYear();
        let month = today.getMonth();

        for (let i = 0; i < months; i++) {
            const start = new Date(year, month, 1);
            const end = new Date(year, month + 1, 0);

            ranges.push({
                start: formatYMD(start),
                end: formatYMD(end),
            });

            month--;
            if (month < 0) {
                month = 11;
                year--;
            }
        }

        setToast(`Fetching ${years} year(s)...`);
        setIsFetchingHistory(true);

        for (const r of ranges) {
            const payload = {
                symbol: sym,
                instrument_key: key,
                start_date: r.start,
                end_date: r.end,
            };

            let endpoint = "";

            if (["1440", "1D", "1d", "DAY", "day"].includes(timeframe)) {
                endpoint = "/api/candles/daily";
            } else {
                endpoint = "/api/candles/history";
                payload.timeframe = timeframe;
            }

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await res.json();

            if (!res.ok) {
                setToast(`Error (${r.start}→${r.end}): ${result.error}`);
                break;
            }

            setToast(`Stored ${r.start} → ${r.end}`);
            await new Promise((r) => setTimeout(r, 300));
        }

        setIsFetchingHistory(false);
        setToast(`Done fetching ${years} year(s).`);
    };



    const downloadExcel = async () => {
        if (!selectedSymbol || !startDate || !endDate) {
            return setToast("Select symbol, start date, and end date.");
        }
        if (!selectedInstrument) {
            return setToast("Select the stock from search list first.");
        }

        const key = selectedInstrument.instrument_key;
        if (!key) {
            return setToast("No instrument_key found. Please refresh instruments.");
        }

        const sym = selectedSymbol.trim().toUpperCase();
        const s = normalizeDate(startDate);
        const e = normalizeDate(endDate);

        const url = `/api/history/daily?instrument_key=${encodeURIComponent(
            key
        )}&symbol=${encodeURIComponent(sym)}&start=${s}&end=${e}&_=${Date.now()}`;

        try {
            const res = await fetch(url);
            const type = res.headers.get("content-type") || "";

            if (type.includes("application/json")) {
                const err = await res.json().catch(() => ({}));
                return setToast(err.error || "Server error");
            }

            const blob = await res.blob();
            const fileURL = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = fileURL;
            a.download = `${sym}_${s}_to_${e}_Daily.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setToast("Excel downloaded.");
        } catch {
            setToast("Failed to download.");
        }
    };

    if (isLoading) {
        return (
            <div
                className={
                    isLight
                        ? "min-h-[calc(100vh-4rem)] bg-slate-50 text-slate-900"
                        : "min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-50"
                }
            >
                <SkeletonLoader />
            </div>
        );
    }

    const selectedLtp = selectedInstrument
        ? getLtpForInstrument(selectedInstrument)
        : "--";

    // ------------------- UI -------------------
    return (
        <div
            className={
                isLight
                    ? "min-h-[calc(100vh-4rem)] bg-neutral-100 text-slate-900"
                    : "min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-50"
            }
        >

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-5 right-5 z-50 rounded-md bg-slate-900 text-slate-50 text-xs px-4 py-2 shadow-lg border border-slate-700">
                    {toast}
                </div>
            )}

            <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

                {/* Top row: search + status */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                    <SearchBar
                        search={search}
                        setSearch={setSearch}
                        setDebouncedSearch={setDebouncedSearch}
                        showResults={showResults}
                        setShowResults={setShowResults}
                        debouncedSearch={debouncedSearch}
                        instruments={instruments}
                        watchlist={watchlist}
                        toggleWatchlist={toggleWatchlist}
                        setSelectedSymbol={setSelectedSymbol}
                        setSelectedInstrument={setSelectedInstrument}
                        setSelectedInstruments={setSelectedInstruments}
                        getLtpForInstrument={getLtpForInstrument}
                        prices={prices}
                        isLight={isLight}
                    />

                    {/* Status */}
                    <div className="flex items-end lg:items-center gap-4 justify-between lg:justify-end">

                        <WebSocketStatus
                            isConnected={isConnected}
                            connectWebSocket={connectWebSocket}
                            disconnectWebSocket={disconnectWebSocket}
                        />

                        <MarketSummary
                            marketSummary={marketSummary}
                            asOf={asOf}
                        />

                    </div>

                </div>


                {/* Index strip */}
                <IndexStrip
                    prices={prices}
                    indexData={indexData}
                    isLight={isLight}
                />


                {/* Main layout */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                    {/* LEFT */}
                    <SelectedInstruments
                        selectedInstruments={selectedInstruments}
                        prices={prices}
                        selectedSymbol={selectedSymbol}
                        activeSubscriptions={activeSubscriptions}
                        isLight={isLight}
                        normalizeKey={normalizeKey}
                        setSelectedSymbol={setSelectedSymbol}
                        setSelectedInstrument={setSelectedInstrument}
                        setSelectedInstruments={setSelectedInstruments}
                        subscribeToStock={subscribeToStock}
                    />

                    {/* RIGHT */}
                    <ToolsPanel
                        isLight={isLight}
                        selectedSymbol={selectedSymbol}
                        setSelectedSymbol={setSelectedSymbol}
                        startDate={startDate}
                        endDate={endDate}
                        setStartDate={setStartDate}
                        setEndDate={setEndDate}
                        histStart={histStart}
                        histEnd={histEnd}
                        setHistStart={setHistStart}
                        setHistEnd={setHistEnd}
                        timeframe={timeframe}
                        setTimeframe={setTimeframe}
                        timeframes={timeframes}
                        years={years}
                        setYears={setYears}
                        isApplyingIndicators={isApplyingIndicators}
                        runBulkFetch={runBulkFetch}
                        applyIndicators={applyIndicators}
                        fetchHistoricalCandles={fetchHistoricalCandles}
                        downloadExcel={downloadExcel}
                    />

                </div>

            </div>

        </div>
    );
}