import React from "react";

export default function SearchBar({
    search,
    setSearch,
    setDebouncedSearch,
    showResults,
    setShowResults,
    debouncedSearch,
    instruments,
    watchlist,
    toggleWatchlist,
    setSelectedSymbol,
    setSelectedInstrument,
    setSelectedInstruments,
    getLtpForInstrument,
    prices,
    isLight
}) {

    return (

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
                            const val = e.target.value
                            setSearch(val)
                            setShowResults(val.trim().length > 0)

                            if (!val.trim()) setDebouncedSearch("")
                        }}

                        placeholder="Search by symbol or name (e.g. TCS, INFY, RELIANCE)…"

                        className={[
                            "w-full rounded-full border px-9 py-2.5 text-sm outline-none shadow-sm",

                            isLight
                                ? "bg-neutral-50 border-neutral-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                : "bg-slate-900 border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-900"

                        ].join(" ")}

                    />

                </div>

                {showResults && debouncedSearch && (

                    <ul
                        className={[

                            "absolute top-full left-0 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border text-xs shadow-lg z-50",

                            isLight
                                ? "bg-neutral-50 border-neutral-300 divide-y divide-neutral-200"
                                : "bg-slate-900 border-slate-700 divide-slate-800"

                        ].join(" ")}

                    >

                        {instruments.length === 0 ? (

                            <li className="px-3 py-3 text-slate-500 italic">
                                No instruments found.
                            </li>

                        ) : (

                            (instruments || []).slice(0, 80).map((inst) => {

                                const sym = (inst.symbol || "").toUpperCase().trim()

                                const ltp = getLtpForInstrument(inst, prices);

                                const inWatch = watchlist.some((w) => w.symbol === sym)

                                const isOption =
                                    inst.segment === "NSE_FO" &&
                                    ["CE", "PE"].includes(inst.instrument_type)

                                return (

                                    <li

                                        key={`${sym}-${inst.instrument_key}`}

                                        className={[

                                            "px-3 py-2 flex items-center justify-between cursor-pointer",

                                            isLight
                                                ? "hover:bg-neutral-100"
                                                : "hover:bg-slate-800/70"

                                        ].join(" ")}

                                        onClick={() => {

                                            const exchange = inst.exchange?.toUpperCase() || ""

                                            setSelectedSymbol(sym)

                                            const enrichedInst = {
                                                ...inst,
                                                symbol: sym,
                                                exchange
                                            }

                                            setSelectedInstrument(enrichedInst)

                                            setSelectedInstruments((prev) => {

                                                const exists = prev.some(
                                                    (p) => p.symbol === sym && p.exchange === exchange
                                                )

                                                if (exists) return prev

                                                return [...prev, enrichedInst]

                                            })

                                            setShowResults(false)

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
                                                        year: "2-digit"
                                                    })}

                                                </div>

                                            )}

                                            <div className="text-[10px] text-slate-400">

                                                {inst.segment}

                                            </div>

                                        </div>

                                        <div className="flex items-center gap-3">

                                            <span className="text-[11px] font-semibold">

                                                ₹ {typeof ltp === "number"
                                                    ? ltp.toLocaleString("en-IN")
                                                    : "--"}

                                            </span>

                                            <button

                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    toggleWatchlist(inst)
                                                }}

                                                className={[

                                                    "text-[11px] px-2 py-0.5 rounded-full border",

                                                    inWatch
                                                        ? "bg-amber-400 text-black border-amber-400"
                                                        : isLight
                                                            ? "border-slate-300 text-slate-500"
                                                            : "border-slate-600 text-slate-300"

                                                ].join(" ")}

                                            >

                                                {inWatch ? "★" : "☆"}

                                            </button>

                                        </div>

                                    </li>

                                )

                            })

                        )}

                    </ul>

                )}

            </div>

        </div>

    )

}