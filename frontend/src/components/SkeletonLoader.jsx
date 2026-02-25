// src/components/SkeletonLoader.jsx
import React from "react";
import { motion } from "framer-motion";

export default function SkeletonLoader() {
    const shimmer =
        "animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl";

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

            {/* 🔍 Search Bar + WS Status */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                <div className="w-full max-w-lg h-10 rounded-full bg-gray-300 dark:bg-gray-700 animate-pulse"></div>

                <div className="w-36 h-8 rounded-full bg-gray-300 dark:bg-gray-700 animate-pulse"></div>
            </div>

            {/* 📊 Index Strip */}
            <div className="flex gap-4 overflow-x-auto">
                {[...Array(4)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="w-40 h-14 rounded-xl bg-gray-300 dark:bg-gray-800 animate-pulse"
                    />
                ))}
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* 📌 Selected Instruments */}
                <div className="lg:col-span-2 space-y-5">

                    {/* Section title */}
                    <div className="w-40 h-5 bg-gray-300 dark:bg-gray-700 animate-pulse rounded"></div>

                    {/* Instrument cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[...Array(4)].map((_, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.07 }}
                                className="h-20 bg-gray-300 dark:bg-gray-700 rounded-xl animate-pulse"
                            ></motion.div>
                        ))}
                    </div>

                    {/* Excel Section */}
                    <div className="w-full h-28 bg-gray-300 dark:bg-gray-700 rounded-2xl animate-pulse"></div>
                </div>

                {/* ⭐ Watchlist */}
                <div className="space-y-3">
                    <div className="w-32 h-5 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>

                    {[...Array(5)].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="h-14 bg-gray-300 dark:bg-gray-700 rounded-xl animate-pulse"
                        />
                    ))}
                </div>

            </div>
        </div>
    );
}
