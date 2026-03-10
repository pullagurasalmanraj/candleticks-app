import React from "react";
import ChangeBadge from "./ChangeBadge";
import { INDEX_LIST } from "../context/indexes";

export default function IndexStrip({ prices, indexData, isLight }) {

    return (

        <section
            className={[
                "rounded-2xl border px-4 py-3 flex items-center gap-3 overflow-x-auto",

                isLight
                    ? "bg-white border-slate-200"
                    : "bg-slate-900 border-slate-800"

            ].join(" ")}
        >

            {INDEX_LIST.map((idx) => {

                const sym = idx.symbol.toUpperCase().replace(/ /g, "")

                const live = prices?.[sym] || null
                const d = indexData?.[sym] || null

                const source = live || d

                const ltp = source?.ltp ?? "--"
                const change = source?.change ?? 0
                const pct = source?.percent ?? 0

                const up = change >= 0

                return (

                    <div

                        key={idx.name}

                        className={[
                            "min-w-[160px] rounded-xl px-3 py-2 flex items-center justify-between text-xs border",

                            isLight
                                ? "bg-slate-50 border-slate-200"
                                : "bg-slate-900 border-slate-700"

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
                                    ? ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })
                                    : ltp}

                            </div>

                            <div className="flex items-center justify-end gap-1 mt-0.5">

                                <span
                                    className={[
                                        "text-[10px] font-semibold",
                                        up ? "text-emerald-500" : "text-red-400"
                                    ].join(" ")}
                                >

                                    {up ? "▲" : "▼"} {change.toFixed(2)}

                                </span>

                                <ChangeBadge pct={pct || 0} up={up} />

                            </div>

                        </div>

                    </div>

                )

            })}

        </section>

    )

}