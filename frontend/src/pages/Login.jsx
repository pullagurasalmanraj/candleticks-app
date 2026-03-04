import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { LogIn } from "lucide-react";
import bgVideo from "../assets/login-animation.mp4";

export default function Login() {

    useEffect(() => {
        document.title = "Login | Candlesticks Dashboard";
    }, []);

    const handleLogin = () => {
        window.location.href = "http://localhost/auth/login";
    };

    return (
        <div className="relative w-full h-screen overflow-hidden">

            {/* Background Video Wrapper */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black">
                <motion.video
                    key="background"
                    autoPlay
                    loop
                    muted
                    playsInline
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1.2 }}
                    className="
            max-w-none
            min-w-full
            min-h-full
            object-cover
            md:h-full md:w-auto
          "
                >
                    <source src={bgVideo} type="video/mp4" />
                </motion.video>
            </div>

            {/* Cinematic Overlay */}
            <motion.div
                className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/30 to-transparent"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.4 }}
            />

            {/* Soft Gloss Effect */}
            <motion.div
                className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-white/10 to-transparent"
                animate={{ opacity: [0.15, 0.35, 0.15] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Page Content */}
            <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center">

                {/* Title */}
                <motion.h1
                    initial={{ y: 35, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 1 }}
                    className="text-white text-5xl sm:text-6xl font-extrabold tracking-tight drop-shadow-xl"
                >
                    TradingDesk
                </motion.h1>

                {/* Subtitle */}
                <motion.p
                    className="text-gray-300 mt-3 text-sm sm:text-base"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2.2 }}
                >
                    Powered by Upstox API
                </motion.p>

                {/* Login Button */}
                <motion.button
                    onClick={handleLogin}
                    whileHover={{ scale: 1.08, boxShadow: "0px 0px 22px rgba(0,150,255,0.7)" }}
                    whileTap={{ scale: 0.92 }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7, duration: 0.6 }}
                    className="mt-10 px-10 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-xl flex items-center gap-3"
                >
                    <LogIn size={22} /> Login with Upstox
                </motion.button>

                {/* Footer Info */}
                <motion.p
                    className="mt-10 text-gray-400 text-xs sm:text-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.3 }}
                >
                    🔐 Secure OAuth • No Credentials Stored • Encrypted Sign-in
                </motion.p>

            </div>
        </div>
    );
}
