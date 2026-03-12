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
import useInstrumentSearch from "../hooks/useInstrumentSearch";
import useWebSocketPrices from "../hooks/useWebSocketPrices";
import { fetchTimeframes } from "../services/timeframeService";
import {
    fetchHistoricalCandlesAPI,
    storeCandlesAPI
} from "../services/candleService";
import {
    subscribeSymbol,
    unsubscribeInstrument
} from "../services/subscriptionService";

import { generateIndicators } from "../services/indicatorService";
import { generateMonthlyRanges } from "../utils/dateUtils";
import { downloadExcelAPI } from "../services/exportService";






export default function Dashboard() {
    const { theme } = useTheme();
    const isLight = theme === "light";



    // ---------- State ----------
    const [selectedInstruments, setSelectedInstruments] = useState([]);

    const [isApplyingIndicators, setIsApplyingIndicators] = useState(false);
    const [watchlist, setWatchlist] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState("");
    const [selectedInstrument, setSelectedInstrument] = useState(null);


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



    const [indexData, setIndexData] = useState({});
    const [marketSummary, setMarketSummary] = useState(null);
    const [asOf, setAsOf] = useState(null);
    const [toast, setToast] = useState(null);


    const {
        search,
        setSearch,
        debouncedSearch,
        instruments,
        showResults,
        setShowResults
    } = useInstrumentSearch();








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

    const {
        prices,
        isConnected,
        isLoading
    } = useWebSocketPrices(instrumentByKey)




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

        let mounted = true;

        async function loadTimeframes() {
            try {
                const data = await fetchTimeframes();

                if (mounted) {
                    setTimeframes(data);
                }

            } catch (err) {
                console.error("Failed to load timeframes:", err);

                if (mounted) {
                    setTimeframes([]);
                }
            }
        }

        loadTimeframes();

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
                await subscribeSymbol(sym);


                setActiveSubscriptions((prev) => ({ ...prev, [key]: true }));
                setSelectedSymbol(sym);
                setSelectedInstrument(inst);
                setToast(`Subscribed: ${sym}`);
            } else {
                await unsubscribeInstrument(key);


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

        try {

            setToast("Generating indicators...");

            const data = await generateIndicators(selectedSymbol, timeframe);

            setToast(
                `Saved ${data.count || data.rows || 0} rows for ${selectedSymbol}`
            );

        } catch (err) {

            console.error(err);
            setToast(err.message || "Error applying indicators");

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

        setIsFetchingHistory(true);

        try {

            const result = await fetchHistoricalCandlesAPI({
                symbol: selectedSymbol,
                instrument_key: selectedInstrument.instrument_key,
                timeframe,
                histStart,
                histEnd
            });

            setToast(`Stored ${result.inserted} candles`);

        } catch (err) {

            console.error(err);
            setToast(err.message);

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

        let today = new Date();
        let year = today.getFullYear();
        let month = today.getMonth();

        setToast(`Fetching ${years} year(s)...`);
        setIsFetchingHistory(true);

        try {

            for (let i = 0; i < months; i++) {

                const start = new Date(year, month, 1);
                const end = new Date(year, month + 1, 0);

                await fetchHistoricalCandlesAPI({
                    symbol: sym,
                    instrument_key: key,
                    timeframe,
                    histStart: start,
                    histEnd: end
                });

                setToast(`Stored ${formatYMD(start)} → ${formatYMD(end)}`);

                month--;

                if (month < 0) {
                    month = 11;
                    year--;
                }

                await new Promise(r => setTimeout(r, 300));

            }

            setToast(`Done fetching ${years} year(s).`);

        } catch (err) {

            console.error(err);
            setToast(err.message);

        } finally {

            setIsFetchingHistory(false);

        }
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

        try {

            const blob = await downloadExcelAPI({
                instrument_key: key,
                symbol: sym,
                startDate,
                endDate
            });

            const url = window.URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = `${sym}_data.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            setToast("Excel downloaded.");

        } catch (err) {

            setToast(err.message || "Failed to download.");

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
        ? getLtpForInstrument(selectedInstrument, prices)
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