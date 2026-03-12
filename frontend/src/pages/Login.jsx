import React, { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import CandleBackground from "../components/CandleBackground";
import Navbar from "../components/Navbar";

export default function AuthPage() {

    const [tab, setTab] = useState("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const handleLogin = async () => {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error);
            return;
        }

        window.location.href = "/trading-login";
    };

    const handleSignup = async () => {
        const res = await fetch("/api/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error);
            return;
        }

        alert("Account created successfully");
        setTab("login");
    };

    const loginGoogle = () => {
        window.location.href = "/auth/google";
    };

    return (


        <div className="relative w-full min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700">

            <CandleBackground />


            <Navbar />

            <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-64px)]">




                {/* LEFT HERO SECTION */}

                <div className="relative z-10 flex flex-col justify-center px-16 text-white">

                    <h1 className="text-5xl font-bold">
                        Candlesticks
                    </h1>

                    <p className="mt-6 text-lg text-indigo-100 max-w-md">
                        Professional trading analytics platform powered by
                        real-time market data, algorithmic indicators,
                        and AI driven insights.
                    </p>

                    <div className="mt-10 space-y-4 text-indigo-100">

                        <p>📊 Real-time market ticks</p>
                        <p>📈 Advanced indicator engine</p>
                        <p>⚡ Strategy backtesting</p>
                        <p>🤖 AI powered predictions</p>

                    </div>

                </div>

                {/* RIGHT LOGIN PANEL */}

                <div className="relative z-10 flex items-center justify-center px-6">

                    <div className="w-full max-w-md bg-indigo-500/20 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-8">

                        <h2 className="text-2xl font-bold text-center text-white">
                        </h2>

                        {/* Tabs */}

                        <div className="flex bg-indigo-500/20 rounded-lg p-1 mt-6">
                            <button
                                onClick={() => setTab("login")}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition ${tab === "login"
                                    ? "bg-white shadow text-indigo-700"
                                    : "text-indigo-200 hover:text-white"
                                    }`}
                            >
                                Login
                            </button>

                            <button
                                onClick={() => setTab("signup")}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition ${tab === "signup"
                                    ? "bg-white shadow text-indigo-700"
                                    : "text-indigo-200 hover:text-white"
                                    }`}
                            >
                                Signup
                            </button>


                        </div>

                        {/* FORM */}

                        <div className="mt-6 space-y-4">

                            <input
                                type="text"
                                placeholder="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-indigo-500/20 border border-white/30 text-white placeholder-indigo-200 rounded-lg px-4 py-2 outline-none transition-all duration-200 hover:bg-indigo-500/30 focus:bg-indigo-500/30 focus:ring-2 focus:ring-white/40"
                            />

                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-indigo-500/20 border border-white/30 text-white placeholder-indigo-200 rounded-lg px-4 py-2 outline-none transition-all duration-200 hover:bg-indigo-500/30 focus:bg-indigo-500/30 focus:ring-2 focus:ring-white/40"
                            />

                            {tab === "login" && (
                                <button
                                    onClick={handleLogin}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg flex items-center justify-center gap-2"
                                >
                                    <LogIn size={18} />
                                    Login
                                </button>
                            )}

                            {tab === "signup" && (
                                <button
                                    onClick={handleSignup}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg flex items-center justify-center gap-2"
                                >
                                    <UserPlus size={18} />
                                    Create Account
                                </button>
                            )}

                            {/* Divider */}

                            <div className="flex items-center gap-3 my-4">
                                <div className="flex-1 h-px bg-gray-200"></div>
                                <span className="text-xs text-gray-400">OR</span>
                                <div className="flex-1 h-px bg-gray-200"></div>
                            </div>

                            {/* Google */}

                            <button
                                onClick={loginGoogle}
                                className="w-full border border-white/30 hover:bg-indigo-500/30 py-2 rounded-lg flex items-center justify-center gap-3 text-white transition"
                            >
                                <img
                                    src="https://www.svgrepo.com/show/475656/google-color.svg"
                                    className="w-5 h-5"
                                />
                                Continue with Google
                            </button>

                        </div>

                    </div>

                </div>

            </div>
        </div>
    );
}