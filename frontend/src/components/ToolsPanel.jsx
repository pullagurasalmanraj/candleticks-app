import React from "react";
import DatePicker from "react-datepicker";
import { startOfDay } from "../utils/dateUtils";

export default function ToolsPanel({
    isLight,

    selectedSymbol,
    setSelectedSymbol,

    startDate,
    endDate,
    setStartDate,
    setEndDate,

    histStart,
    histEnd,
    setHistStart,
    setHistEnd,

    timeframe,
    setTimeframe,
    timeframes,

    years,
    setYears,

    isApplyingIndicators,

    runBulkFetch,
    applyIndicators,
    fetchHistoricalCandles,
    downloadExcel
}) {

    return (

        <section className="xl:col-span-1 space-y-4">

            <div className="w-full max-w-sm space-y-4">

                {/* ================= DOWNLOAD DAILY ================= */}

                <div
                    className={[
                        "rounded-xl border p-4 shadow-sm",

                        isLight
                            ? "bg-white border-slate-200"
                            : "bg-slate-900 border-slate-800"

                    ].join(" ")}
                >

                    <h3 className="text-sm font-semibold mb-3">
                        Download historical (daily)
                    </h3>

                    <div className="space-y-2">

                        {/* Symbol */}

                        <input
                            value={selectedSymbol}
                            onChange={(e) => setSelectedSymbol(e.target.value.toUpperCase())}
                            placeholder="Symbol (e.g. TCS)"
                            className={[
                                "w-full h-9 rounded-md border px-3 text-sm outline-none box-border",

                                isLight
                                    ? "bg-white border-slate-300 focus:border-blue-500"
                                    : "bg-slate-800 border-slate-700 focus:border-blue-500"

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
                                            : "bg-slate-800 border-slate-700"

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
                                            : "bg-slate-800 border-slate-700"

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
                            : "bg-slate-900 border-slate-800"

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
                                        : "bg-slate-800 border-slate-700"

                                ].join(" ")}
                            >

                                <option value="">Select timeframe</option>

                                {timeframes.map(tf => (
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
                                        : "bg-slate-800 border-slate-700"

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
                                                : "bg-slate-800 border-slate-700"

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
                                                : "bg-slate-800 border-slate-700"

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
                                        : "bg-blue-600 text-white hover:bg-blue-700"

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
                                        : "bg-emerald-600 text-white hover:bg-emerald-700"

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
                                        : "bg-purple-600 text-white hover:bg-purple-700"

                                ].join(" ")}
                            >

                                Fetch historical (store to DB)

                            </button>

                        </div>

                    </div>

                </div>

            </div>

        </section>

    )

}