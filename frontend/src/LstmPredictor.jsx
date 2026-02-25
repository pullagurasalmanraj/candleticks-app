import React, { useState, useEffect, useMemo } from "react";

import { Loader2, BarChart3, Wand2, Sparkles } from "lucide-react";
import { useTheme } from "../context/ThemeContext";


export default function MLTrainingPage() {
    const { theme } = useTheme();
    const isLight = theme === "light";

    const [symbol, setSymbol] = useState("");
    const [filtered, setFiltered] = useState([]);
    const [timeframe, setTimeframe] = useState("5m");
    const [task] = useState("classification");
    const [trainSplit] = useState(0.8);


    const [loading, setLoading] = useState(false);

    const [outcomeLoading, setOutcomeLoading] = useState(false);
    const [outcomeResult, setOutcomeResult] = useState(null);

    // 🔴 LIVE ENGINE STATE (BACKEND DRIVEN)
    const [liveMode, setLiveMode] = useState(false);
    const [predictLoading, setPredictLoading] = useState(false);
    const [engineStatus, setEngineStatus] = useState("IDLE");
    const [tradeState, setTradeState] = useState(null);

    const [convertLoading, setConvertLoading] = useState(false);
    const [convertMessage, setConvertMessage] = useState("");

    const [labelLoading, setLabelLoading] = useState(false);
    const [labelResult, setLabelResult] = useState(null);
    const [lookahead, setLookahead] = useState(20);
    const [windowSize, setWindowSize] = useState(30);

    const [ruleStats, setRuleStats] = useState(null);
    const [ruleStatsLoading, setRuleStatsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [trainResults, setTrainResults] = useState(null);

    const [search, setSearch] = useState("");
    const [searching, setSearching] = useState(false);



    useEffect(() => {
        if (!search || search.length < 2) {
            setSearchResults([]);
            return;
        }

        const controller = new AbortController();
        const t = setTimeout(async () => {
            try {
                setSearching(true);
                const res = await fetch(
                    `/api/instruments?q=${encodeURIComponent(search)}`,
                    { signal: controller.signal }
                );
                const data = await res.json();
                setSearchResults(
                    Array.isArray(data.instruments) ? data.instruments : []
                );
            } catch (e) {
                if (e.name !== "AbortError") {
                    console.error(e);
                    setSearchResults([]);
                }
            } finally {
                setSearching(false);
            }
        }, 200);

        return () => {
            controller.abort();
            clearTimeout(t);
        };
    }, [search]);




    const handleSearch = (value) => {
        const v = value.toUpperCase();
        setSymbol(v);
        setSearch(v);
    };


    // --------------------------------------------------
    // Train Model
    // --------------------------------------------------
    const handleTrain = async () => {
        if (!symbol) return alert("Select stock");

        setLoading(true);
        setTrainResults(null);

        try {
            const res = await fetch("/api/train-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol, timeframe, task, trainSplit })
            });

            const data = await res.json();
            setTrainResults(data);
        } catch (e) {
            setTrainResults({ error: e.message });
        } finally {
            setLoading(false);
        }
    };


    // --------------------------------------------------
    // Live Trading Engine (POLLING)
    // --------------------------------------------------
    useEffect(() => {
        if (!liveMode || !symbol) return;

        const interval = setInterval(async () => {
            setPredictLoading(true);

            try {
                const res = await fetch("/api/predict-live", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        symbol,
                        timeframe: timeframe.toLowerCase()
                    })
                });

                const data = await res.json();
                setEngineStatus(data.status);

                switch (data.status) {
                    case "WAIT":
                        setTradeState(null);
                        break;

                    case "MARKET_CLOSED":
                        setTradeState(null);
                        setLiveMode(false);
                        break;

                    case "WAITING":
                        setTradeState({
                            confidence: data.confidence,
                            price: data.price,
                            time: data.time
                        });
                        break;

                    case "ORDER_PLACED":
                        setTradeState({
                            position: data.position,
                            entry: data.entry,
                            sl: data.stoploss,
                            target: data.target,
                            confidence: data.confidence,
                            time: data.time
                        });
                        break;

                    case "MODIFY":
                        setTradeState(prev => ({
                            ...prev,
                            sl: data.new_sl,
                            price: data.price,
                            time: data.time
                        }));
                        break;

                    case "HOLDING":
                        setTradeState(prev => ({
                            ...prev,
                            price: data.price,
                            sl: data.sl,
                            target: data.target,
                            position: data.position,
                            time: data.time
                        }));
                        break;

                    case "EXIT":
                        setTradeState({
                            exitPrice: data.exit_price,
                            event: data.event,
                            time: data.time
                        });
                        break;

                    default:
                        console.warn("Unknown status:", data);
                }
            } catch (e) {
                console.error("Live engine error:", e);
            }

            setPredictLoading(false);
        }, 3000);

        return () => clearInterval(interval);
    }, [liveMode, symbol, timeframe]);

    // --------------------------------------------------
    // Convert Ticks → Candles
    // --------------------------------------------------
    const handleConvertTicks = async () => {
        if (!symbol) return alert("Select stock");

        setConvertLoading(true);
        setConvertMessage("");

        try {
            const mapRes = await fetch(`/api/symbol-feedkey?symbol=${symbol}`);
            const mapData = await mapRes.json();

            const res = await fetch("/api/start-live-conversion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    symbol,
                    feed_key: mapData.feed_key
                })
            });

            const json = await res.json();

            if (json.status === "STARTED") {
                setConvertMessage(`✅ Live conversion started\nSymbol: ${symbol}`);
            } else if (json.status === "ALREADY_RUNNING") {
                setConvertMessage(`ℹ️ Conversion already running for ${symbol}`);
            } else {
                setConvertMessage(JSON.stringify(json, null, 2));
            }
        } catch (e) {
            setConvertMessage("❌ Error:\n" + e.message);
        }

        setConvertLoading(false);
    };

    const handleOfflineLabeling = async () => {
        if (!symbol) return alert("Select stock first");

        setLabelLoading(true);
        setLabelResult(null);

        try {
            const res = await fetch("/api/offline/label-market-context", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    symbol,
                    timeframe,
                    windowSize
                })

            });

            const data = await res.json();
            setLabelResult(data);

            // OPTIONAL: after labeling, fetch latest rule stats
            // fetchRuleStats();

        } catch (e) {
            setLabelResult({ error: e.message });
        }

        setLabelLoading(false);
    };



    const handleOfflineSuccess = async () => {
        console.log("👉 handleOfflineSuccess CLICKED");

        if (!symbol) {
            alert("Select stock first");
            return;
        }

        setOutcomeLoading(true);
        setOutcomeResult({
            status: "RUNNING",
            message: "Computing strategy outcomes… this may take a few minutes"
        });

        try {
            const res = await fetch("/api/offline/calc-strategy-outcomes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    symbol,
                    timeframe,
                    lookahead
                })
            });

            let data;
            try {
                data = await res.json();
            } catch {
                throw new Error("Server did not return JSON");
            }

            if (!res.ok) {
                setOutcomeResult({
                    error: data.error || "Computation failed",
                    details: data
                });
                return;
            }

            setOutcomeResult(data);

        } catch (e) {
            console.error(e);
            setOutcomeResult({
                error: "Request failed",
                message: e.message
            });
        } finally {
            setOutcomeLoading(false);
        }
    };



    const fetchRuleStats = async () => {
        if (!symbol) return;

        setRuleStatsLoading(true);

        try {
            const res = await fetch(
                `/api/market-context/rule-stats?symbol=${symbol}&timeframe=${timeframe}`
            );

            if (!res.ok) {
                throw new Error(`Rule stats failed: ${res.status}`);
            }

            const data = await res.json();
            setRuleStats(data);
        } catch (e) {
            console.error("Rule stats error:", e);
            setRuleStats(null);
        } finally {
            setRuleStatsLoading(false);
        }
    };



    return (
        <div className={`min-h-screen p-6 flex justify-center ${isLight ? "bg-gray-100" : "bg-[#0b0f19]"}`}>
            <div className={`w-full max-w-4xl rounded-2xl p-8 shadow-xl ${isLight ? "bg-white" : "bg-gray-900 border border-gray-700"}`}>

                <div className="flex items-center gap-3 mb-6">
                    <BarChart3 size={32} className="text-blue-500" />
                    <h1 className="text-2xl font-bold">AI Trading Model Trainer</h1>
                </div>

                <input
                    value={symbol}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search stock..."
                    className="w-full p-3 border rounded-lg text-sm"
                />
                {searchResults.length > 0 && (
                    <ul className="border rounded-lg bg-white text-black mt-1 max-h-60 overflow-y-auto">
                        {searchResults.map(inst => (
                            <li
                                key={inst.instrument_key}
                                className="p-2 hover:bg-blue-100 cursor-pointer"
                                onClick={() => {
                                    setSymbol(inst.symbol.toUpperCase());
                                    setSearchResults([]);
                                }}
                            >
                                <div className="font-semibold text-sm">
                                    {inst.symbol}
                                </div>
                                <div className="text-xs text-gray-600">
                                    {inst.name} · {inst.segment}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}


                <select
                    className="w-full p-3 border rounded-lg text-sm mt-4"
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                >
                    {["1m", "3m", "5m", "15m", "30m", "1D"].map(tf => (
                        <option key={tf}>{tf}</option>
                    ))}
                </select>

                <button
                    onClick={handleTrain}
                    disabled={loading}
                    className="mt-5 w-full p-3 bg-blue-600 text-white rounded-lg flex justify-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" /> : <Wand2 />}
                    Train Model
                </button>

                {/* Tick Conversion */}
                <div className="mt-8 p-4 border rounded-lg bg-gray-800 text-white">
                    <h2 className="text-lg font-semibold mb-3">Convert Today’s Ticks → 1m Candles</h2>
                    <button
                        onClick={handleConvertTicks}
                        disabled={convertLoading}
                        className="w-full p-3 bg-purple-600 text-white rounded-lg"
                    >
                        {convertLoading ? "Converting..." : "Convert Ticks"}
                    </button>
                    {convertMessage && (
                        <div className="mt-3 text-sm bg-gray-900 p-3 rounded-lg whitespace-pre-wrap">
                            {convertMessage}
                        </div>
                    )}
                </div>

                {/* ================= OFFLINE MARKET LABELING ================= */}
                <div className="mt-8 p-4 border rounded-lg bg-gray-900 text-white">
                    <h2 className="text-lg font-semibold mb-2">
                        🔬 Offline Market Context Labeling
                    </h2>

                    <p className="text-sm text-gray-400 mb-4">
                        Label historical candles with market structure and regime.
                        <br />
                        <span className="text-yellow-400">
                            (No future data used)
                        </span>
                    </p>

                    <div className="mb-3">
                        <input
                            type="number"
                            value={windowSize}
                            onChange={(e) => setWindowSize(+e.target.value)}
                            className="p-2 rounded bg-gray-800 border border-gray-700 w-full"
                            placeholder="Context window size"
                        />
                    </div>


                    <button
                        onClick={handleOfflineLabeling}
                        disabled={labelLoading}
                        className="w-full p-3 bg-indigo-600 rounded-lg flex justify-center gap-2"
                    >
                        {labelLoading ? <Loader2 className="animate-spin" /> : "Run Offline Labeling"}
                    </button>

                    {labelResult && (
                        <pre className="mt-4 text-xs bg-black p-3 rounded overflow-x-auto">
                            {JSON.stringify(labelResult, null, 2)}
                        </pre>
                    )}
                </div>


                {/* ================= OFFLINE SUCCESS OUTCOMES ================= */}
                <div className="mt-8 p-4 border rounded-lg bg-gray-900 text-white">
                    <h2 className="text-lg font-semibold mb-2">
                        📈 Offline Success Outcome Evaluation
                    </h2>

                    <p className="text-sm text-gray-400 mb-4">
                        Evaluate how eligible rules performed using future candles.
                        <br />
                        <span className="text-red-400">
                            (Uses future data – offline only)
                        </span>
                    </p>

                    <input
                        type="number"
                        value={lookahead}
                        onChange={(e) => setLookahead(+e.target.value)}
                        className="p-2 rounded bg-gray-800 border border-gray-700 w-full mb-3"
                        placeholder="Lookahead candles"
                    />

                    <button
                        type="button"
                        onClick={handleOfflineSuccess}
                        disabled={outcomeLoading}
                        className={`w-full p-3 rounded-lg flex items-center justify-center gap-2
        ${outcomeLoading ? "bg-emerald-800 cursor-not-allowed" : "bg-emerald-600"}
    `}
                    >
                        {outcomeLoading ? (
                            <>
                                <Loader2 className="animate-spin w-4 h-4" />
                                Computing Outcomes…
                            </>
                        ) : (
                            "Compute Success Outcomes"
                        )}
                    </button>

                    {outcomeResult && (
                        <div className="mt-4 p-3 rounded-lg bg-black text-xs text-gray-200">
                            {outcomeResult.status === "RUNNING" ? (
                                <div className="text-yellow-400">
                                    ⏳ {outcomeResult.message}
                                </div>
                            ) : outcomeResult.error ? (
                                <div className="text-red-400">
                                    ❌ {outcomeResult.error}
                                    {outcomeResult.message && (
                                        <div className="mt-1 text-gray-400">
                                            {outcomeResult.message}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <pre className="whitespace-pre-wrap">
                                    {JSON.stringify(outcomeResult, null, 2)}
                                </pre>
                            )}
                        </div>
                    )}



                </div>

                {/* ================= RULE PERFORMANCE ================= */}
                <div className="mt-8 p-4 border rounded-lg bg-gray-900 text-white">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-lg font-semibold">
                            📊 Rule Performance (Market Context)
                        </h2>

                        <button
                            onClick={fetchRuleStats}
                            className="text-xs px-3 py-1 bg-gray-700 rounded"
                        >
                            Refresh
                        </button>
                    </div>

                    {ruleStatsLoading && (
                        <div className="text-gray-400 text-sm">
                            Loading rule statistics…
                        </div>
                    )}

                    {ruleStats?.as_of && (
                        <div className="text-xs text-gray-400 mb-3">
                            Evaluated as of: {ruleStats.as_of}
                        </div>
                    )}

                    {ruleStats?.rules && ruleStats.rules.map(rule => (
                        <div
                            key={rule.name}
                            className="p-3 mb-2 rounded-lg bg-gray-800 flex justify-between items-center"
                        >
                            <div>
                                <div className="font-medium">{rule.name}</div>

                                <div className="text-xs text-gray-400">
                                    Success: {(rule.success_rate * 100).toFixed(1)}% |
                                    Failure: {(rule.failure_rate * 100).toFixed(1)}%
                                </div>

                                <div className="text-[11px] text-gray-500">
                                    Evaluated at: {rule.evaluated_at}
                                </div>
                            </div>

                            <div
                                className={`px-3 py-1 rounded-full text-xs font-semibold
                ${rule.status === "WORKING"
                                        ? "bg-green-600"
                                        : rule.status === "NOT_WORKING"
                                            ? "bg-red-600"
                                            : "bg-yellow-600"
                                    }`}
                            >
                                {rule.status}
                            </div>
                        </div>
                    ))}

                    {!ruleStatsLoading && !ruleStats && (
                        <div className="text-gray-500 text-sm">
                            No rule diagnostics available yet.
                        </div>
                    )}
                </div>



                {/* ================= LIVE TRADING CONTROLS ================= */}
                <div className="mt-8 border-t border-gray-700 pt-6">
                    <h2 className="text-lg font-semibold mb-2">
                        Live Trading Engine
                    </h2>

                    <button
                        onClick={() => {
                            if (!symbol) {
                                alert("Select stock first");
                                return;
                            }
                            setTradeState(null);
                            setEngineStatus("STARTING");
                            setLiveMode(true);
                        }}
                        disabled={liveMode}
                        className="w-full p-3 bg-emerald-600 text-white rounded-lg flex justify-center gap-2"
                    >
                        <Sparkles />
                        Start Live Trading
                    </button>

                    {liveMode && (
                        <button
                            onClick={() => {
                                setLiveMode(false);
                                setTradeState(null);
                                setEngineStatus("IDLE");
                            }}
                            className="mt-2 w-full p-3 bg-red-600 text-white rounded-lg"
                        >
                            Stop Live Trading
                        </button>
                    )}
                </div>

                {/* ================= LIVE ENGINE STATUS ================= */}
                {(liveMode || engineStatus !== "IDLE") && (
                    <div className="mt-5 p-5 rounded-xl bg-gray-800 text-white space-y-3">
                        <h3 className="text-lg font-semibold">
                            Engine Status: {engineStatus}
                        </h3>

                        {engineStatus === "WAIT" && (
                            <div className="text-gray-400">
                                ⏳ Waiting for enough candle data…
                            </div>
                        )}

                        {engineStatus === "MARKET_CLOSED" && (
                            <div className="text-yellow-400 font-semibold">
                                🚫 Market Closed
                                <div className="text-sm text-gray-300 mt-1">
                                    Live prediction is unavailable
                                </div>
                            </div>
                        )}

                        {engineStatus === "WAITING" && tradeState && (
                            <div className="text-blue-300">
                                No trade signal
                                <div className="text-sm mt-1">
                                    Confidence: {tradeState.confidence}%
                                </div>
                                <div className="text-sm">
                                    Price: ₹{tradeState.price}
                                </div>
                            </div>
                        )}

                        {engineStatus === "ORDER_PLACED" && tradeState && (
                            <div className="text-green-400 font-semibold space-y-1">
                                ✅ {tradeState.position} MARKET ORDER PLACED
                                <div className="text-sm">
                                    Entry: ₹{tradeState.entry}
                                </div>
                                <div className="text-sm text-red-400">
                                    SL: ₹{tradeState.sl}
                                </div>
                                <div className="text-sm text-emerald-400">
                                    Target: ₹{tradeState.target}
                                </div>
                                <div className="text-xs text-gray-400">
                                    Confidence: {tradeState.confidence}%
                                </div>
                            </div>
                        )}

                        {engineStatus === "MODIFY" && tradeState && (
                            <div className="text-orange-400 font-semibold">
                                🔄 Stop Loss Trailed
                                <div className="text-sm">
                                    Price: ₹{tradeState.price}
                                </div>
                                <div className="text-sm">
                                    New SL: ₹{tradeState.sl}
                                </div>
                            </div>
                        )}

                        {engineStatus === "HOLDING" && tradeState && (
                            <div className="text-emerald-300">
                                ▶️ Position Running ({tradeState.position})
                                <div className="text-sm">
                                    Price: ₹{tradeState.price}
                                </div>
                                <div className="text-sm text-red-400">
                                    SL: ₹{tradeState.sl}
                                </div>
                                <div className="text-sm text-green-400">
                                    Target: ₹{tradeState.target}
                                </div>
                            </div>
                        )}

                        {engineStatus === "EXIT" && tradeState && (
                            <div className="text-red-400 font-semibold">
                                ❌ {tradeState.event}
                                <div className="text-sm">
                                    Exit Price: ₹{tradeState.exitPrice}
                                </div>
                            </div>
                        )}
                    </div>
                )}


            </div>
        </div>
    );
}
