import React from "react";

export default function MarketSummary({ marketSummary, asOf }) {
    return (
        <div className="text-right text-[11px] text-slate-400">
            <div className="font-medium">
                {marketSummary?.title ?? "Market summary"}
            </div>

            <div>
                {asOf ? `Updated ${new Date(asOf).toLocaleTimeString()}` : ""}
            </div>
        </div>
    );
}