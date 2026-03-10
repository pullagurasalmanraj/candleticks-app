import React from "react";

export default function InstrumentCard({
  item,
  prices,
  selectedSymbol,
  activeSubscriptions,
  isLight,
  normalizeKey,
  setSelectedSymbol,
  setSelectedInstrument,
  subscribeToStock,
  setSelectedInstruments
}) {

  const sym = (item.symbol || "").toUpperCase().trim()
  const key = normalizeKey(item)

  const live = prices?.[key] || {}

  const ltp = live.ltp
  const change = live.change
  const pct = live.percent

  const hasPrice = typeof ltp === "number"
  const isUp = hasPrice && change >= 0

  const arrow = !hasPrice ? "•" : isUp ? "▲" : "▼"

  const priceColor =
    !hasPrice
      ? "text-slate-400"
      : isUp
        ? "text-emerald-500"
        : "text-red-500"

  const displayLtp = hasPrice ? ltp.toLocaleString("en-IN") : "--"

  const displayChange = hasPrice ? change.toFixed(2) : "0.00"

  const displayPct = hasPrice ? pct.toFixed(2) : "0.00"

  const isSelected = selectedSymbol === sym
  const isRunning = !!activeSubscriptions[key]

  return (

    <div
      key={`${sym}-${item.exchange || item.segment || ""}`}
      className={[
        "flex flex-col justify-between rounded-xl border px-4 py-3 shadow-sm hover:shadow-md cursor-pointer transition-all",

        isSelected
          ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40"
          : isLight
            ? "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
            : "border-slate-700 hover:border-blue-500/60 hover:bg-slate-900"

      ].join(" ")}
      onClick={() => {
        setSelectedSymbol(sym)
        setSelectedInstrument(item)
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
            e.stopPropagation()
            subscribeToStock(item)
          }}
          className={[
            "h-8 px-3 text-[11px] rounded-md font-medium border",

            isRunning
              ? "bg-red-600 border-red-600 text-white hover:bg-red-700"
              : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"

          ].join(" ")}
        >
          {isRunning ? "Stop stream" : "Start stream"}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()

            setSelectedInstruments(prev =>
              prev.filter(p =>
                !(
                  p.symbol === sym &&
                  (p.exchange || p.segment) ===
                  (item.exchange || item.segment)
                )
              )
            )

          }}
          className={[
            "h-8 px-3 text-[11px] rounded-md border",

            isLight
              ? "border-slate-300 hover:bg-slate-100"
              : "border-slate-700 hover:bg-slate-800"

          ].join(" ")}
        >
          Remove
        </button>

      </div>

    </div>

  )

}