import React from "react";
import InstrumentCard from "./InstrumentCard";

export default function SelectedInstruments({

    selectedInstruments,
    prices,
    selectedSymbol,
    activeSubscriptions,
    isLight,
    normalizeKey,
    setSelectedSymbol,
    setSelectedInstrument,
    setSelectedInstruments,
    subscribeToStock

}) {

    return (

        <section
            className={[
                "xl:col-span-2 rounded-2xl border shadow-sm p-5",

                isLight
                    ? "bg-white border-slate-200"
                    : "bg-slate-900 border-slate-800"

            ].join(" ")}
        >

            {selectedInstruments.length === 0 ? (

                <p className="text-xs text-slate-500">
                    Use the search above to add instruments to your working list.
                </p>

            ) : (

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                    {selectedInstruments.map(item => (

                        <InstrumentCard
                            key={item.instrument_key}
                            item={item}
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

                    ))}

                </div>

            )}

        </section>

    )

}