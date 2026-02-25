// src/pages/Dashboard.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import DatePicker from "react-datepicker";
import { format } from "date-fns";
import "react-datepicker/dist/react-datepicker.css";
import { useTheme } from "../context/ThemeContext";
import SkeletonLoader from "../components/SkeletonLoader";

// ----------------- Major Indexes -----------------
const INDEX_LIST = [
    { name: "Nifty 50", symbol: "NIFTY", display: "Nifty 50" },
    { name: "Sensex", symbol: "SENSEX", display: "Sensex" },
    { name: "Bank Nifty", symbol: "BANKNIFTY", display: "Bank Nifty" },
    { name: "Nifty Next 50", symbol: "NEXT50", display: "Nifty Next 50" },
];

function ChangeBadge({ pct, up }) {
    const sign = up ? "+" : "";
    return (
        <span
            className={
                "text-[11px] font-semibold px-2 py-0.5 rounded-full " +
                (up
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300")
            }
        >
            {sign}
            {pct.toFixed(2)}%
        </span>
    );
}


const startOfDay = (date) => {
    if (!date) return null;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};








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
        setIndexData({
            NIFTY: { ltp: "--", change: 0, percent: 0 },
            BANKNIFTY: { ltp: "--", change: 0, percent: 0 },
            SENSEX: { ltp: "--", change: 0, percent: 0 },
            NEXT50: { ltp: "--", change: 0, percent: 0 },
        });
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

    const normalizeKey = (instOrKey) => {
        if (!instOrKey) return "";
        if (typeof instOrKey === "string") {
            return instOrKey.toUpperCase().trim();
        }
        return (
            (
                instOrKey.instrument_key ||
                instOrKey.instrumentKey ||
                instOrKey.symbol ||
                ""
            )
                .toString()
                .toUpperCase()
                .trim()
        );
    };

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



    const getLtpForInstrument = (inst) => {
        if (!inst) return "--";
        const key = inst.instrument_key?.toUpperCase().trim();
        return prices[key]?.ltp ?? "--";
    };

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
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 150);
        return () => clearTimeout(t);
    }, [search]);


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
            `http://localhost:5000/api/instruments?q=${encodeURIComponent(debouncedSearch)}`,
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
        fetch("http://localhost:5000/api/timeframes")
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
                    `http://localhost:5000/api/ws-subscribe?symbol=${encodeURIComponent(sym)}`
                );

                wsRef.current?.send(
                    JSON.stringify({ subscribe: [key], source: "user" })
                );

                setActiveSubscriptions((prev) => ({ ...prev, [key]: true }));
                setSelectedSymbol(sym);
                setSelectedInstrument(inst);
                setToast(`Subscribed: ${sym}`);
            } else {
                await fetch(`http://localhost:5000/api/unsubscribe`, {
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
            ? `http://localhost:5000/api/indicators/daily?symbol=${selectedSymbol}&store=true`
            : `http://localhost:5000/api/indicators/intraday?symbol=${selectedSymbol}&timeframe=${finalTF}&store=true`;

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

    const formatYMD = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
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
                endpoint = "http://localhost:5000/api/candles/daily";
            }
            // TODAY → use /api/candles/store (intraday live fetch)
            else if (isTodayRange) {
                endpoint = "http://localhost:5000/api/candles/store";
                payload.timeframe = timeframe;
            }
            // PAST DATES → use /api/candles/history
            else {
                endpoint = "http://localhost:5000/api/candles/history";
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
                endpoint = "http://localhost:5000/api/candles/daily";
            } else {
                endpoint = "http://localhost:5000/api/candles/history";
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

    const normalizeDate = (d) => format(d, "yyyy-MM-dd");

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

        const url = `http://localhost:5000/api/history/daily?instrument_key=${encodeURIComponent(
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
                    {/* Search */}
                    <div className="w-full lg:max-w-xl relative">

                        <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">
                            Search instruments
                        </p>
                        <div className="space-y-2">
                            <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                    🔍
                                </span>
                                <input
                                    value={search}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setSearch(val);
                                        setShowResults(val.trim().length > 0);
                                        if (!val.trim()) setDebouncedSearch("");
                                    }}
                                    placeholder="Search by symbol or name (e.g. TCS, INFY, RELIANCE)…"
                                    className={[
                                        "w-full rounded-full border px-9 py-2.5 text-sm outline-none shadow-sm",
                                        isLight
                                            ? "bg-neutral-50 border-neutral-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"

                                            : "bg-slate-900 border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-900",
                                    ].join(" ")}
                                />
                            </div>

                            {showResults && debouncedSearch && (
                                <ul
                                    className={[
                                        "absolute top-full left-0 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border text-xs shadow-lg z-50",
                                        isLight
                                            ? "bg-neutral-50 border-neutral-300 divide-y divide-neutral-200"

                                            : "bg-slate-900 border-slate-700 divide-slate-800",
                                    ].join(" ")}
                                >
                                    {instruments.length === 0 ? (
                                        <li className="px-3 py-3 text-slate-500 italic">
                                            No instruments found.
                                        </li>
                                    ) : (
                                        instruments.slice(0, 80).map((inst) => {
                                            const sym = (inst.symbol || "").toUpperCase().trim();
                                            const ltp = getLtpForInstrument(inst);
                                            const inWatch = watchlist.some((w) => w.symbol === sym);
                                            const isOption =
                                                inst.segment === "NSE_FO" &&
                                                ["CE", "PE"].includes(inst.instrument_type);

                                            return (
                                                <li
                                                    key={`${sym}-${inst.instrument_key}`}
                                                    className={[
                                                        "px-3 py-2 flex items-center justify-between cursor-pointer",
                                                        isLight ? "hover:bg-neutral-100" : "hover:bg-slate-800/70",

                                                    ].join(" ")}
                                                    onClick={() => {
                                                        const exchange =
                                                            inst.exchange?.toUpperCase() || "";
                                                        setSelectedSymbol(sym);
                                                        const enrichedInst = {
                                                            ...inst,
                                                            symbol: sym,
                                                            exchange,
                                                        };
                                                        setSelectedInstrument(enrichedInst);

                                                        setSelectedInstruments((prev) => {
                                                            const exists = prev.some(
                                                                (p) =>
                                                                    p.symbol === sym &&
                                                                    p.exchange === exchange
                                                            );
                                                            if (exists) return prev;
                                                            return [...prev, enrichedInst];
                                                        });

                                                        setShowResults(false);
                                                    }}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="text-[12px] font-semibold truncate">
                                                            {sym}
                                                            {isOption && (
                                                                <span className="ml-2 text-[10px] text-indigo-500">
                                                                    {inst.instrument_type} | Lot {inst.lot_size}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="text-[11px] text-slate-500 truncate">
                                                            {inst.name}
                                                        </div>
                                                        {isOption && (
                                                            <div className="text-[10px] text-slate-400">
                                                                Exp: {new Date(inst.expiry).toLocaleDateString("en-IN", {
                                                                    day: "2-digit",
                                                                    month: "short",
                                                                    year: "2-digit",
                                                                })}
                                                            </div>
                                                        )}

                                                        <div className="text-[10px] text-slate-400">
                                                            {inst.segment}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[11px] font-semibold">
                                                            ₹{" "}
                                                            {typeof ltp === "number"
                                                                ? ltp.toLocaleString("en-IN")
                                                                : "--"}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleWatchlist(inst);
                                                            }}
                                                            className={[
                                                                "text-[11px] px-2 py-0.5 rounded-full border",
                                                                inWatch
                                                                    ? "bg-amber-400 text-black border-amber-400"
                                                                    : isLight
                                                                        ? "border-slate-300 text-slate-500"
                                                                        : "border-slate-600 text-slate-300",
                                                            ].join(" ")}
                                                        >
                                                            {inWatch ? "★" : "☆"}
                                                        </button>
                                                    </div>
                                                </li>
                                            );
                                        })
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-end lg:items-center gap-4 justify-between lg:justify-end">
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

                        <div className="text-right text-[11px] text-slate-400">
                            <div className="font-medium">
                                {marketSummary?.title ?? "Market summary"}
                            </div>
                            <div>
                                {asOf ? `Updated ${new Date(asOf).toLocaleTimeString()}` : ""}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Index strip */}
                <section
                    className={[
                        "rounded-2xl border px-4 py-3 flex items-center gap-3 overflow-x-auto",
                        isLight
                            ? "bg-white border-slate-200"
                            : "bg-slate-900 border-slate-800",
                    ].join(" ")}
                >
                    {INDEX_LIST.map((idx) => {
                        const sym = idx.symbol.toUpperCase().replace(/ /g, "");
                        const live = prices[sym] || null;
                        const d = indexData[sym] || null;
                        const source = live || d;

                        const ltp = source?.ltp ?? "--";
                        const change = source?.change ?? 0;
                        const pct = source?.percent ?? 0;
                        const up = change >= 0;

                        return (
                            <div
                                key={idx.name}
                                className={[
                                    "min-w-[160px] rounded-xl px-3 py-2 flex items-center justify-between text-xs border",
                                    isLight
                                        ? "bg-slate-50 border-slate-200"
                                        : "bg-slate-900 border-slate-700",
                                ].join(" ")}
                            >
                                <div>
                                    <div className="text-[12px] font-semibold">
                                        {idx.display}
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                        {idx.name}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[13px] font-semibold">
                                        {typeof ltp === "number"
                                            ? ltp.toLocaleString("en-IN", {
                                                minimumFractionDigits: 2,
                                            })
                                            : ltp}
                                    </div>
                                    <div className="flex items-center justify-end gap-1 mt-0.5">
                                        <span
                                            className={[
                                                "text-[10px] font-semibold",
                                                up ? "text-emerald-500" : "text-red-400",
                                            ].join(" ")}
                                        >
                                            {up ? "▲" : "▼"} {change.toFixed(2)}
                                        </span>
                                        <ChangeBadge pct={pct || 0} up={up} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </section>
                {/* Main two-column layout */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                    {/* LEFT: Selected instruments */}
                    <section
                        className={[
                            "xl:col-span-2 rounded-2xl border shadow-sm p-5",
                            isLight
                                ? "bg-white border-slate-200"
                                : "bg-slate-900 border-slate-800",
                        ].join(" ")}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-sm font-semibold">Selected instruments</h2>
                                <p className="text-[11px] text-slate-400">
                                    Click from search to add. Subscriptions are per instrument key.
                                </p>
                            </div>
                            <button
                                className="text-[11px] px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                onClick={() => {
                                    setSelectedInstruments([]);
                                    setSelectedInstrument(null);
                                    setSelectedSymbol("");
                                }}
                            >
                                Clear all
                            </button>
                        </div>

                        {selectedInstruments.length === 0 ? (
                            <p className="text-xs text-slate-500">
                                Use the search above to add instruments to your working list.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {selectedInstruments.map((item) => {
                                    const sym = (item.symbol || "").toUpperCase().trim();
                                    const key = normalizeKey(item);

                                    const live = prices[key] || {};

                                    const ltp = live.ltp;
                                    const change = live.change;
                                    const pct = live.percent;

                                    const hasPrice = typeof ltp === "number";
                                    const isUp = hasPrice && change >= 0;

                                    const arrow = !hasPrice ? "•" : isUp ? "▲" : "▼";
                                    const priceColor = !hasPrice
                                        ? "text-slate-400"
                                        : isUp
                                            ? "text-emerald-500"
                                            : "text-red-500";

                                    const displayLtp = hasPrice
                                        ? ltp.toLocaleString("en-IN")
                                        : "--";

                                    const displayChange = hasPrice
                                        ? change.toFixed(2)
                                        : "0.00";

                                    const displayPct = hasPrice
                                        ? pct.toFixed(2)
                                        : "0.00";

                                    const isSelected = selectedSymbol === sym;
                                    const isRunning = !!activeSubscriptions[key];

                                    return (
                                        <div
                                            key={`${sym}-${item.exchange || item.segment || ""}`}
                                            className={[
                                                "flex flex-col justify-between rounded-xl border px-4 py-3 shadow-sm hover:shadow-md cursor-pointer transition-all",

                                                isSelected
                                                    ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40"
                                                    : isLight
                                                        ? "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                                                        : "border-slate-700 hover:border-blue-500/60 hover:bg-slate-900",
                                            ].join(" ")}
                                            onClick={() => {
                                                setSelectedSymbol(sym);
                                                setSelectedInstrument(item);
                                            }}
                                        >
                                            {/* Header */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold truncate">
                                                        {sym}
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 truncate">
                                                        {item.name}
                                                    </div>
                                                    {item.exchange && (
                                                        <div className="text-[10px] text-slate-400">
                                                            {item.exchange}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="text-right">
                                                    <div className={`text-xs font-bold ${priceColor}`}>
                                                        {arrow} ₹ {displayLtp}

                                                        {/* show stale indicator if price is cached / no recent tick */}
                                                        {live?.ts && Date.now() - live.ts > 2000 && (
                                                            <span className="ml-1 text-[10px] text-slate-400">
                                                                (last)
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className={`text-[11px] font-semibold ${priceColor}`}>
                                                        {isUp ? "+" : ""}
                                                        {displayChange} ({displayPct}%)
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="mt-3 flex items-center justify-between gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        subscribeToStock(item);
                                                    }}
                                                    className={[
                                                        "h-8 px-3 text-[11px] rounded-md font-medium border",
                                                        isRunning
                                                            ? "bg-red-600 border-red-600 text-white hover:bg-red-700"
                                                            : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700",
                                                    ].join(" ")}
                                                >
                                                    {isRunning ? "Stop stream" : "Start stream"}
                                                </button>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedInstruments((prev) =>
                                                            prev.filter(
                                                                (p) =>
                                                                    !(
                                                                        p.symbol === sym &&
                                                                        (p.exchange || p.segment) ===
                                                                        (item.exchange || item.segment)
                                                                    )
                                                            )
                                                        );
                                                    }}
                                                    className={[
                                                        "h-8 px-3 text-[11px] rounded-md border",
                                                        isLight
                                                            ? "border-slate-300 hover:bg-slate-100"
                                                            : "border-slate-700 hover:bg-slate-800",
                                                    ].join(" ")}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* Right: Tools & data actions */}
                    <section className="xl:col-span-1 space-y-4">
                        <div className="w-full max-w-sm space-y-4">

                            {/* ================= DOWNLOAD DAILY ================= */}
                            <div
                                className={[
                                    "rounded-xl border p-4 shadow-sm",
                                    isLight
                                        ? "bg-white border-slate-200"
                                        : "bg-slate-900 border-slate-800",
                                ].join(" ")}
                            >
                                <h3 className="text-sm font-semibold mb-3">
                                    Download historical (daily)
                                </h3>

                                <div className="space-y-2">
                                    {/* Symbol */}
                                    <input
                                        value={selectedSymbol}
                                        onChange={(e) =>
                                            setSelectedSymbol(e.target.value.toUpperCase())
                                        }
                                        placeholder="Symbol (e.g. TCS)"
                                        className={[
                                            "w-full h-9 rounded-md border px-3 text-sm outline-none box-border",
                                            isLight
                                                ? "bg-white border-slate-300 focus:border-blue-500"
                                                : "bg-slate-800 border-slate-700 focus:border-blue-500",
                                        ].join(" ")}
                                    />

                                    {/* Date range */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="w-full">
                                            <DatePicker
                                                fixedHeight
                                                selected={startDate}
                                                onChange={(d) => setStartDate(startOfDay(d))}
                                                maxDate={startOfDay(new Date())}
                                                showMonthDropdown
                                                showYearDropdown
                                                dropdownMode="select"
                                                dateFormat="dd/MM/yyyy"
                                                placeholderText="Start date"
                                                popperPlacement="bottom-start"
                                                portalId="datepicker-portal"
                                                className={[
                                                    "w-full h-9 rounded-md border px-2 text-center text-sm outline-none box-border tabular-nums",
                                                    isLight
                                                        ? "bg-white border-slate-300"
                                                        : "bg-slate-800 border-slate-700",
                                                ].join(" ")}
                                            />

                                        </div>

                                        <div className="w-full">
                                            <DatePicker
                                                fixedHeight
                                                selected={endDate}
                                                onChange={(d) => setEndDate(startOfDay(d))}
                                                minDate={startDate ? startOfDay(startDate) : null}
                                                maxDate={startOfDay(new Date())}
                                                showMonthDropdown
                                                showYearDropdown
                                                dropdownMode="select"
                                                dateFormat="dd/MM/yyyy"
                                                placeholderText="End date"
                                                popperPlacement="bottom-start"
                                                portalId="datepicker-portal"
                                                className={[
                                                    "w-full h-9 rounded-md border px-2 text-center text-sm outline-none box-border tabular-nums",
                                                    isLight
                                                        ? "bg-white border-slate-300"
                                                        : "bg-slate-800 border-slate-700",
                                                ].join(" ")}
                                            />

                                        </div>
                                    </div>


                                    {/* Download button */}
                                    <div className="flex justify-end pt-1">
                                        <button
                                            type="button"
                                            onClick={downloadExcel}
                                            className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                                        >
                                            Download Excel
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ================= INTRADAY & INDICATORS ================= */}
                            <div
                                className={[
                                    "rounded-xl border p-4 shadow-sm",
                                    isLight
                                        ? "bg-white border-slate-200"
                                        : "bg-slate-900 border-slate-800",
                                ].join(" ")}
                            >
                                <h3 className="text-sm font-semibold mb-3">
                                    Intraday history & indicators
                                </h3>

                                <div className="space-y-3">
                                    {/* Timeframe */}
                                    <div>
                                        <label className="block mb-1 text-[11px] font-medium text-slate-500">
                                            Timeframe
                                        </label>
                                        <select
                                            value={timeframe}
                                            onChange={(e) => setTimeframe(e.target.value)}
                                            className={[
                                                "w-full h-9 rounded-md border px-2 text-sm outline-none box-border",
                                                isLight
                                                    ? "bg-white border-slate-300"
                                                    : "bg-slate-800 border-slate-700",
                                            ].join(" ")}
                                        >
                                            <option value="">Select timeframe</option>
                                            {timeframes.map((tf) => (
                                                <option key={tf.value} value={tf.value}>
                                                    {tf.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Bulk years */}
                                    <div>
                                        <label className="block mb-1 text-[11px] font-medium text-slate-500">
                                            Bulk fetch range (years)
                                        </label>
                                        <select
                                            value={years}
                                            onChange={(e) => setYears(e.target.value)}
                                            className={[
                                                "w-full h-9 rounded-md border px-2 text-sm outline-none box-border",
                                                isLight
                                                    ? "bg-white border-slate-300"
                                                    : "bg-slate-800 border-slate-700",
                                            ].join(" ")}
                                        >
                                            <option value="">Select</option>
                                            <option value="1">1 Year</option>
                                            <option value="2">2 Years</option>
                                            <option value="3">3 Years</option>
                                            <option value="5">5 Years</option>
                                        </select>
                                    </div>

                                    {/* Manual date range */}
                                    <div>
                                        <label className="block mb-1 text-[11px] font-medium text-slate-500">
                                            Manual date range
                                        </label>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="w-full">
                                                <DatePicker
                                                    fixedHeight
                                                    selected={histStart}
                                                    onChange={(d) => setHistStart(startOfDay(d))}
                                                    maxDate={startOfDay(new Date())}
                                                    showMonthDropdown
                                                    showYearDropdown
                                                    dropdownMode="select"
                                                    dateFormat="dd/MM/yyyy"
                                                    placeholderText="Start date"
                                                    popperPlacement="bottom-start"
                                                    portalId="datepicker-portal"
                                                    className={[
                                                        "w-full h-9 rounded-md border px-2 text-center text-sm outline-none box-border tabular-nums",
                                                        isLight
                                                            ? "bg-white border-slate-300"
                                                            : "bg-slate-800 border-slate-700",
                                                    ].join(" ")}
                                                />
                                            </div>

                                            <div className="w-full">
                                                <DatePicker
                                                    fixedHeight
                                                    selected={histEnd}
                                                    onChange={(d) => setHistEnd(startOfDay(d))}
                                                    minDate={histStart ? startOfDay(histStart) : null}
                                                    maxDate={startOfDay(new Date())}
                                                    showMonthDropdown
                                                    showYearDropdown
                                                    dropdownMode="select"
                                                    dateFormat="dd/MM/yyyy"
                                                    placeholderText="End date"
                                                    popperPlacement="bottom-start"
                                                    portalId="datepicker-portal"
                                                    className={[
                                                        "w-full h-9 rounded-md border px-2 text-center text-sm outline-none box-border tabular-nums",
                                                        isLight
                                                            ? "bg-white border-slate-300"
                                                            : "bg-slate-800 border-slate-700",
                                                    ].join(" ")}
                                                />
                                            </div>
                                        </div>
                                    </div>


                                    {/* Action buttons */}
                                    <div className="space-y-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={runBulkFetch}
                                            disabled={!selectedSymbol || !timeframe || !years}
                                            className={[
                                                "w-full rounded-md px-3 py-2 text-xs font-semibold",
                                                !selectedSymbol || !timeframe || !years
                                                    ? "bg-slate-300 cursor-not-allowed"
                                                    : "bg-blue-600 text-white hover:bg-blue-700",
                                            ].join(" ")}
                                        >
                                            Fetch full history {years && `(${years}Y)`}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={applyIndicators}
                                            disabled={!selectedSymbol || !timeframe || isApplyingIndicators}
                                            className={[
                                                "w-full rounded-md px-3 py-2 text-xs font-semibold",
                                                !selectedSymbol || !timeframe || isApplyingIndicators
                                                    ? "bg-slate-300 cursor-not-allowed"
                                                    : "bg-emerald-600 text-white hover:bg-emerald-700",
                                            ].join(" ")}
                                        >
                                            {isApplyingIndicators ? "Processing…" : "Generate indicators"}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={fetchHistoricalCandles}
                                            disabled={!selectedSymbol || !timeframe || !histStart || !histEnd}
                                            className={[
                                                "w-full rounded-md px-3 py-2 text-xs font-semibold",
                                                !selectedSymbol || !timeframe || !histStart || !histEnd
                                                    ? "bg-slate-300 cursor-not-allowed"
                                                    : "bg-purple-600 text-white hover:bg-purple-700",
                                            ].join(" ")}
                                        >
                                            Fetch historical (store to DB)
                                        </button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </section>
                </div>

            </div>
        </div >
    );
}
