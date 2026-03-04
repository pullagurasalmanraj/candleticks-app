import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function LoginSuccess() {
    const navigate = useNavigate();

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");
        const code = params.get("code");

        if (token) {
            localStorage.setItem("upstox_access_token", token);
            localStorage.setItem(
                "upstox_token_expiry",
                (Date.now() + 24 * 60 * 60 * 1000).toString()
            );

            setTimeout(() => navigate("/"), 1000);
            return;
        }

        if (code) {
            window.location.href = `/enter-code?code=${code}`;
            return;
        }

        const existing = localStorage.getItem("upstox_access_token");
        navigate(existing ? "/" : "/login");
    }, [navigate]);

    return (
        <div className="fixed inset-0 flex items-center justify-center w-full h-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 px-6">

            <div className="w-full max-w-lg bg-white p-10 rounded-2xl shadow-xl border border-gray-200 text-center">

                <div className="text-3xl font-semibold text-blue-700 mb-4">
                    Connecting to Upstox...
                </div>

                <div className="h-14 w-14 mx-auto border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>

                <p className="mt-6 text-gray-500 text-sm">
                    Please wait while we verify your credentials…
                </p>
            </div>
        </div>
    );
}
