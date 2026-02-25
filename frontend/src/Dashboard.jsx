// src/pages/Dashboard.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import DatePicker from "react-datepicker";
import { format } from "date-fns";
import "react-datepicker/dist/react-datepicker.css";
import Fuse from "fuse.js";
import { useTheme } from "../context/ThemeContext";
import SkeletonLoader from "../components/SkeletonLoader";

// ----------------- Major Indexes -----------------
// ----------------- Major Indexes (Updated for Upstox live feed) -----------------
const INDEX_LIST = [
    { name: "Nifty 50", symbol: "NIFTY", display: "Nifty 50" },
    { name: "Sensex", symbol: "SENSEX", display: "Sensex" },
    { name: "Bank Nifty", symbol: "BANKNIFTY", display: "Bank Nifty" },
    { name: "Nifty Next 50", symbol: "NEXT50", display: "Nifty Next 50" },
];


// Small badge for % change
function ChangeBadge({ pct, up }) {
    const sign = up ? "+" : "";
    return (
        <span
            className={
                "text-xs font-semibold px-1.5 py-0.5 rounded-full " +
                (up ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")
            }
        >
            {sign}
            {pct.toFixed(2)}%
        </span>
    );
}

// 🔹 Helper: only weekdays & no future dates
const isWeekday = (date) => {
    const day = date.getDay(); // 0 = Sun, 6 = Sat
    return day !== 0 && day !== 6;
};

export default function Dashboard() {
    const { theme } = useTheme();
    const isLight = theme === "light";

    // ---------- State ----------
    const [instruments, setInstruments] = useState([]);
    const [prices, setPrices] = useState({}); // { [SYMBOL]: { ltp, change, percent } }
    const [priceChange, setPriceChange] = useState({}); // { [SYMBOL]: 'up' | 'down' | 'neutral' }
    const [lastPrices, setLastPrices] = useState({}); // reserved if needed later
    const [isApplyingIndicators, setIsApplyingIndicators] = useState(false);

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [showResults, setShowResults] = useState(false);

    const [watchlist, setWatchlist] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState("");
    const [selectedInstrument, setSelectedInstrument] = useState(null);

    const [selectedInstruments, setSelectedInstruments] = useState([]); // for cards
    const [activeSubscriptions, setActiveSubscriptions] = useState({}); // key = instrument_key

    // Load saved WS subs
    useEffect(() => {
        const saved = localStorage.getItem("activeSubscriptions");
        if (saved) setActiveSubscriptions(JSON.parse(saved));
    }, []);

    // Save changes
    useEffect(() => {
        localStorage.setItem("activeSubscriptions", JSON.stringify(activeSubscriptions));
    }, [activeSubscriptions]);


    // 📊 Excel date range (daily OHLC)
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);

    // mode = intraday / historical (for fetch button)
    const [mode, setMode] = useState("");

    // separate years span for bulk fetch
    const [years, setYears] = useState("");

    // 🕒 Intraday historical candles (stored in DB)
    const [timeframes, setTimeframes] = useState([]);
    const [timeframe, setTimeframe] = useState("");
    const [histStart, setHistStart] = useState(null);
    const [histEnd, setHistEnd] = useState(null);
    const [isFetchingHistory, setIsFetchingHistory] = useState(false);

    const [isConnected, setIsConnected] = useState(false);
    const [indexData, setIndexData] = useState({});
    // preload visible symbols so UI doesn't break before ticks
    useEffect(() => {
        setIndexData({
            NIFTY: { ltp: "--", change: 0, percent: 0 },
            BANKNIFTY: { ltp: "--", change: 0, percent: 0 },
            SENSEX: { ltp: "--", change: 0, percent: 0 },
            NEXT50: { ltp: "--", change: 0, percent: 0 },
        });
    }, []);

    const [marketSummary, setMarketSummary] = useState(null);
    const [asOf, setAsOf] = useState(null);
    const [toast, setToast] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const wsRef = useRef(null);
    const reconnectTimerRef = useRef(null);

    // ---------- Helpers / Derived ----------
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

    // symbol → instrument_key mapping (per exchange)
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

    // symbol → first instrument (for watchlist)
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

    // 🔍 Fuse.js search filtering
    const filtered = useMemo(() => {
        if (!debouncedSearch || !instruments.length) return [];

        const fuse = new Fuse(instruments, {
            keys: ["symbol", "name"],
            threshold: 0.3,
        });

        return fuse.search(debouncedSearch).map((r) => r.item);
    }, [debouncedSearch, instruments]);


    // instrument_key → instrument (correct Upstox mapping)
    const instrumentByKey = useMemo(() => {
        const map = {};

        instruments.forEach((inst) => {
            let key = (inst.instrument_key || "").trim().toUpperCase();
            const exch =
                (inst.exchange?.toUpperCase() ||
                    inst.segment?.includes("BSE") && "BSE" ||
                    inst.segment?.includes("NSE") && "NSE" ||
                    "NSE");

            // If already full format (NSE_EQ|xxxx) → keep
            if (/^(NSE_EQ|BSE_EQ)\|/i.test(key)) {
                map[key] = inst;
                return;
            }

            // If format is NSE|xxxx → convert only prefix
            if (/^(NSE|BSE)\|/i.test(key)) {
                key = key.replace(/^NSE\|/, "NSE_EQ|").replace(/^BSE\|/, "BSE_EQ|");
            }

            // If only ISIN/code → attach full prefix
            if (!key.includes("|")) {
                key = `${exch}_EQ|${key}`;
            }

            key = key.toUpperCase();
            map[key] = inst;
        });

        console.log("📌 Mapped keys:", Object.keys(map).slice(0, 10), `... total=${Object.keys(map).length}`);
        return map;
    }, [instruments]);


    useEffect(() => {
        if (instruments.length > 0) {
            const tcs = instruments.find(i => i.symbol?.toUpperCase() === "TCS");
            console.log("🔍 TCS Instrument Record:", tcs);
        }
    }, [instruments]);




    // Get LTP for a given instrument object (we store prices by SYMBOL)
    const getLtpForInstrument = (inst) => {
        if (!inst) return "--";
        const sym = (inst.symbol || "").toUpperCase().trim();
        const p = prices[sym];
        return p?.ltp ?? "--";
    };

    // Get LTP for a bare symbol
    const getLtpForSymbol = (symbol) => {
        if (!symbol) return "--";
        const upper = String(symbol).toUpperCase().trim();
        const p = prices[upper];
        return p?.ltp ?? "--";
    };

    // Debounce search input
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
        return () => clearTimeout(t);
    }, [search]);

    // Load watchlist from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem("watchlist");
            if (saved) setWatchlist(JSON.parse(saved));
        } catch {
            setWatchlist([]);
        }
    }, []);

    // Load selected instruments from localStorage when Dashboard mounts
    useEffect(() => {
        try {
            const saved = localStorage.getItem("selectedInstruments");
            if (saved) setSelectedInstruments(JSON.parse(saved));
        } catch {
            setSelectedInstruments([]);
        }
    }, []);

    // Save selected instruments to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(
                "selectedInstruments",
                JSON.stringify(selectedInstruments)
            );
        } catch {
            // ignore
        }
    }, [selectedInstruments]);

    // Save watchlist to localStorage
    useEffect(() => {
        try {
            localStorage.setItem("watchlist", JSON.stringify(watchlist));
        } catch {
            // ignore
        }
    }, [watchlist]);

    // Load instruments from backend
    useEffect(() => {
        let mounted = true;
        fetch("http://localhost:5000/api/instruments")
            .then((r) => r.json())
            .then((d) => {
                if (!mounted) return;
                const list = Array.isArray(d.instruments) ? d.instruments : [];
                setInstruments(list);
            })
            .catch((err) => {
                console.error("Failed to load instruments:", err);
                if (mounted) setInstruments([]);
            });

        return () => {
            mounted = false;
        };
    }, []);

    // 🔹 Load timeframes from backend (DB)
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


    // set of index keys (so we never track them as active stock subscriptions)
    const INDEX_KEYS = new Set([
        "NSE_INDEX|Nifty 50",
        "NSE_INDEX|Nifty Bank",
        "BSE_INDEX|Sensex",
        "NSE_INDEX|Nifty Next 50"
    ]);

    const subscribeToStock = async (inst) => {
        if (!inst) return;

        const key = inst.instrument_key?.trim();
        const sym = inst.symbol?.toUpperCase().trim();
        const isActive = !!activeSubscriptions[key];

        if (!key) return setToast("❌ Missing instrument key.");

        try {

            if (!isActive) {

                // 1️⃣ Tell backend → Redis → Upstox
                await fetch(`http://localhost:5000/api/ws-subscribe?symbol=${encodeURIComponent(sym)}`);

                // 2️⃣ Optional WebSocket UI tracking only
                wsRef.current?.send(JSON.stringify({ subscribe: [key], source: "user" }));

                setActiveSubscriptions(prev => ({ ...prev, [key]: true }));
                setSelectedSymbol(sym);
                setSelectedInstrument(inst);

                setToast(`📡 Subscribed: ${sym}`);

            } else {

                // 1️⃣ Tell backend → Redis → Upstox UNSUB
                await fetch(`http://localhost:5000/api/unsubscribe`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ instrument_key: key })
                });

                // 2️⃣ WebSocket only for UI cleanup
                wsRef.current?.send(JSON.stringify({ unsubscribe: [key], source: "user" }));

                setActiveSubscriptions(prev => {
                    const u = { ...prev };
                    delete u[key];
                    return u;
                });

                setToast(`⏹ Unsubscribed: ${sym}`);
            }

        } catch (err) {
            console.error(err);
            setToast("⚠️ Failed to subscribe");
        }
    };


    useEffect(() => {
        // Wait until instruments are loaded AND mapping exists
        if (!instruments.length || Object.keys(instrumentByKey).length === 0) {
            console.log("⏳ Waiting for instruments + mapping before connecting WS");
            return;
        }

        let closed = false;

        const savedSubs = JSON.parse(localStorage.getItem("activeSubscriptions") || "{}");

        const connect = () => {
            const ws = new WebSocket("ws://localhost:9000");
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("🟢 WebSocket Connected");
                setIsConnected(true);
                setIsLoading(false);

                const keys = Object.keys(savedSubs);
                if (keys.length > 0) {
                    console.log("🔁 Restoring:", keys);
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

                        const normalizedKey = rawKey.trim().toUpperCase();

                        const inst = instrumentByKey[normalizedKey];
                        if (!inst) {
                            console.warn(`⚠️ Unknown Tick Key:`, normalizedKey);
                            continue;
                        }

                        const symbol = inst.symbol.toUpperCase().trim();

                        updatedPrices[symbol] = { ltp, change, percent, direction };
                        updatedTrends[symbol] = direction;
                    }

                    setPrices(prev => ({ ...prev, ...updatedPrices }));
                    setPriceChange(prev => ({ ...prev, ...updatedTrends }));

                } catch (err) {
                    console.error("❌ Tick Parse Error:", err);
                }
            };

            ws.onclose = () => {
                console.warn("🔴 WebSocket Disconnected — retrying...");
                setIsConnected(false);

                if (!closed) setTimeout(connect, 2000);
            };

            ws.onerror = () => ws.close();
        };

        connect();

        return () => {
            closed = true;
            wsRef.current?.close();
        };

    }, [instruments]); // 👈 Only instruments here!




    // Add / remove from watchlist directly (via ★)
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
            return setToast("⚠️ Select a symbol and timeframe first.");
        }

        setIsApplyingIndicators(true);

        // Normalize timeframe
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
                "day": "1d",
                "daily": "1d",
                "1440": "1d"
            };
            return map[t] || t;
        };

        const finalTF = normalizeTF(timeframe);

        const isDaily = finalTF === "1d";

        const url = isDaily
            ? `http://localhost:5000/api/indicators/daily?symbol=${selectedSymbol}&store=true`
            : `http://localhost:5000/api/indicators/intraday?symbol=${selectedSymbol}&timeframe=${finalTF}&store=true`;

        try {
            setToast("⏳ Generating indicators...");

            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok || data.error) {
                return setToast(`❌ ${data.error || "Indicator processing failed"}`);
            }

            setToast(
                `📊 Saved ${data.count || data.rows || 0} rows for ${selectedSymbol} (${finalTF})`
            );

        } catch (err) {
            console.error(err);
            setToast("⚠️ Error applying indicators");

        } finally {
            setIsApplyingIndicators(false);
        }
    };



    const fetchHistoricalCandles = async () => {
        if (!selectedSymbol || !timeframe || !histStart || !histEnd) {
            return setToast("⚠️ Select symbol, timeframe and date range.");
        }

        if (!selectedInstrument) {
            return setToast("❌ Select from search list before fetching data.");
        }

        const sym = selectedSymbol.trim().toUpperCase();
        const key = selectedInstrument.instrument_key;
        const s = formatYMD(histStart);
        const e = formatYMD(histEnd);


        setIsFetchingHistory(true);

        try {
            let endpoint = "";
            let payload = {
                symbol: sym,
                instrument_key: key,
                start_date: s,
                end_date: e,
            };

            // 🔥 Detect if daily timeframe
            if (["1D", "1DAY", "DAY", "1440"].includes(timeframe)) {
                endpoint = "http://localhost:5000/api/candles/daily";
            } else {
                endpoint = "http://localhost:5000/api/candles/history";
                payload.timeframe = timeframe;
            }

            console.log("➡ Calling:", endpoint, payload);

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await res.json();

            if (!res.ok) {
                return setToast(`❌ ${result.error || "API Error"}`);
            }

            setToast(
                `✅ Stored ${result.inserted} ${["1D", "DAY", "1DAY"].includes(timeframe) ? "daily" : timeframe
                } candles for ${sym}`
            );
        } catch (err) {
            console.error(err);
            setToast("⚠️ Fetch error.");
        } finally {
            setIsFetchingHistory(false);
        }
    };

    const formatYMD = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const runBulkFetch = async () => {
        if (!selectedInstrument) return setToast("❌ Select stock first!");
        if (!years) return setToast("⚠️ Select a year range!");

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
                end: formatYMD(end)
            });

            month--;
            if (month < 0) {
                month = 11;
                year--;
            }
        }

        setToast(`⏳ Fetching ${years} year(s)...`);
        setIsFetchingHistory(true);

        for (const r of ranges) {
            console.log("📡 Fetch:", r.start, "→", r.end);

            const payload = {
                symbol: sym,
                instrument_key: key,
                start_date: r.start,
                end_date: r.end
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
                body: JSON.stringify(payload)
            });

            const result = await res.json();

            if (!res.ok) {
                setToast(`⚠️ Error (${r.start}→${r.end}): ${result.error}`);
                break;
            }

            setToast(`📦 Stored (${r.start} → ${r.end})`);
            await new Promise(r => setTimeout(r, 300));
        }

        setIsFetchingHistory(false);
        setToast(`🎉 Done fetching ${years} year(s).`);
    };


    // ----------------------------------------------
    // Download Excel Function
    // ----------------------------------------------
    const downloadExcel = async () => {
        if (!selectedSymbol || !startDate || !endDate) {
            return setToast("⚠️ Select symbol, start date, and end date.");
        }

        if (!selectedInstrument) {
            return setToast("❌ Select the stock from search list first.");
        }

        const key = selectedInstrument.instrument_key;

        if (!key) {
            return setToast("❌ No instrument_key found. Please refresh instruments.");
        }

        const sym = selectedSymbol.trim().toUpperCase();
        const s = normalizeDate(startDate);
        const e = normalizeDate(endDate);

        // ⭐ IMPORTANT FIX → use instrument_key not plain symbol
        const url = `http://localhost:5000/api/history/daily?instrument_key=${encodeURIComponent(
            key
        )}&symbol=${encodeURIComponent(sym)}&start=${s}&end=${e}&_=${Date.now()}`;

        try {
            const res = await fetch(url);

            const type = res.headers.get("content-type") || "";

            if (type.includes("application/json")) {
                const err = await res.json().catch(() => ({}));
                return setToast(`⚠️ ${err.error || "Server error"}`);
            }

            const blob = await res.blob();
            const fileURL = window.URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = fileURL;
            a.download = `${sym}_${s}_to_${e}_Daily.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            setToast("✅ Excel downloaded!");
        } catch {
            setToast("⚠️ Failed to download.");
        }
    };

    // -------------- Loading skeleton --------------
    if (isLoading) {
        return (
            <div
                className={
                    isLight
                        ? "min-h-screen bg-gray-50 text-gray-900"
                        : "min-h-screen bg-[#020617] text-gray-100"
                }
            >
                <SkeletonLoader />
            </div>
        );
    }

    const selectedLtp = selectedInstrument
        ? getLtpForInstrument(selectedInstrument)
        : "--";

    const today = new Date();

    // -------------- UI --------------
    return (
        <div
            className={
                isLight
                    ? "min-h-screen bg-gray-50 text-gray-900"
                    : "min-h-screen bg-[#020617] text-gray-100"
            }
        >
            {/* Toast */}
            {toast && (
                <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-md shadow-lg bg-slate-900 text-xs text-white">
                    {toast}
                </div>
            )}

            <div className="max-w-7xl mx-auto px-4 pb-10 space-y-6">
                {/* ===== Top search row ===== */}
                <div className="pt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Search Stock Section */}
                    <div className="flex-1 max-w-2xl">
                        <div className="text-[11px] font-medium uppercase text-gray-400 mb-1">
                            Search stock
                        </div>

                        {/* Wrapper (Fixed Layout - NOT absolute) */}
                        <div className="space-y-2">
                            {/* Search Input */}
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
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
                                    className={`w-full pl-9 pr-3 py-2.5 text-sm rounded-full border outline-none shadow-sm transition ${isLight
                                        ? "bg-white border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                        : "bg-slate-900 border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-900"
                                        }`}
                                />
                            </div>

                            {/* Expanded Dropdown */}
                            {showResults && debouncedSearch && (
                                <ul
                                    className={`w-full border rounded-xl text-xs max-h-72 overflow-y-auto shadow-lg ${isLight
                                        ? "bg-white border-gray-200 divide-y divide-gray-100"
                                        : "bg-slate-900 border-slate-700 divide-y divide-slate-800"
                                        }`}
                                >
                                    {filtered.length === 0 ? (
                                        <li className="px-3 py-3 text-gray-500 italic">
                                            No instruments found.
                                        </li>
                                    ) : (
                                        filtered.slice(0, 80).map((inst) => {
                                            const sym = (inst.symbol || "")
                                                .toUpperCase()
                                                .trim();
                                            const ltp = getLtpForInstrument(inst);
                                            const inWatch = watchlist.some(
                                                (w) => w.symbol === sym
                                            );

                                            return (
                                                <li
                                                    key={`${sym}-${inst.instrument_key}`}
                                                    className={`px-3 py-2 flex items-center justify-between cursor-pointer transition ${isLight
                                                        ? "hover:bg-gray-50"
                                                        : "hover:bg-slate-800/60"
                                                        }`}
                                                    onClick={() => {
                                                        const exchange =
                                                            inst.exchange?.toUpperCase() ||
                                                            "";

                                                        setSelectedSymbol(sym);

                                                        const enrichedInst = {
                                                            ...inst,
                                                            symbol: sym,
                                                            exchange,
                                                        };

                                                        setSelectedInstrument(
                                                            enrichedInst
                                                        );

                                                        setSelectedInstruments(
                                                            (prev) => {
                                                                const exists =
                                                                    prev.some(
                                                                        (p) =>
                                                                            p.symbol ===
                                                                            sym &&
                                                                            p.exchange ===
                                                                            exchange
                                                                    );
                                                                if (exists) return prev;
                                                                return [
                                                                    ...prev,
                                                                    enrichedInst,
                                                                ];
                                                            }
                                                        );

                                                        setShowResults(false);
                                                    }}
                                                >
                                                    <div>
                                                        <div className="font-semibold text-[12px]">
                                                            {sym}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500">
                                                            {inst.name}
                                                        </div>
                                                        <div className="text-[10px] text-gray-400">
                                                            {inst.segment}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[11px] font-semibold">
                                                            ₹{" "}
                                                            {typeof ltp ===
                                                                "number"
                                                                ? ltp.toLocaleString(
                                                                    "en-IN"
                                                                )
                                                                : "--"}
                                                        </span>

                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleWatchlist(inst);
                                                            }}
                                                            className={`text-[11px] px-2 py-0.5 rounded-full border ${inWatch
                                                                ? "bg-amber-400 text-black border-amber-400"
                                                                : isLight
                                                                    ? "border-gray-300 text-gray-500"
                                                                    : "border-slate-600 text-gray-300"
                                                                }`}
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

                    {/* WS + Market summary pill */}
                    <div className="flex items-center gap-4">
                        <div
                            className={
                                "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 " +
                                (isConnected
                                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                                    : "bg-red-500/10 text-red-300 border border-red-500/40")
                            }
                        >
                            <span
                                className={
                                    "h-2 w-2 rounded-full " +
                                    (isConnected
                                        ? "bg-emerald-400"
                                        : "bg-red-400")
                                }
                            ></span>
                            {isConnected ? "WS Connected" : "WS Disconnected"}
                        </div>

                        <div className="text-right text-[11px] text-gray-400">
                            <div className="font-medium">
                                {marketSummary?.title ?? "Market summary"}
                            </div>
                            <div>
                                {asOf
                                    ? `Updated ${new Date(
                                        asOf
                                    ).toLocaleTimeString()}`
                                    : ""}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ===== Index strip ===== */}
                <div
                    className={
                        "rounded-2xl border px-4 py-3 flex items-center gap-3 overflow-x-auto hide-scrollbar " +
                        (isLight ? "bg-white border-gray-200" : "bg-slate-900 border-slate-700")
                    }
                >
                    {INDEX_LIST.map((idx) => {

                        // 🔥 1) Live WebSocket feed (from `prices`)
                        // Normalize symbol to match saved WebSocket keys
                        const sym = idx.symbol.toUpperCase().replace(/ /g, "");

                        // 1) Live tick from WebSocket
                        const live = prices[sym] || null;

                        // 2) Fallback from processed indexData
                        const d = indexData[sym] || null;

                        // Final source: prefer live values
                        const source = live || d;

                        const ltp = source?.ltp ?? "--";
                        const change = source?.change ?? 0;
                        const pct = source?.percent ?? 0;
                        const up = change >= 0;

                        return (
                            <div
                                key={idx.name}
                                className={
                                    "min-w-[150px] rounded-xl px-3 py-2 flex items-center justify-between text-xs border " +
                                    (isLight
                                        ? "bg-gray-50 border-gray-200"
                                        : "bg-slate-800/60 border-slate-700")
                                }
                            >
                                <div>
                                    <div className="font-semibold text-[12px]">{idx.display}</div>
                                    <div className="text-[10px] text-gray-400">{idx.name}</div>
                                </div>

                                <div className="text-right">
                                    <div className="text-[13px] font-semibold">
                                        {typeof ltp === "number"
                                            ? ltp.toLocaleString("en-IN", {
                                                minimumFractionDigits: 2
                                            })
                                            : ltp}
                                    </div>

                                    <div className="flex items-center justify-end gap-1 mt-0.5">
                                        <span
                                            className={`text-[10px] font-semibold ${up ? "text-emerald-500" : "text-red-400"
                                                }`}
                                        >
                                            {up ? "▲" : "▼"} {change.toFixed(2)}
                                        </span>
                                        <ChangeBadge pct={pct || 0} up={up} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>


                {/* === MAIN AREA: Selected instruments & Data tools === */}
                <div className="grid grid-cols-1 gap-6">
                    {/* 📌 Selected Instruments + Excel + Intraday Fetch + Bulk */}
                    <section
                        className={
                            "rounded-2xl border shadow-sm p-5 transition-all " +
                            (isLight
                                ? "bg-white border-gray-200"
                                : "bg-slate-900 border-slate-700")
                        }
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold tracking-wide">
                                Selected instruments
                            </h2>
                            <button
                                className="text-[11px] px-2 py-1 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition"
                                onClick={() => {
                                    setSelectedInstruments([]);
                                    setSelectedInstrument(null);
                                    setSelectedSymbol("");
                                }}
                            >
                                Clear
                            </button>
                        </div>

                        {/* Instrument Cards */}
                        {selectedInstruments.length === 0 ? (
                            <p className="text-xs text-gray-500">
                                Search & add instruments...
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {selectedInstruments.map((item) => {
                                    const sym = (item.symbol || "")
                                        .toUpperCase()
                                        .trim();
                                    const key = normalizeKey(item); // instrument_key for subscription

                                    const live = prices[key] || prices[sym] || {};

                                    const ltp = live.ltp;
                                    const change = live.change;
                                    const pct = live.percent;

                                    const trend = priceChange[sym];
                                    const up = trend === "up";
                                    const arrow = trend === "down" ? "▼" : "▲";

                                    const hasPrice =
                                        typeof ltp === "number" &&
                                        !Number.isNaN(ltp);

                                    const displayLtp = hasPrice
                                        ? ltp.toLocaleString("en-IN")
                                        : "--";

                                    const displayChange =
                                        hasPrice &&
                                            typeof change === "number" &&
                                            !Number.isNaN(change)
                                            ? change.toFixed(2)
                                            : "0.00";

                                    const displayPct =
                                        hasPrice &&
                                            typeof pct === "number" &&
                                            !Number.isNaN(pct)
                                            ? pct.toFixed(2)
                                            : "0.00";

                                    const selected = selectedSymbol === sym;
                                    const isRunning = !!activeSubscriptions[key];

                                    return (
                                        <div
                                            key={`${sym}-${item.exchange || item.segment || ""}`}
                                            className={
                                                "flex flex-col justify-between px-4 py-3 rounded-xl cursor-pointer border transition-all duration-300 " +
                                                (selected
                                                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30 shadow"
                                                    : isLight
                                                        ? "border-gray-200 hover:border-blue-300 hover:shadow-md"
                                                        : "border-slate-700 hover:border-blue-500/40 hover:shadow-lg")
                                            }
                                            onClick={() => {
                                                setSelectedSymbol(sym);
                                                setSelectedInstrument(item);
                                            }}
                                        >
                                            {/* Top: Symbol & name */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-bold truncate">
                                                        {sym}
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 truncate">
                                                        {item.name}
                                                    </div>
                                                    {item.exchange && (
                                                        <div className="text-[9px] text-gray-400">
                                                            {item.exchange}
                                                        </div>
                                                    )}
                                                </div>
                                                {/* LTP */}
                                                <div className="text-right">
                                                    <span
                                                        className={
                                                            "text-xs font-bold transition-all duration-300 " +
                                                            (up
                                                                ? "text-emerald-600"
                                                                : "text-red-500")
                                                        }
                                                    >
                                                        {arrow} ₹ {displayLtp}
                                                    </span>
                                                    <div
                                                        className={
                                                            "text-[10px] font-semibold " +
                                                            (up
                                                                ? "text-emerald-600"
                                                                : "text-red-500")
                                                        }
                                                    >
                                                        {up ? "+" : ""}
                                                        {displayChange} (
                                                        {displayPct}%)
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Bottom: Buttons */}
                                            <div className="mt-3 flex items-center justify-between gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        subscribeToStock(item);
                                                    }}
                                                    className={
                                                        "h-7 px-3 text-[11px] rounded-md font-medium border transition-all " +
                                                        (isRunning
                                                            ? "bg-red-600 border-red-600 text-white hover:bg-red-700"
                                                            : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700")
                                                    }
                                                >
                                                    {isRunning
                                                        ? "⏹ Stop"
                                                        : "▶ Start"}
                                                </button>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedInstruments(
                                                            (prev) =>
                                                                prev.filter(
                                                                    (p) =>
                                                                        !(
                                                                            p.symbol ===
                                                                            sym &&
                                                                            (p.exchange ||
                                                                                p.segment) ===
                                                                            (item.exchange ||
                                                                                item.segment)
                                                                        )
                                                                )
                                                        );
                                                    }}
                                                    className={
                                                        "h-7 px-3 text-[11px] rounded-md border transition " +
                                                        (isLight
                                                            ? "border-gray-300 hover:bg-gray-200"
                                                            : "border-slate-600 hover:bg-slate-700")
                                                    }
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* ===== Excel Download Section ===== */}
                        <div
                            className={`w-full mt-8 p-6 rounded-2xl shadow-md transition-all duration-200 ${isLight
                                ? "bg-white border border-gray-200 hover:shadow-lg"
                                : "bg-slate-900 border-slate-700 hover:shadow-xl"
                                }`}
                        >
                            <h3 className="text-sm font-semibold mb-4 text-gray-700 dark:text-gray-300">
                                Download Historical Data
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {/* Symbol Input */}
                                <input
                                    value={selectedSymbol}
                                    onChange={(e) =>
                                        setSelectedSymbol(
                                            e.target.value.toUpperCase()
                                        )
                                    }
                                    placeholder="Enter Symbol (e.g. TCS)"
                                    className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none transition ${isLight
                                        ? "bg-white border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                        : "bg-slate-800 border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-900"
                                        }`}
                                />

                                {/* Start Date */}
                                <DatePicker
                                    selected={startDate}
                                    onChange={setStartDate}
                                    filterDate={(d) =>
                                        d.getDay() !== 0 && d.getDay() !== 6
                                    }
                                    maxDate={new Date()}
                                    showMonthDropdown
                                    showYearDropdown
                                    dropdownMode="select"
                                    dateFormat="dd/MM/yyyy"
                                    placeholderText="Start Date"
                                    portalId="datepicker-root"
                                    popperClassName="z-[999999]"
                                    className={`w-full px-3 py-2 rounded-lg border text-center text-sm transition ${isLight
                                        ? "bg-white border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                        : "bg-slate-800 border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-900"
                                        }`}
                                />

                                <DatePicker
                                    selected={endDate}
                                    onChange={setEndDate}
                                    filterDate={(d) =>
                                        d.getDay() !== 0 && d.getDay() !== 6
                                    }
                                    minDate={startDate || null}
                                    maxDate={new Date()}
                                    showMonthDropdown
                                    showYearDropdown
                                    dropdownMode="select"
                                    dateFormat="dd/MM/yyyy"
                                    placeholderText="End Date"
                                    portalId="datepicker-root"
                                    popperClassName="z-[999999]"
                                    className={`w-full px-3 py-2 rounded-lg border text-center text-sm transition ${isLight
                                        ? "bg-white border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                        : "bg-slate-800 border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-900"
                                        }`}
                                />
                            </div>

                            {/* Download Button */}
                            <div className="mt-5 flex justify-end">
                                <button
                                    type="button"
                                    onClick={downloadExcel}
                                    className="px-6 h-10 rounded-full bg-emerald-600 text-white font-medium text-sm shadow-sm hover:bg-emerald-700 hover:shadow-md transition-all duration-200 active:scale-[0.97]"
                                >
                                    ⬇ Download Excel
                                </button>
                            </div>
                        </div>

                        {/* === Fetch & Store Historical Intraday Candles === */}
                        <div
                            className={
                                "w-full mt-6 p-6 rounded-2xl shadow-md transition-all duration-200 " +
                                (isLight
                                    ? "bg-white border border-gray-200 hover:shadow-lg"
                                    : "bg-slate-900 border border-slate-700 hover:shadow-xl")
                            }
                        >
                            <h3 className="text-sm font-semibold mb-4 text-gray-700 dark:text-gray-300">
                                Fetch Intraday Historical Data (Store to DB)
                            </h3>

                            {/* Timeframe Selector */}
                            <select
                                value={timeframe}
                                onChange={(e) => setTimeframe(e.target.value)}
                                className={
                                    "mb-4 px-3 py-2 rounded-lg border text-sm focus:outline-none transition " +
                                    (isLight
                                        ? "bg-white border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                        : "bg-slate-800 border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-900")
                                }
                            >
                                <option value="">Select timeframe</option>
                                {timeframes.map((tf) => (
                                    <option key={tf.value} value={tf.value}>{tf.label}</option>
                                ))}
                            </select>

                            {/* Year Based Fetch */}
                            <div className="mt-2 p-4 rounded-2xl border border-dashed">
                                <h3 className="text-xs font-semibold mb-3 text-gray-600 dark:text-gray-300">
                                    📦 Bulk Fetch Full History (Upstox)
                                </h3>

                                <select
                                    value={years}
                                    onChange={(e) => setYears(e.target.value)}
                                    className={
                                        "w-full px-3 py-2 border rounded-lg mb-3 text-sm " +
                                        (isLight ? "bg-white border-gray-300" : "bg-slate-800 border-slate-700")
                                    }
                                >
                                    <option value="">Select Years</option>
                                    <option value="1">1 Year</option>
                                    <option value="2">2 Years</option>
                                    <option value="3">3 Years</option>
                                    <option value="5">5 Years</option>
                                </select>
                            </div>

                            {/* Manual Historical Range */}
                            <div className="mt-4">
                                <h3 className="text-xs font-semibold mb-2 text-gray-600 dark:text-gray-300">
                                    🗂 Fetch by Date Range (Manual)
                                </h3>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                    <DatePicker
                                        selected={histStart}
                                        onChange={setHistStart}
                                        dateFormat="dd/MM/yyyy"
                                        placeholderText="Start Date"
                                        className={"px-3 py-2 rounded-lg border text-center text-sm " + (isLight ? "bg-white border-gray-300" : "bg-slate-800 border-slate-700")}
                                    />

                                    <DatePicker
                                        selected={histEnd}
                                        onChange={setHistEnd}
                                        dateFormat="dd/MM/yyyy"
                                        placeholderText="End Date"
                                        className={"px-3 py-2 rounded-lg border text-center text-sm " + (isLight ? "bg-white border-gray-300" : "bg-slate-800 border-slate-700")}
                                    />
                                </div>
                            </div>

                            {/* ==== FINAL BUTTON ROW ==== */}
                            <div className="mt-6 flex flex-wrap justify-end gap-3">

                                {/* Bulk Fetch Full Data */}
                                <button
                                    type="button"
                                    onClick={runBulkFetch}
                                    disabled={!selectedSymbol || !timeframe || !years}
                                    className={
                                        "px-6 py-3 rounded-full font-semibold text-sm shadow transition " +
                                        (!selectedSymbol || !timeframe || !years
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : "bg-blue-600 hover:bg-blue-700 text-white")
                                    }
                                >
                                    📦 Fetch Full Data {years && `(${years}Y)`}
                                </button>

                                {/* Generate Indicators */}
                                <button
                                    type="button"
                                    onClick={applyIndicators}
                                    disabled={!selectedSymbol || !timeframe || isApplyingIndicators}
                                    className={
                                        "px-6 py-3 rounded-full font-semibold text-sm shadow transition " +
                                        ((!selectedSymbol || !timeframe || isApplyingIndicators)
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : "bg-green-600 hover:bg-green-700 text-white")
                                    }
                                >
                                    {isApplyingIndicators ? "⏳ Processing..." : "📈 Generate Indicators"}
                                </button>


                                {/* Manual Fetch */}
                                <button
                                    type="button"
                                    onClick={fetchHistoricalCandles}
                                    disabled={!selectedSymbol || !timeframe || !histStart || !histEnd}
                                    className={
                                        "px-6 py-3 rounded-full font-semibold text-sm shadow transition " +
                                        (!selectedSymbol || !timeframe || !histStart || !histEnd
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : "bg-purple-600 hover:bg-purple-700 text-white")
                                    }
                                >
                                    🗂 Fetch Historical
                                </button>


                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
