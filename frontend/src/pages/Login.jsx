import React, { useState } from "react";
import CandleBackground from "../components/CandleBackground";
import Navbar from "../components/Navbar";

import {
    Card,
    CardContent,
    TextField,
    Button,
    Tabs,
    Tab,
    Typography,
    Box,
    Divider,
    Dialog,
    DialogContent,
    DialogActions
} from "@mui/material";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import GoogleIcon from "@mui/icons-material/Google";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import LoginIcon from "@mui/icons-material/Login";

export default function AuthPage() {

    const [tab, setTab] = useState("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [signupSuccess, setSignupSuccess] = useState(false);



    const validateInputs = () => {

        if (!username || !password) {
            alert("Username and password are required");
            return false;
        }

        if (password.length < 6) {
            alert("Password must be at least 6 characters");
            return false;
        }

        return true;
    };

    const handleLogin = async () => {

        if (!validateInputs()) return;

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
        // store user login state
        localStorage.setItem("user", username);

        window.location.href = "/brokers";
    };


    const handleSignup = async () => {

        if (!validateInputs()) return;

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

        setSignupSuccess(true);
    };
    const loginGoogle = () => {
        window.location.href = "/auth/google";
    };


    return (

        <div
            className="relative w-full min-h-screen"
            style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
        >

            <CandleBackground />

            <Navbar />

            <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-64px)]">

                {/* HERO */}

                <div className="relative z-10 flex flex-col justify-center px-16 text-white">

                    <h1 className="text-5xl font-bold">
                        Candlesticks
                    </h1>

                    <p className="mt-6 text-lg max-w-md" style={{ color: "var(--text-secondary)" }}>
                        Professional trading analytics platform powered by real-time
                        market data, algorithmic indicators and AI driven insights.
                    </p>

                    <div className="mt-10 space-y-4" style={{ color: "var(--text-secondary)" }}>
                        <p>📊 Real-time market ticks</p>
                        <p>📈 Advanced indicator engine</p>
                        <p>⚡ Strategy backtesting</p>
                        <p>🤖 AI powered predictions</p>
                    </div>

                </div>


                {/* LOGIN CARD */}

                <div className="relative z-10 flex items-center justify-center px-6">

                    <Card
                        sx={{
                            width: 420,
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-color)",
                            backdropFilter: "blur(25px)",
                            borderRadius: 4,
                            color: "var(--text-primary)"
                        }}
                    >

                        <CardContent>

                            <Typography variant="h5" align="center" sx={{ mb: 2 }}>
                                Welcome
                            </Typography>


                            <Tabs
                                value={tab}
                                onChange={(e, v) => setTab(v)}
                                centered
                                textColor="inherit"
                                indicatorColor="secondary"
                            >

                                <Tab label="Login" value="login" />
                                <Tab label="Signup" value="signup" />

                            </Tabs>


                            <Box mt={3} display="flex" flexDirection="column" gap={2}>

                                <TextField
                                    label="Username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    fullWidth
                                    variant="outlined"
                                    InputProps={{
                                        sx: {
                                            color: "var(--text-primary)"
                                        }
                                    }}

                                    InputLabelProps={{
                                        sx: {
                                            color: "var(--text-secondary)"
                                        }
                                    }}
                                />

                                <TextField
                                    label="Password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    fullWidth
                                    variant="outlined"
                                    InputProps={{
                                        sx: {
                                            color: "var(--text-primary)"
                                        }
                                    }}

                                    InputLabelProps={{
                                        sx: {
                                            color: "var(--text-secondary)"
                                        }
                                    }}
                                />


                                {tab === "login" && (

                                    <Button
                                        variant="contained"
                                        startIcon={<LoginIcon />}
                                        onClick={handleLogin}
                                        disabled={!username || !password}
                                        fullWidth
                                        sx={{ height: 45 }}
                                    >
                                        Login to Trading Platform
                                    </Button>
                                )}


                                {tab === "signup" && (

                                    <Button
                                        variant="contained"
                                        startIcon={<PersonAddIcon />}
                                        onClick={handleSignup}
                                        disabled={!username || !password}
                                        fullWidth
                                        sx={{ height: 45 }}
                                    >
                                        Create Trading Account
                                    </Button>

                                )}


                                <Divider sx={{ borderColor: "var(--border-color)" }}>
                                    OR
                                </Divider>


                                <Button
                                    startIcon={<GoogleIcon />}
                                    onClick={loginGoogle}
                                    sx={{
                                        height: 45,
                                        color: "var(--text-primary)",
                                        borderColor: "var(--border-color)",
                                        "&:hover": {
                                            borderColor: "var(--accent-up)"
                                        }
                                    }}
                                >
                                    Continue with Google
                                </Button>

                            </Box>

                        </CardContent>

                    </Card>

                </div>

            </div>


            {/* SUCCESS DIALOG */}

            <Dialog open={signupSuccess}>

                <DialogContent sx={{ textAlign: "center", p: 5 }}>

                    <CheckCircleIcon
                        sx={{ fontSize: 60, color: "var(--accent-up)" }}
                    />
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        Account Created
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                        Your trading account has been created successfully.
                        Please login to continue.
                    </Typography>

                </DialogContent>


                <DialogActions sx={{ justifyContent: "center", pb: 3 }}>

                    <Button
                        variant="contained"
                        onClick={() => {
                            setSignupSuccess(false);
                            setTab("login");
                        }}
                    >
                        Go to Trading Dashboard
                    </Button>

                </DialogActions>

            </Dialog>

        </div>

    );

}