import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

// --------------------- BLOOMBERG LIGHT PALETTE ---------------------
const BLOOMBERG_LIGHT = {
    "--bg-primary": "#cfcfcf",        // main background
    "--bg-secondary": "#e2e2e2",     // panels / containers
    "--bg-tertiary": "#d7d7d7",      // lists, tables
    "--border-color": "#9e9e9e",     // institutional borders
    "--text-primary": "#222222",     // high contrast Bloomberg text
    "--text-secondary": "#444444",
    "--accent-up": "#1a8f3f",        // Bloomberg green
    "--accent-down": "#d12b37",      // Bloomberg red
};

// --------------------- BLOOMBERG DARK PALETTE ----------------------
const BLOOMBERG_DARK = {
    "--bg-primary": "#dd8717",
    "--bg-secondary": "#161b22",
    "--bg-tertiary": "#804b07",
    "--border-color": "#2b3241",
    "--text-primary": "#e5e5e5",
    "--text-secondary": "#b3b3b3",
    "--accent-up": "#00c76f",
    "--accent-down": "#ff4d4f",
};

// --------------------- PROVIDER ---------------------
export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem("theme") || "dark";
    });

    // Apply CSS variable palette on theme switch
    useEffect(() => {
        const root = document.documentElement;
        const palette = theme === "light" ? BLOOMBERG_LIGHT : BLOOMBERG_DARK;

        // Apply variables to :root
        Object.entries(palette).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });

        // Tailwind dark mode toggle
        if (theme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }

        localStorage.setItem("theme", theme);
    }, [theme]);

    const toggleTheme = () =>
        setTheme((prev) => (prev === "light" ? "dark" : "light"));

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

// --------------------- HOOK ---------------------
export const useTheme = () => useContext(ThemeContext);
