# app.py
# -*- coding: utf-8 -*-
"""
Flask API (no streamer, no SocketIO, no eventlet).
- Saves Upstox tokens to Redis key "upstox:tokens"
- Publishes subscription requests to Redis channel "subscribe:requests"
- Index summary endpoint caches into Redis key "cache:index_summary"
"""
import os
import json

import gzip
import pandas as pd
import numpy as np
import traceback

# ---- TIME IMPORTS (FINAL) ----
import time as systime  # ONLY for sleep()
from datetime import datetime, timedelta, timezone, time as dtime
from zoneinfo import ZoneInfo
import threading

from sqlalchemy import create_engine


live_workers = {}  # symbol → thread

import numpy as np
import joblib
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, mean_squared_error
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout

import psycopg2
from psycopg2.extras import RealDictCursor
import os

from db import get_db_conn
from services.vix_service import update_vix_if_needed

import shutil

from zoneinfo import ZoneInfo
from psycopg2.extras import execute_values
from tensorflow.keras.models import load_model


from flask import request, jsonify, send_file, make_response
from io import BytesIO
import pandas as pd
import traceback
import ta

from flask import request, jsonify, send_file
from io import BytesIO
import pandas as pd
import traceback
import ta


import warnings

warnings.filterwarnings("ignore")
from io import BytesIO
import pandas as pd
import numpy as np
import yfinance as yf
import traceback
import psycopg2

from flask import make_response
from io import BytesIO

from psycopg2.extras import execute_batch
from flask import request, jsonify, send_file

import ta  # technical indicators (pip install ta)

try:
    import talib  # candlestick & classic TA indicators
except ImportError:
    talib = None  # safe fallback if TA-Lib missing


from dotenv import load_dotenv, set_key

load_dotenv(override=True)
from datetime import datetime, timedelta, timezone
from datetime import datetime, timedelta, timezone, time as dtime
from zoneinfo import ZoneInfo
import time as systime
from datetime import time as dtime


from flask import Flask, jsonify, request, redirect, send_from_directory, make_response
import requests
from requests.sessions import Session as RequestsSession
import pytz
import talib

from zoneinfo import ZoneInfo


def json_safe(val):
    if pd.isna(val):
        return None
    return val


# Optional extras
try:
    import yfinance as yf
except Exception:
    yf = None

try:
    import ta
except Exception:
    ta = None

# Redis
try:
    import redis as redis_lib
except Exception:
    redis_lib = None

# CONFIG
INDIA_TZ = pytz.timezone("Asia/Kolkata")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "../frontend/dist")

UPSTOX_CLIENT_ID = os.getenv("UPSTOX_CLIENT_ID", "").strip()
UPSTOX_CLIENT_SECRET = os.getenv("UPSTOX_CLIENT_SECRET", "").strip()
UPSTOX_REDIRECT_URI = os.getenv("UPSTOX_REDIRECT_URI", "http://localhost/").strip()
UPSTOX_API_BASE = os.getenv("UPSTOX_API_BASE", "https://api.upstox.com/v2")
TOKENS_FILE = os.path.join(BASE_DIR, "tokens.json")
ENV_FILE = os.path.join(BASE_DIR, ".env")
UPSTOX_V3_BASE = os.getenv("UPSTOX_V3_BASE", "https://api.upstox.com/v3")


safe_requests = RequestsSession()
safe_requests.trust_env = False

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")

# Redis setup
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/10")
REDIS_ENABLED = False
redis_client = None
if redis_lib is not None:
    try:
        redis_client = redis_lib.Redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        REDIS_ENABLED = True
        print("✅ Connected to Redis:", REDIS_URL)
    except Exception as e:
        print("⚠️ Redis connection failed:", e)
        REDIS_ENABLED = False
else:
    print("⚠️ redis library not available; Redis features disabled")


# Helpers: tokens
def load_saved_tokens():
    if REDIS_ENABLED and redis_client is not None:
        try:
            t = redis_client.get("upstox:tokens")
            return json.loads(t) if t else {}
        except Exception:
            pass
    if os.path.exists(TOKENS_FILE):
        try:
            with open(TOKENS_FILE, "r") as f:
                return json.load(f) or {}
        except Exception:
            pass
    return {}


def save_tokens(data: dict):
    data_copy = dict(data)
    data_copy["saved_at"] = datetime.now(timezone.utc).isoformat()
    if REDIS_ENABLED and redis_client is not None:
        try:
            redis_client.set("upstox:tokens", json.dumps(data_copy))
        except Exception as e:
            print("⚠️ Failed to write tokens to redis:", e)
    try:
        with open(TOKENS_FILE, "w") as f:
            json.dump(data_copy, f, indent=2)
    except Exception:
        pass
    if data_copy.get("access_token"):
        os.environ["UPSTOX_ACCESS_TOKEN"] = data_copy.get("access_token")
        try:
            set_key(ENV_FILE, "UPSTOX_ACCESS_TOKEN", data_copy.get("access_token"))
        except Exception:
            pass
    print("💾 Token saved.")


def token_is_fresh(max_age_hours=24):
    data = load_saved_tokens()
    access_token = data.get("access_token")
    saved_at = data.get("saved_at")
    if not access_token or not saved_at:
        return False
    try:
        saved_time = datetime.fromisoformat(saved_at)
        if saved_time.tzinfo is None:
            saved_time = saved_time.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - saved_time) < timedelta(
            hours=max_age_hours
        )
    except Exception:
        return False


def refresh_upstox_token():
    data = load_saved_tokens()
    refresh_token = (
        data.get("refresh_token") or os.getenv("UPSTOX_REFRESH_TOKEN", "").strip()
    )
    if not refresh_token:
        print("🔴 No refresh_token available.")
        return False
    token_url = f"{UPSTOX_API_BASE}/login/authorization/token"
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": UPSTOX_CLIENT_ID,
        "client_secret": UPSTOX_CLIENT_SECRET,
        "redirect_uri": UPSTOX_REDIRECT_URI,
    }
    try:
        r = safe_requests.post(token_url, data=payload, timeout=12)
        j = r.json() if r.content else {}
        if r.status_code == 200 and "access_token" in j:
            print("🔁 Successfully refreshed access token.")
            save_tokens(j)
            return True
        else:
            print("❌ Refresh failed:", r.status_code, j)
            return False
    except Exception as e:
        print("❌ Exception while refreshing token:", e)
        return False


# Index summary (cache in redis)
_last_market_data = None
_last_market_time = 0


def is_market_open():
    now = datetime.now(INDIA_TZ).time()
    return dtime(9, 0) <= now <= dtime(15, 30)


# =======================
# PostgreSQL Configuration
# =======================
PG_HOST = os.getenv("PGHOST", "127.0.0.1")
PG_PORT = int(os.getenv("PGPORT", "5432"))
PG_DB = os.getenv("PGDATABASE", "trading_db")
PG_USER = os.getenv("PGUSER", "postgres")
PG_PASSWORD = os.getenv("PGPASSWORD", "postgres")


def get_db_conn():
    """
    Open a new PostgreSQL connection.
    Configure credentials via environment:
    PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
    """
    return psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        dbname=PG_DB,
        user=PG_USER,
        password=PG_PASSWORD,
    )


def get_db():
    return psycopg2.connect(
        host=os.getenv("PGHOST"),
        port=os.getenv("PGPORT"),
        dbname=os.getenv("PGDATABASE"),
        user=os.getenv("PGUSER"),
        password=os.getenv("PGPASSWORD"),
        cursor_factory=RealDictCursor,
    )


def init_db():
    """
    Create timeframes + intraday_candles + date_ranges tables if not exist
    and seed default values.
    """

    ddl_timeframes = """
    CREATE TABLE IF NOT EXISTS timeframes (
        id SERIAL PRIMARY KEY,
        value VARCHAR(10) NOT NULL UNIQUE,
        label VARCHAR(50) NOT NULL
    );
    """

    ddl_candles = """
    CREATE TABLE IF NOT EXISTS intraday_candles (
        id BIGSERIAL PRIMARY KEY,
        symbol VARCHAR(30) NOT NULL,
        exchange VARCHAR(10) NOT NULL DEFAULT 'NSE',   -- NEW
        timestamp TIMESTAMPTZ NOT NULL,
        open NUMERIC(12,2) NOT NULL,
        high NUMERIC(12,2) NOT NULL,
        low NUMERIC(12,2) NOT NULL,
        close NUMERIC(12,2) NOT NULL,
        volume BIGINT,
        timeframe VARCHAR(10) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (symbol, timestamp, timeframe)
    );
    """

    ddl_date_ranges = """
    CREATE TABLE IF NOT EXISTS date_ranges (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) NOT NULL UNIQUE,
        label VARCHAR(100) NOT NULL,
        days_back_start INTEGER NOT NULL,
        days_back_end INTEGER NOT NULL
    );
    """

    with get_db_conn() as conn:
        with conn.cursor() as cur:

            # Create tables
            cur.execute(ddl_timeframes)
            cur.execute(ddl_candles)
            cur.execute(ddl_date_ranges)

            # Seed timeframes if empty
            cur.execute("SELECT COUNT(*) FROM timeframes;")
            tf_count = cur.fetchone()[0]
            if tf_count == 0:
                cur.execute(
                    """
                    INSERT INTO timeframes (value, label) VALUES
                    ('1',  '1 Minute'),
                    ('3',  '3 Minute'),
                    ('5',  '5 Minute'),
                    ('15', '15 Minute'),
                    ('30', '30 Minute');
                """
                )

            # Seed date ranges if empty
            cur.execute("SELECT COUNT(*) FROM date_ranges;")
            dr_count = cur.fetchone()[0]
            if dr_count == 0:
                cur.execute(
                    """
                    INSERT INTO date_ranges (code, label, days_back_start, days_back_end) VALUES
                    ('1D',  'Today',           0, 0),
                    ('2D',  'Last 2 Days',     2, 0),
                    ('5D',  'Last 5 Days',     5, 0),
                    ('10D', 'Last 10 Days',   10, 0),
                    ('20D', 'Last 20 Days',   20, 0);
                """
                )

    print("✅ PostgreSQL tables ensured (timeframes, intraday_candles, date_ranges).")


@app.route("/api/index-summary", methods=["GET"])
def index_summary():
    from datetime import datetime

    global _last_market_data, _last_market_time

    ttl = 15 if is_market_open() else 300  # Faster refresh during market hours
    now_ts = systime.time()
    as_of = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat()

    # ---- Redis Cached ----
    if REDIS_ENABLED and redis_client is not None:
        try:
            cached = redis_client.get("cache:index_summary")
            if cached:
                return jsonify(json.loads(cached))
        except Exception:
            pass

    # ---- Memory Cache ----
    if _last_market_data and (now_ts - _last_market_time) < ttl:
        return jsonify(_last_market_data)

    # ---- Get Upstox Token ----
    tokens = load_saved_tokens()
    access_token = tokens.get("access_token")

    if not access_token:
        return jsonify({"error": "Not logged in — connect Upstox"}), 401

    INDEX_KEYS = {
        "Nifty 50": "NSE_INDEX|NIFTY_50",
        "Bank Nifty": "NSE_INDEX|BANKNIFTY",
        "Sensex": "BSE_INDEX|SENSEX",
        "Nifty Next 50": "NSE_INDEX|NIFTY_NEXT_50",
    }

    url = "https://api.upstox.com/v2/market-quote/indices"
    symbols = ",".join(INDEX_KEYS.values())

    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}

    response = safe_requests.get(
        f"{url}?symbols={symbols}", headers=headers, timeout=10
    )

    # ---- Token Expired → Refresh ----
    if response.status_code == 401:
        if refresh_upstox_token():
            tokens = load_saved_tokens()
            headers["Authorization"] = f"Bearer {tokens.get('access_token')}"
            response = safe_requests.get(
                f"{url}?symbols={symbols}", headers=headers, timeout=10
            )
        else:
            return jsonify({"error": "Session expired — login again"}), 401

    # ---- API Failure ----
    if response.status_code != 200:
        return jsonify({"error": "Upstox API failed", "details": response.text}), 500

    data = response.json().get("data", [])

    summary = {}
    total_percent = 0
    count = 0

    # ---- Build Clean Response ----
    for name, key in INDEX_KEYS.items():
        row = next(
            (
                x
                for x in data
                if x.get("instrument_key") == key or x.get("tradingsymbol") in key
            ),
            None,
        )

        if not row:
            print(f"⚠ Missing index response from Upstox: {name}")
            continue

        # Safe numeric parsing
        def safe(v):
            try:
                return round(float(v), 2)
            except:
                return 0

        ltp = safe(row.get("ltp"))
        change = safe(row.get("change"))
        percent = safe(row.get("percent_change"))
        high = safe(row.get("high"))
        low = safe(row.get("low"))
        open_ = safe(row.get("open"))
        prev_close = safe(row.get("close"))

        summary[name] = {
            "symbol": key,
            "displayName": name,
            "ltp": ltp,
            "open": open_,
            "high": high,
            "low": low,
            "prevClose": prev_close,
            "change": change,
            "percent": percent,
            "direction": "up" if change >= 0 else "down",
            "source": "Upstox Live",
        }

        total_percent += percent
        count += 1

    avg_percent = round(total_percent / count, 2) if count else 0
    icon = "▲" if avg_percent >= 0 else "▼"

    payload = {
        "status": "success",
        "indices": summary,
        "marketSummary": {
            "title": f"{icon} Market {'UP' if avg_percent >= 0 else 'DOWN'}",
            "avg_percent": avg_percent,
        },
        "asOf": as_of,
    }

    # ---- Save Cache ----
    _last_market_data = payload
    _last_market_time = now_ts

    if REDIS_ENABLED and redis_client:
        redis_client.setex("cache:index_summary", ttl, json.dumps(payload))

    return jsonify(payload)


from flask import request, session, jsonify
from werkzeug.security import check_password_hash


@app.route("/api/login", methods=["POST"])
def login_user():

    data = request.json
    username = data.get("username")
    password = data.get("password")

    cur = conn.cursor()

    cur.execute("SELECT password_hash FROM users WHERE username=%s", (username,))

    row = cur.fetchone()

    if not row:
        return jsonify({"error": "Invalid username"}), 401

    if not check_password_hash(row[0], password):
        return jsonify({"error": "Invalid password"}), 401

    session["user"] = username

    return jsonify({"success": True})


@app.route("/api/signup", methods=["POST"])
def signup():

    data = request.json
    username = data["username"]
    password = generate_password_hash(data["password"])

    cur.execute(
        "INSERT INTO users(username,password_hash) VALUES(%s,%s)", (username, password)
    )

    conn.commit()

    return {"success": True}


# OAuth endpoints (minimal)
from flask import session, redirect, jsonify


@app.route("/auth/login")
def auth_login():

    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    auth_url = (
        f"{UPSTOX_API_BASE}/login/authorization/dialog"
        f"?client_id={UPSTOX_CLIENT_ID}"
        f"&redirect_uri={UPSTOX_REDIRECT_URI}"
        f"&response_type=code"
    )

    return redirect(auth_url)


@app.route("/", methods=["GET"])
def root_or_callback():
    code = request.args.get("code")
    if code:
        token_url = f"{UPSTOX_API_BASE}/login/authorization/token"
        payload = {
            "code": code,
            "client_id": UPSTOX_CLIENT_ID,
            "client_secret": UPSTOX_CLIENT_SECRET,
            "redirect_uri": UPSTOX_REDIRECT_URI,
            "grant_type": "authorization_code",
        }
        try:
            r = safe_requests.post(token_url, data=payload, timeout=15)
            data = r.json()

            if r.status_code == 200 and "access_token" in data:
                save_tokens(data)
                return redirect(f"/login-success?token={data['access_token']}")
            return f"<h3>Token exchange failed</h3><pre>{data}</pre>", 400
        except Exception as e:
            traceback.print_exc()
            return f"<h3>Server error</h3><pre>{e}</pre>", 500
    if token_is_fresh():
        return send_from_directory(FRONTEND_DIR, "index.html")
    return redirect("/auth/login")


@app.route("/login-success")
def login_success():
    response = send_from_directory(FRONTEND_DIR, "index.html")
    response.headers["Cache-Control"] = "no-store"
    return response


# Subscribe API: publishes a subscribe request to Redis.
@app.route("/api/ws-subscribe", methods=["GET"])
def api_ws_subscribe():
    try:
        symbol = (request.args.get("symbol") or "").strip().upper()
        exchange = (request.args.get("exchange") or "").strip().upper()

        if not symbol:
            return jsonify({"error": "symbol missing"}), 400

        # If frontend already sent full instrument key -> use it
        if "|" in symbol:
            instrument_key = symbol

        else:
            mapped = SYMBOL_TO_KEY.get(symbol)

            if not mapped:
                return jsonify({"error": f"Symbol not found: {symbol}"}), 404

            # ---- SINGLE EXCHANGE ----
            if isinstance(mapped, str):
                instrument_key = mapped

            # ---- MULTIPLE EXCHANGES ----
            elif isinstance(mapped, dict):
                # if user passed NSE/BSE, use it
                if exchange and exchange in mapped:
                    instrument_key = mapped[exchange]

                # no exchange from frontend → default NSE if exists
                elif "NSE" in mapped:
                    instrument_key = mapped["NSE"]

                # otherwise pick first one
                else:
                    instrument_key = list(mapped.values())[0]

            else:
                return jsonify({"error": "Invalid mapping format"}), 500

        # ---- Send subscription request to Redis ----
        redis_client.publish(
            "subscribe:requests",
            json.dumps(
                {
                    "instrument_key": instrument_key,
                    "action": "subscribe",
                    "symbol": symbol,
                }
            ),
        )

        print(f"📡 SUBSCRIBE → {symbol} → {instrument_key}")

        return jsonify(
            {"status": "subscribed", "instrument_key": instrument_key, "symbol": symbol}
        )

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/unsubscribe", methods=["POST"])
def api_unsubscribe():
    data = request.json
    ik = data.get("instrument_key")

    if not ik:
        return jsonify({"error": "instrument_key missing"}), 400

    # 🔥 Send proper unsubscribe format
    redis_client.publish(
        "unsubscribe:requests",
        json.dumps({"instrument_key": ik, "method": "unsub", "action": "unsubscribe"}),
    )

    print(f"❌ Unsubscribe → {ik}")

    return jsonify({"status": "unsubscribed", "instrument_key": ik})


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "API endpoint not found"}), 404
    return send_from_directory(FRONTEND_DIR, "index.html")


# --------------- Excel history + indicators ---------------
def _normalize_date(date_str):
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(date_str).date().strftime("%Y-%m-%d")
    except Exception:
        raise ValueError(f"Invalid date format: {date_str}")


@app.route("/api/history/daily", methods=["GET"])
def download_daily_upstox():
    try:
        # ---------------------------------------------
        # 1️⃣ Parse Input
        # ---------------------------------------------
        symbol = request.args.get("symbol", "").upper().strip()
        start_date = request.args.get("start", "").strip()
        end_date = request.args.get("end", "").strip()

        # 🆕 Optional instrument key (frontend now supports exchange-based keys)
        instrument_key = request.args.get("instrument_key", "").strip()

        if not symbol or not start_date or not end_date:
            return jsonify({"error": "symbol, start and end required"}), 400

        # ---------------------------------------------
        # 2️⃣ Resolve Instrument Key (Prefer explicit, fallback to map)
        # ---------------------------------------------
        if instrument_key:
            inst_key = instrument_key
        else:
            entry = SYMBOL_TO_KEY.get(symbol)
            if isinstance(entry, dict):  # NSE + BSE available
                inst_key = entry.get("NSE") or entry.get("BSE")
            else:
                inst_key = entry

        if not inst_key:
            return jsonify({"error": f"No instrument key found for {symbol}"}), 404

        # ---------------------------------------------
        # 3️⃣ Token validation / refresh
        # ---------------------------------------------
        tokens = load_saved_tokens()
        access_token = tokens.get("access_token")

        if not access_token:
            return jsonify({"error": "No Upstox access token stored"}), 401

        if not token_is_fresh():
            if refresh_upstox_token():
                tokens = load_saved_tokens()
                access_token = tokens.get("access_token")
            else:
                return jsonify({"error": "Token expired, login again."}), 401

        # ---------------------------------------------
        # 4️⃣ Upstox API URL (Correct format)
        # ---------------------------------------------
        url = f"{UPSTOX_V3_BASE}/historical-candle/{inst_key}/days/1/{end_date}/{start_date}"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }

        response = safe_requests.get(url, headers=headers, timeout=20)

        # Retry if expired
        if response.status_code == 401:
            if refresh_upstox_token():
                tokens = load_saved_tokens()
                headers["Authorization"] = f"Bearer {tokens.get('access_token')}"
                response = safe_requests.get(url, headers=headers, timeout=20)
            else:
                return jsonify({"error": "Session expired. Login again."}), 401

        if response.status_code != 200:
            return jsonify({"error": "Upstox API error", "details": response.text}), 400

        # ---------------------------------------------
        # 5️⃣ Parse Candle Data
        # ---------------------------------------------
        candles = response.json().get("data", {}).get("candles", [])
        if not candles:
            return jsonify({"error": "No candle data returned"}), 404

        df = pd.DataFrame(
            candles, columns=["Date", "Open", "High", "Low", "Close", "Volume", "OI"]
        )
        df["Date"] = pd.to_datetime(df["Date"])
        df = df.sort_values("Date")

        # Numeric conversion
        df[["Open", "High", "Low", "Close", "Volume", "OI"]] = df[
            ["Open", "High", "Low", "Close", "Volume", "OI"]
        ].apply(pd.to_numeric, errors="coerce")
        df["Volume"] = df["Volume"].fillna(0).astype(int)

        # ---------------------------------------------
        # 6️⃣ Technical Indicators
        # ---------------------------------------------
        close = df["Close"]
        high = df["High"]
        low = df["Low"]

        df["RSI_14"] = ta.momentum.RSIIndicator(close, 14).rsi()
        df["EMA_20"] = ta.trend.EMAIndicator(close, 20).ema_indicator()
        df["SMA_20"] = ta.trend.SMAIndicator(close, 20).sma_indicator()

        macd = ta.trend.MACD(close)
        df["MACD"], df["MACD_Signal"], df["MACD_Hist"] = (
            macd.macd(),
            macd.macd_signal(),
            macd.macd_diff(),
        )

        df["ADX_14"] = ta.trend.ADXIndicator(high, low, close, 14).adx()

        # Remove warm-up NaN rows
        df = df.dropna().reset_index(drop=True)

        if df.empty:
            return jsonify({"error": "Not enough valid rows for indicators"}), 400

        df["Date"] = df["Date"].dt.strftime("%Y-%m-%d")

        df.insert(0, "Symbol", symbol)
        df.insert(1, "InstrumentKey", inst_key)

        # ---------------------------------------------
        # 7️⃣ Export to Excel
        # ---------------------------------------------
        output = BytesIO()
        df.to_excel(output, index=False, sheet_name="Daily Data")
        output.seek(0)

        filename = f"{symbol}_{start_date}_to_{end_date}_DailyTechnical.xlsx"

        resp = make_response(
            send_file(
                output,
                as_attachment=True,
                download_name=filename,
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        )

        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Expose-Headers"] = "Content-Disposition"

        return resp

    except Exception as e:
        print("\n🔥 ERROR:", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# -------------------------------------------------
# Instrument Classification Logic
# -------------------------------------------------
def classify(segment, instrument_type):
    segment = (segment or "").upper()
    itype = (instrument_type or "").upper()

    # Cash equities
    if segment in ("NSE_EQ", "BSE_EQ"):
        return "EQUITY", True

    # Futures
    if segment == "NSE_FO" and itype in ("FUTIDX", "FUTSTK"):
        return "FUTURE", True

    # Options
    if segment == "NSE_FO" and itype in ("CE", "PE", "OPTIDX", "OPTSTK"):
        return "OPTION", True

    # Commodities
    if segment.startswith("MCX"):
        return "COMMODITY", False

    # Bonds
    if "BOND" in itype:
        return "BOND", False

    # Index / Others
    if itype == "INDEX":
        return "INDEX", False

    return "OTHER", False


from datetime import datetime, timezone


def ms_to_date(ms):
    """
    Convert Upstox expiry milliseconds → DATE
    """
    if not ms:
        return None
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).date()
    except Exception:
        return None


def sync_instruments_core():
    print("🔄 [SYNC] Core instrument sync started")

    inst_path = os.path.join(BASE_DIR, "upstox_instruments.json.gz")
    if not os.path.exists(inst_path):
        raise FileNotFoundError("Instruments file missing")

    # -----------------------------
    # Load snapshot file
    # -----------------------------
    with gzip.open(inst_path, "rt", encoding="utf-8") as f:
        instruments = json.load(f)

    if not instruments:
        raise ValueError("Empty instruments file")

    snapshot_ts = datetime.utcnow()
    rows = []
    skipped = 0

    # -----------------------------
    # Build UPSERT rows
    # -----------------------------
    for i in instruments:
        ik = i.get("instrument_key")
        if not ik:
            skipped += 1
            continue

        asset_class, is_tradeable = classify(i.get("segment"), i.get("instrument_type"))

        rows.append(
            (
                ik,
                (i.get("trading_symbol") or "").upper(),
                i.get("name"),
                (
                    "NSE"
                    if (i.get("segment") or "").startswith("NSE")
                    else "BSE" if (i.get("segment") or "").startswith("BSE") else "MCX"
                ),
                i.get("segment"),
                i.get("instrument_type"),
                i.get("isin"),
                i.get("underlying_symbol"),
                i.get("strike_price"),
                ms_to_date(i.get("expiry")),
                i.get("lot_size"),
                i.get("minimum_lot"),
                i.get("qty_multiplier"),
                i.get("exchange_token"),
                i.get("tick_size"),
                asset_class,
                is_tradeable,
                snapshot_ts,  # last_seen_at
                True,  # is_active
            )
        )

    print(f"🧱 [SYNC] Prepared {len(rows)} rows (skipped {skipped})")

    # -----------------------------
    # DB TRANSACTION
    # -----------------------------
    with get_db_conn() as conn:
        with conn.cursor() as cur:

            # ✅ STEP 1: mark everything inactive
            print("⬇️ [SYNC] Marking all instruments inactive")
            cur.execute("UPDATE instruments SET is_active = FALSE")

            # ✅ STEP 2: UPSERT snapshot instruments
            print("⬆️ [SYNC] Upserting snapshot instruments")
            execute_values(
                cur,
                """
                INSERT INTO instruments (
                    instrument_key, trading_symbol, name, exchange,
                    segment, instrument_type, isin, underlying,
                    strike_price, expiry, lot_size, minimum_lot,
                    qty_multiplier, exchange_token, tick_size,
                    asset_class, is_tradeable,
                    last_seen_at, is_active
                )
                VALUES %s
                ON CONFLICT (instrument_key)
                DO UPDATE SET
                    trading_symbol  = EXCLUDED.trading_symbol,
                    name            = EXCLUDED.name,
                    exchange        = EXCLUDED.exchange,
                    segment         = EXCLUDED.segment,
                    instrument_type = EXCLUDED.instrument_type,
                    isin            = EXCLUDED.isin,
                    underlying      = EXCLUDED.underlying,
                    strike_price    = EXCLUDED.strike_price,
                    expiry          = EXCLUDED.expiry,
                    lot_size        = EXCLUDED.lot_size,
                    minimum_lot     = EXCLUDED.minimum_lot,
                    qty_multiplier  = EXCLUDED.qty_multiplier,
                    exchange_token  = EXCLUDED.exchange_token,
                    tick_size       = EXCLUDED.tick_size,
                    asset_class     = EXCLUDED.asset_class,
                    is_tradeable    = EXCLUDED.is_tradeable,
                    last_seen_at    = EXCLUDED.last_seen_at,
                    is_active       = TRUE
                """,
                rows,
                page_size=1000,
            )

        conn.commit()

    print(
        f"✅ [SYNC] Completed | "
        f"rows={len(rows)}, skipped={skipped}, "
        f"snapshot_ts={snapshot_ts.isoformat()}"
    )


@app.route("/api/admin/sync-instruments", methods=["POST"])
def sync_instruments():
    try:
        sync_instruments_core()
        return jsonify({"status": "SUCCESS"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# Simple instruments endpoint placeholder
import psycopg2.extras


@app.route("/api/instruments", methods=["GET"])
def api_instruments():
    q = request.args.get("q", "").strip().upper()

    if len(q) < 2:
        return jsonify({"instruments": []})

    sql = """
        SELECT
            trading_symbol AS symbol,
            name,
            exchange,
            segment,
            instrument_type,
            isin,
            underlying,
            strike_price,
            expiry,
            lot_size,
            minimum_lot,
            qty_multiplier,
            instrument_key,
            exchange_token,
            tick_size
        FROM v_search_universe
        WHERE is_tradeable = true
          AND (
              trading_symbol ILIKE %s
              OR name ILIKE %s
          )
        ORDER BY
            CASE
                WHEN trading_symbol = %s THEN 0
                WHEN trading_symbol ILIKE %s THEN 1
                WHEN segment IN ('NSE_EQ','BSE_EQ') THEN 2
                WHEN segment = 'NSE_INDEX' THEN 3
                WHEN segment = 'NSE_FO' AND instrument_type IN ('FUTIDX','FUTSTK') THEN 4
                WHEN segment = 'NSE_FO' AND instrument_type IN ('CE','PE') THEN 5
                ELSE 6
            END,
            LENGTH(trading_symbol),
            trading_symbol
        LIMIT 50
    """

    params = [f"{q}%", f"{q}%", q, f"{q}%"]

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(sql, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return jsonify({"instruments": rows})


@app.route("/api/timeframes", methods=["GET"])
def api_timeframes():
    """
    Returns available intraday timeframes from DB.
    {
      "timeframes": [
         {"value": "1", "label": "1 Minute"}, ...
      ]
    }
    """
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT value, label FROM timeframes ORDER BY id ASC;")
                rows = cur.fetchall()
        tf_list = [{"value": v, "label": lbl} for (v, lbl) in rows]
        return jsonify({"timeframes": tf_list})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "timeframes": []}), 500


@app.route("/api/date-ranges", methods=["GET"])
def api_date_ranges():
    """
    Returns daily date ranges from DB.
    {
      "ranges": [
        { "code": "5D", "label": "Last 5 Days", "days_back_start": 5, "days_back_end": 0 },
        ...
      ]
    }
    """
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT code, label, days_back_start, days_back_end
                    FROM date_ranges
                    ORDER BY id ASC;
                    """
                )
                rows = cur.fetchall()

        ranges = [
            {
                "code": code,
                "label": label,
                "days_back_start": start,
                "days_back_end": end,
            }
            for (code, label, start, end) in rows
        ]
        return jsonify({"ranges": ranges})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "ranges": []}), 500


@app.route("/api/candles/store", methods=["POST"])
def api_candles_store():
    """
    Fetches Upstox intraday candles & stores them in PostgreSQL using:
    symbol + exchange + timeframe + timestamp
    """
    try:
        payload = request.get_json(force=True) or {}

        instrument_key = (payload.get("instrument_key") or "").strip()
        timeframe = (payload.get("timeframe") or "").strip()
        start_date = payload.get("start_date")
        end_date = payload.get("end_date")

        if not instrument_key or not timeframe:
            return jsonify({"error": "instrument_key and timeframe required"}), 400

        # -------------------------
        # Extract Symbol (Same Logic)
        # -------------------------
        symbol = (payload.get("symbol") or "").strip().upper()

        if not symbol:
            for sym, key in SYMBOL_TO_KEY.items():
                if key == instrument_key:
                    symbol = sym
                    break

        if not symbol:
            symbol = instrument_key.split("|")[-1].upper()

        # -------------------------
        # NEW: Detect Exchange (NSE / BSE)
        # -------------------------
        exchange = "UNKNOWN"
        if "|" in instrument_key:
            ex = instrument_key.split("|")[0].upper()
            exchange = ex.replace("_EQ", "")  # NSE_EQ → NSE , BSE_EQ → BSE

        # -------------------------
        # Access Token
        # -------------------------
        tokens = load_saved_tokens()
        access_token = (
            tokens.get("access_token") or os.getenv("UPSTOX_ACCESS_TOKEN", "").strip()
        )
        if not access_token:
            return (
                jsonify({"error": "No Upstox access token. Please login again."}),
                401,
            )

        # -------------------------
        # API URL
        # -------------------------
        url = f"{UPSTOX_V3_BASE}/historical-candle/intraday/{instrument_key}/minutes/{timeframe}"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        print(f"📡 Requesting intraday: {url}")
        r = safe_requests.get(url, headers=headers, timeout=20)

        if r.status_code != 200:
            return (
                jsonify({"error": "Upstox API error", "details": r.json()}),
                r.status_code,
            )

        candles = (r.json() or {}).get("data", {}).get("candles", [])
        if not candles:
            return jsonify({"status": "success", "inserted": 0, "total": 0})

        # -------------------------
        # Date Filter
        # -------------------------
        start_dt = datetime.fromisoformat(start_date).date() if start_date else None
        end_dt = datetime.fromisoformat(end_date).date() if end_date else None

        rows = []
        for c in candles:
            try:
                ts = datetime.fromisoformat(c[0])
                o, h, l, cl = map(float, c[1:5])
                v = int(c[5]) if c[5] not in (None, "") else 0
            except:
                continue

            if start_dt and ts.date() < start_dt:
                continue

            if end_dt and ts.date() > end_dt:
                continue

            # 👇 NEW → Store exchange in DB row
            rows.append((symbol, exchange, ts, o, h, l, cl, v, timeframe))

        if not rows:
            return jsonify({"status": "success", "inserted": 0, "note": "filtered"})

        # -------------------------
        # DB INSERT (Updated)
        # -------------------------
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                sql = """
                    INSERT INTO intraday_candles
                    (symbol, exchange, timestamp, open, high, low, close, volume, timeframe)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (symbol, exchange, timestamp, timeframe)
                    DO UPDATE SET
                        open   = EXCLUDED.open,
                        high   = EXCLUDED.high,
                        low    = EXCLUDED.low,
                        close  = EXCLUDED.close,
                        volume = EXCLUDED.volume;
                """
                execute_batch(cur, sql, rows, page_size=500)

        return jsonify(
            {
                "status": "success",
                "symbol": symbol,
                "exchange": exchange,
                "timeframe": timeframe,
                "inserted": len(rows),
                "total": len(candles),
            }
        )

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


from datetime import datetime, date
from dateutil.relativedelta import relativedelta
import traceback
import os


@app.route("/api/candles/history", methods=["POST"])
def api_candles_history():
    try:
        payload = request.get_json(force=True) or {}

        instrument_key = (payload.get("instrument_key") or "").strip()
        symbol = (payload.get("symbol") or "").strip().upper()
        timeframe = (payload.get("timeframe") or "").strip()
        start_date = (payload.get("start_date") or "").strip()
        end_date = (payload.get("end_date") or "").strip()

        if not all([instrument_key, symbol, timeframe, start_date, end_date]):
            return (
                jsonify(
                    {
                        "error": "symbol, instrument_key, timeframe, start_date and end_date required"
                    }
                ),
                400,
            )

        # ---------------- Exchange ----------------
        exchange = "UNKNOWN"
        if "|" in instrument_key:
            exchange = instrument_key.split("|")[0].upper().replace("_EQ", "")

        # ---------------- Timeframe map ----------------
        TF_MAP = {
            "1m": "1",
            "1": "1",
            "3m": "3",
            "3": "3",
            "5m": "5",
            "5": "5",
            "15m": "15",
            "15": "15",
            "30m": "30",
            "30": "30",
            "60m": "60",
            "60": "60",
        }
        api_tf = TF_MAP.get(timeframe.lower(), timeframe)

        # ---------------- Token ----------------
        tokens = load_saved_tokens()
        access_token = (
            tokens.get("access_token") or os.getenv("UPSTOX_ACCESS_TOKEN", "").strip()
        )
        if not access_token:
            return jsonify({"error": "No Upstox access token"}), 401

        # ---------------- Normalize dates ----------------
        from_date = min(start_date, end_date)  # earlier
        to_date = max(start_date, end_date)  # later

        start_dt = date.fromisoformat(from_date)
        end_dt = date.fromisoformat(to_date)

        print("[DEBUG] candles/history payload:", request.get_json())

        # ---------------- Parse timeframe ----------------
        tf = str(timeframe).strip().lower()

        # Normalize numeric timeframe (e.g. "1" → "1m")
        if tf.isdigit():
            tf = f"{tf}m"

        if tf.endswith("m"):
            category = "minutes"
            interval = int(tf.replace("m", ""))

        elif tf.endswith("h"):
            category = "hours"
            interval = int(tf.replace("h", ""))

        elif tf.endswith("d"):
            category = "days"
            interval = 1

        else:
            return (
                jsonify(
                    {
                        "error": "Unsupported timeframe",
                        "received": timeframe,
                        "expected": ["1m", "3m", "5m", "15m", "30m", "1h", "1d"],
                    }
                ),
                400,
            )

        # ---------------- Chunk size (Upstox rules) ----------------
        if category == "minutes":
            delta = (
                relativedelta(months=1) if interval <= 15 else relativedelta(months=3)
            )
        elif category == "hours":
            delta = relativedelta(months=3)
        elif category == "days":
            delta = relativedelta(years=10)
        else:
            delta = None

        # ---------------- Generate chunks ----------------
        chunks = []
        cur = start_dt
        while cur <= end_dt:
            chunk_to = min(cur + delta - relativedelta(days=1), end_dt)
            chunk_from = cur
            chunks.append((chunk_from, chunk_to))
            cur = chunk_to + relativedelta(days=1)

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        total_inserted = 0
        total_received = 0

        # ---------------- Fetch per chunk ----------------
        for chunk_from, chunk_to in chunks:

            # 🔒 Upstox requires: TO first, FROM second
            url = (
                f"{UPSTOX_V3_BASE}/historical-candle/"
                f"{instrument_key}/minutes/{api_tf}/"
                f"{chunk_to}/{chunk_from}"
            )

            print(f"📡 HIST {timeframe} FROM {chunk_from} TO {chunk_to}")

            r = safe_requests.get(url, headers=headers, timeout=30)
            if r.status_code != 200:
                return (
                    jsonify(
                        {
                            "error": "Upstox API error",
                            "details": r.json(),
                            "from": str(chunk_from),
                            "to": str(chunk_to),
                        }
                    ),
                    r.status_code,
                )

            candles = (r.json() or {}).get("data", {}).get("candles", [])
            total_received += len(candles)

            if not candles:
                continue

            rows = []
            for c in candles:
                try:
                    ts = datetime.fromisoformat(c[0])
                    o, h, l, cl = map(float, c[1:5])
                    v = int(c[5]) if c[5] else 0
                    rows.append((symbol, exchange, ts, o, h, l, cl, v, api_tf))
                except Exception:
                    continue

            with get_db_conn() as conn:
                with conn.cursor() as cur_db:
                    execute_batch(
                        cur_db,
                        """
                        INSERT INTO intraday_candles
                        (symbol, exchange, timestamp, open, high, low, close, volume, timeframe)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (symbol, exchange, timestamp, timeframe)
                        DO UPDATE SET
                            open=EXCLUDED.open,
                            high=EXCLUDED.high,
                            low=EXCLUDED.low,
                            close=EXCLUDED.close,
                            volume=EXCLUDED.volume
                        """,
                        rows,
                        page_size=500,
                    )

            total_inserted += len(rows)

        # ---------------- Final response ----------------
        return jsonify(
            {
                "status": "success",
                "symbol": symbol,
                "exchange": exchange,
                "timeframe": timeframe,
                "stored_tf": api_tf,
                "chunks": len(chunks),
                "inserted": total_inserted,
                "total": total_received,
                "from_date": from_date,
                "to_date": to_date,
            }
        )

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


from urllib.parse import quote


def detect_exchange(instrument_key: str) -> str:
    """Extract NSE/BSE cleanly from instrument key."""
    key = instrument_key.upper()
    if "NSE" in key:
        return "NSE"
    if "BSE" in key:
        return "BSE"
    return "UNKNOWN"


@app.route("/api/candles/daily", methods=["POST"])
def api_daily_candles():
    """
    Fetches DAILY candles from Upstox V3 and stores into daily_candles table.
    Correct format: /historical-candle/<instrument_key>/days/1/<end>/<start>
    """
    try:
        payload = request.json or {}

        symbol = payload.get("symbol", "").upper().strip()
        instrument_key = payload.get("instrument_key", "").strip()
        start_date = payload.get("start_date")
        end_date = payload.get("end_date")

        if not (symbol and instrument_key and start_date and end_date):
            return (
                jsonify(
                    {
                        "error": "symbol, instrument_key, start_date and end_date required"
                    }
                ),
                400,
            )

        # ---- Detect Exchange ----
        exchange = detect_exchange(instrument_key)

        # ---- Load Token ----
        tokens = load_saved_tokens()
        access_token = tokens.get("access_token")
        if not access_token:
            return jsonify({"error": "Missing Upstox access token"}), 401

        # ---- Encode Instrument Key ----
        encoded_key = quote(instrument_key, safe="")

        # ---- Correct API Format ----
        url = f"{UPSTOX_V3_BASE}/historical-candle/{encoded_key}/days/1/{end_date}/{start_date}"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }

        print(f"📡 Fetching DAILY: {url}")
        r = safe_requests.get(url, headers=headers, timeout=30)

        if r.status_code != 200:
            return (
                jsonify({"error": "Upstox API Error", "details": r.text}),
                r.status_code,
            )

        candles = (r.json() or {}).get("data", {}).get("candles", [])

        if not candles:
            return jsonify({"status": "success", "inserted": 0, "total": 0})

        rows = []
        for c in candles:
            try:
                ts = datetime.fromisoformat(c[0])
                # Upstox may return 6 or 7 fields → ignore OI safely
                o, h, l, cl, vol = map(float, c[1:6])
                rows.append((symbol, exchange, ts, o, h, l, cl, int(vol), "1D"))
            except Exception as e:
                print("⚠️ Candle skipped:", c, e)

        # ---- DB Insert ----
        sql = """
            INSERT INTO daily_candles
            (symbol, exchange, timestamp, open, high, low, close, volume, timeframe)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (symbol, exchange, timestamp)
            DO UPDATE SET
                open   = EXCLUDED.open,
                high   = EXCLUDED.high,
                low    = EXCLUDED.low,
                close  = EXCLUDED.close,
                volume = EXCLUDED.volume,
                timeframe = EXCLUDED.timeframe;
        """

        with get_db_conn() as conn:
            with conn.cursor() as cur:
                execute_batch(cur, sql, rows, page_size=300)

        return jsonify(
            {
                "status": "success",
                "symbol": symbol,
                "exchange": exchange,
                "inserted": len(rows),
                "total": len(candles),
            }
        )

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/indicators/daily", methods=["GET"])
def api_indicators_daily():
    try:
        symbol = request.args.get("symbol", "").upper().strip()
        exchange = request.args.get("exchange", "NSE").upper().strip()

        if not symbol:
            return jsonify({"error": "symbol is required"}), 400

        # -------- Fetch OHLC --------
        sql = """
            SELECT timestamp AS ts, open, high, low, close, volume
            FROM daily_candles
            WHERE symbol=%s AND exchange=%s
            ORDER BY timestamp ASC
        """
        with get_db_conn() as conn:
            df = pd.read_sql(sql, conn, params=[symbol, exchange])

        if df.empty:
            return jsonify({"error": "No candle data found"}), 404

        # -------- Normalize Data --------
        df["ts"] = pd.to_datetime(df["ts"])
        df = df.sort_values("ts").reset_index(drop=True)

        df[["open", "high", "low", "close", "volume"]] = df[
            ["open", "high", "low", "close", "volume"]
        ].apply(pd.to_numeric, errors="coerce")

        close, high, low, volume = df["close"], df["high"], df["low"], df["volume"]

        # -------- Minimum Candle Check --------
        if len(df) < 60:
            return (
                jsonify(
                    {
                        "warning": f"Only {len(df)} candles — indicators may be low quality."
                    }
                ),
                200,
            )

        # -------- Indicators --------
        df["ema_9"] = ta.trend.EMAIndicator(close, 9).ema_indicator()
        df["ema_21"] = ta.trend.EMAIndicator(close, 21).ema_indicator()
        df["ema_50"] = ta.trend.EMAIndicator(close, 50).ema_indicator()
        df["ema_200"] = ta.trend.EMAIndicator(close, 200).ema_indicator()

        df["rsi_14"] = ta.momentum.RSIIndicator(close, 14).rsi()

        macd = ta.trend.MACD(close)
        df["macd"], df["macd_signal"], df["macd_hist"] = (
            macd.macd(),
            macd.macd_signal(),
            macd.macd_diff(),
        )

        df["atr_14"] = ta.volatility.AverageTrueRange(
            high, low, close
        ).average_true_range()

        bb = ta.volatility.BollingerBands(close)
        df["bollinger_mid"] = bb.bollinger_mavg()
        df["bollinger_upper"] = bb.bollinger_hband()
        df["bollinger_lower"] = bb.bollinger_lband()

        df["true_range"] = pd.concat(
            [
                (high - low).abs(),
                (high - close.shift()).abs(),
                (low - close.shift()).abs(),
            ],
            axis=1,
        ).max(axis=1)

        # -------- Supertrend --------
        def compute_supertrend(df, period=10, multiplier=3):
            tr = pd.concat(
                [
                    (df["high"] - df["low"]).abs(),
                    (df["high"] - df["close"].shift()).abs(),
                    (df["low"] - df["close"].shift()).abs(),
                ],
                axis=1,
            ).max(axis=1)

            atr = tr.rolling(period).mean()
            hl2 = (df["high"] + df["low"]) / 2

            upper = hl2 + multiplier * atr
            lower = hl2 - multiplier * atr

            supertrend = [None] * len(df)
            direction = 1

            for i in range(1, len(df)):
                if df["close"].iloc[i] > upper.iloc[i - 1]:
                    direction = 1
                elif df["close"].iloc[i] < lower.iloc[i - 1]:
                    direction = -1
                supertrend[i] = upper.iloc[i] if direction == 1 else lower.iloc[i]

            return supertrend

        df["supertrend"] = compute_supertrend(df)

        # -------- Volume Indicators --------
        df["vwap"] = (close * volume).cumsum() / volume.cumsum()
        df["volume_sma_20"] = volume.rolling(20).mean()
        df["volume_sma_200"] = volume.rolling(200).mean()
        df["volume_ratio"] = (volume / df["volume_sma_20"]).replace(
            [np.inf, -np.inf], None
        )
        df["obv"] = ta.volume.OnBalanceVolumeIndicator(
            close, volume
        ).on_balance_volume()

        # -------- Signals --------
        df["signal"] = np.where(
            (close > df["supertrend"])
            & (df["ema_21"] > df["ema_50"])
            & (df["rsi_14"] > 55),
            "BUY",
            np.where(
                (close < df["supertrend"])
                & (df["ema_21"] < df["ema_50"])
                & (df["rsi_14"] < 45),
                "SELL",
                "NEUTRAL",
            ),
        )

        df["signal_strength"] = df["rsi_14"].fillna(0).round(2)
        df["supertrend_signal"] = df["signal"].map({"BUY": 1, "SELL": -1}).fillna(0)

        # -------- Fix Missing Values --------
        df.fillna(method="bfill", inplace=True)
        df.fillna(method="ffill", inplace=True)

        df = df.replace({np.nan: None})

        now = datetime.utcnow()

        # -------- UPSERT --------
        rows = [
            (
                symbol,
                exchange,
                "1D",
                row.ts,
                row.open,
                row.high,
                row.low,
                row.close,
                row.volume,
                row.ema_9,
                row.ema_21,
                row.ema_50,
                row.ema_200,
                row.supertrend,
                row.vwap,
                row.rsi_14,
                row.macd,
                row.macd_signal,
                row.macd_hist,
                row.atr_14,
                row.bollinger_mid,
                row.bollinger_upper,
                row.bollinger_lower,
                row.true_range,
                row.volume_sma_20,
                row.volume_sma_200,
                row.volume_ratio,
                row.obv,
                None,
                None,
                None,
                None,
                row.signal,
                row.signal_strength,
                row.supertrend_signal,
                now,
                now,
            )
            for row in df.itertuples()
        ]

        sql = """
        INSERT INTO indicators (
            symbol,exchange,timeframe,ts,open,high,low,close,volume,
            ema_9,ema_21,ema_50,ema_200,supertrend,vwap,
            rsi_14,macd,macd_signal,macd_hist,atr_14,
            bollinger_mid,bollinger_upper,bollinger_lower,true_range,
            volume_sma_20,volume_sma_200,volume_ratio,obv,
            orb_high,orb_low,orb_breakout,orb_breakdown,
            signal,signal_strength,supertrend_signal,
            created_at,updated_at
        )
        VALUES %s
        ON CONFLICT(symbol,exchange,timeframe,ts)
        DO UPDATE SET 
            ema_9=EXCLUDED.ema_9, ema_21=EXCLUDED.ema_21, ema_50=EXCLUDED.ema_50, ema_200=EXCLUDED.ema_200,
            rsi_14=EXCLUDED.rsi_14, macd=EXCLUDED.macd, macd_signal=EXCLUDED.macd_signal, macd_hist=EXCLUDED.macd_hist,
            atr_14=EXCLUDED.atr_14,
            bollinger_mid=EXCLUDED.bollinger_mid, bollinger_upper=EXCLUDED.bollinger_upper, bollinger_lower=EXCLUDED.bollinger_lower,
            supertrend=EXCLUDED.supertrend, supertrend_signal=EXCLUDED.supertrend_signal,
            vwap=EXCLUDED.vwap, volume_ratio=EXCLUDED.volume_ratio,
            signal=EXCLUDED.signal, signal_strength=EXCLUDED.signal_strength,
            updated_at=NOW();
        """

        with get_db_conn() as conn:
            with conn.cursor() as cur:
                execute_values(cur, sql, rows)

        return jsonify({"status": "SUCCESS", "rows": len(rows)})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


from flask import request, jsonify
import pandas as pd
import numpy as np
import ta
from psycopg2.extras import execute_values


def compute_supertrend(df, period=10, multiplier=3):
    """
    Calculates Supertrend using ATR.
    Returns two columns: supertrend & trend_direction (1=long, -1=short)
    """

    high = df["high"].astype(float)
    low = df["low"].astype(float)
    close = df["close"].astype(float)

    # True Range
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)

    atr = tr.rolling(period).mean()

    # Bands
    hl2 = (high + low) / 2
    upper_band = hl2 + multiplier * atr
    lower_band = hl2 - multiplier * atr

    supertrend = [np.nan] * len(df)
    trend = 1  # 1 = long | -1 = short

    for i in range(period, len(df)):
        if i == period:
            supertrend[i] = lower_band[i]
            continue

        if close[i] > upper_band[i - 1]:
            trend = 1
        elif close[i] < lower_band[i - 1]:
            trend = -1

        if trend == 1:
            supertrend[i] = max(lower_band[i], supertrend[i - 1])
        else:
            supertrend[i] = min(upper_band[i], supertrend[i - 1])

    df["supertrend"] = supertrend
    df["supertrend_signal"] = np.where(close > df["supertrend"], "BUY", "SELL")

    return df


@app.route("/api/indicators/intraday", methods=["GET"])
def api_indicators_intraday():
    try:
        symbol = request.args.get("symbol", "").upper().strip()
        timeframe = request.args.get("timeframe", "").lower().strip()
        exchange = request.args.get("exchange", "NSE").upper().strip()

        if not symbol or not timeframe:
            return jsonify({"error": "symbol & timeframe required"}), 400

        # Normalize timeframe
        TF_MAP = {
            "1": "1m",
            "3": "3m",
            "5": "5m",
            "15": "15m",
            "30": "30m",
            "60": "60m",
        }
        timeframe = TF_MAP.get(timeframe, timeframe)

        # Fetch candles
        sql = """
            SELECT timestamp AS ts, open, high, low, close, volume
            FROM intraday_candles
            WHERE symbol=%s AND timeframe=%s AND exchange=%s
            ORDER BY timestamp ASC
        """
        with get_db_conn() as conn:
            df = pd.read_sql(sql, conn, params=[symbol, timeframe, exchange])

        if df.empty:
            return jsonify({"error": "No data found"}), 404

        # **** FIX 1 → correct timestamp format explicitly ****
        df["ts"] = pd.to_datetime(df["ts"], format="%d/%m/%Y %H:%M", errors="coerce")
        df = df.dropna(subset=["ts"])
        df.sort_values("ts", inplace=True)

        close = df["close"].astype(float)
        high = df["high"].astype(float)
        low = df["low"].astype(float)
        volume = df["volume"].astype(float)

        # ==== Indicators ====

        df["rsi_14"] = ta.momentum.RSIIndicator(close, 14).rsi()

        df["ema_9"] = ta.trend.EMAIndicator(close, 9).ema_indicator()
        df["ema_21"] = ta.trend.EMAIndicator(close, 21).ema_indicator()
        df["ema_50"] = ta.trend.EMAIndicator(close, 50).ema_indicator()
        df["ema_200"] = ta.trend.EMAIndicator(close, 200).ema_indicator()

        macd = ta.trend.MACD(close)
        df["macd"] = macd.macd()
        df["macd_signal"] = macd.macd_signal()
        df["macd_hist"] = macd.macd_diff()

        atr = ta.volatility.AverageTrueRange(high, low, close, window=14)
        df["atr_14"] = atr.average_true_range()

        prev_close = close.shift(1)
        df["true_range"] = pd.concat(
            [(high - low).abs(), (high - prev_close).abs(), (low - prev_close).abs()],
            axis=1,
        ).max(axis=1)

        bb = ta.volatility.BollingerBands(close, 20, 2)
        df["bollinger_mid"] = bb.bollinger_mavg()
        df["bollinger_upper"] = bb.bollinger_hband()
        df["bollinger_lower"] = bb.bollinger_lband()

        # === SUPER TREND ===
        df = compute_supertrend(df)

        # After ts parsing
        df["date"] = df["ts"].dt.date

        # Replace VWAP block
        typical = (high + low + close) / 3
        df["vwap"] = (typical * volume).groupby(df["date"]).cumsum() / volume.groupby(
            df["date"]
        ).cumsum().replace(0, np.nan)

        # Volume Signals
        df["volume_sma_20"] = volume.rolling(20).mean()
        df["volume_sma_200"] = volume.rolling(200).mean()
        df["volume_ratio"] = df["volume"] / df["volume_sma_20"].replace(0, np.nan)

        # OBV
        df["obv"] = ta.volume.OnBalanceVolumeIndicator(
            close, volume
        ).on_balance_volume()

        # Convert UTC → IST
        df["ts"] = pd.to_datetime(df["ts"], errors="coerce")
        df["ts"] = df["ts"].dt.tz_convert("Asia/Kolkata")
        df = df.sort_values("ts")

        # ==== ORB FIXED LOGIC ====
        orb_start = dtime(9, 15)
        orb_end = dtime(9, 20)

        # Ensure timestamp is parsed correctly
        df["ts"] = pd.to_datetime(df["ts"], format="%d/%m/%Y %H:%M", errors="coerce")
        df = df.dropna(subset=["ts"])
        df.sort_values("ts", inplace=True)

        # Prepare ORB columns
        df["orb_high"] = np.nan
        df["orb_low"] = np.nan

        # Compute ORB per day (09:15–09:20 window)
        for current_date in df["ts"].dt.date.unique():
            day_rows = df[df["ts"].dt.date == current_date]

            window = day_rows[
                (day_rows["ts"].dt.time >= orb_start)
                & (day_rows["ts"].dt.time <= orb_end)
            ]

            if window.empty:
                continue

            high_val = window["high"].max()
            low_val = window["low"].min()

            df.loc[df["ts"].dt.date == current_date, "orb_high"] = high_val
            df.loc[df["ts"].dt.date == current_date, "orb_low"] = low_val

        # Forward fill ORB inside each day ONLY
        df["orb_high"] = df.groupby(df["ts"].dt.date)["orb_high"].ffill()
        df["orb_low"] = df.groupby(df["ts"].dt.date)["orb_low"].ffill()

        # ORB breakout / breakdown logic
        df["orb_breakout"] = df["close"] > df["orb_high"]
        df["orb_breakdown"] = df["close"] < df["orb_low"]

        # ==== Final Signal Engine ====
        df["supertrend_signal"] = np.where(df["close"] > df["supertrend"], "UP", "DOWN")

        df["signal"] = np.where(
            df["orb_breakout"], "BUY", np.where(df["orb_breakdown"], "SELL", "HOLD")
        )

        df["signal_strength"] = np.round(df["rsi_14"].fillna(50) / 2, 2)

        df = df.replace({np.nan: None})

        now = datetime.now()

        # ==== UPSERT (unchanged) ====
        rows = [
            (
                symbol,
                exchange,
                timeframe,
                row.ts,
                row.open,
                row.high,
                row.low,
                row.close,
                row.volume,
                row.ema_9,
                row.ema_21,
                row.ema_50,
                row.ema_200,
                row.supertrend,
                row.vwap,
                row.rsi_14,
                row.macd,
                row.macd_signal,
                row.macd_hist,
                row.atr_14,
                row.bollinger_mid,
                row.bollinger_upper,
                row.bollinger_lower,
                row.true_range,
                row.volume_sma_20,
                row.volume_sma_200,
                row.volume_ratio,
                row.obv,
                row.orb_high,
                row.orb_low,
                row.orb_breakout,
                row.orb_breakdown,
                row.signal,
                row.signal_strength,
                row.supertrend_signal,
                now,
                now,
            )
            for row in df.itertuples()
        ]

        sql_insert = """
        INSERT INTO indicators (
            symbol,exchange,timeframe,ts,open,high,low,close,volume,
            ema_9,ema_21,ema_50,ema_200,supertrend,vwap,
            rsi_14,macd,macd_signal,macd_hist,atr_14,
            bollinger_mid,bollinger_upper,bollinger_lower,true_range,
            volume_sma_20,volume_sma_200,volume_ratio,obv,
            orb_high,orb_low,orb_breakout,orb_breakdown,
            signal,signal_strength,supertrend_signal,
            created_at,updated_at
        )
        VALUES %s
        ON CONFLICT(symbol,exchange,timeframe,ts)
        DO UPDATE SET
            close=EXCLUDED.close,
            supertrend=EXCLUDED.supertrend,
            supertrend_signal=EXCLUDED.supertrend_signal,
            updated_at=NOW();
        """

        with get_db_conn() as conn:
            with conn.cursor() as cur:
                execute_values(cur, sql_insert, rows)

        return jsonify({"status": "SUCCESS", "rows": len(rows)})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/offline/label-market-context", methods=["POST"])
def offline_label_market_context():
    data = request.get_json()

    symbol = (data.get("symbol") or "").upper().strip()
    exchange = (data.get("exchange") or "NSE").upper().strip()
    timeframe = (data.get("timeframe") or "").lower().strip()

    lookahead = int(data.get("lookahead", 20))
    window = int(data.get("windowSize", 30))

    if not symbol or not timeframe:
        return jsonify({"error": "symbol and timeframe required"}), 400

    # =========================================================
    # LOAD INDICATORS
    # ========================================================
    with get_db_conn() as conn:
        df = pd.read_sql(
            """
            SELECT
                i.*,
                v.vix AS vix
            FROM indicators i
            LEFT JOIN india_vix v
              ON (
                   (i.ts AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date
                 ) = v.trade_date
            WHERE i.symbol = %s
              AND i.exchange = %s
              AND i.timeframe = %s
            ORDER BY i.ts ASC
        """,
            conn,
            params=[symbol, exchange, timeframe],
        )

    if df.empty or len(df) < lookahead + window:
        return jsonify({"error": "Not enough indicator data"}), 400

    df["ts"] = pd.to_datetime(df["ts"])
    df = df.reset_index(drop=True)

    # =========================================================
    # TIMEFRAME CONFIGURATION
    # =========================================================
    TF_MINUTES = {"1m": 1, "3m": 3, "5m": 5, "15m": 15}

    tf_min = TF_MINUTES.get(timeframe)
    if not tf_min:
        return jsonify({"error": f"Unsupported timeframe {timeframe}"}), 400

    # Candle index within the trading day (timeframe-aware)
    df["bar_of_day"] = (df["ts"].dt.hour * 60 + df["ts"].dt.minute - 555) // tf_min

    # Timeframe-scaled rolling windows
    ROLL_5 = max(2, int(5 / tf_min))
    ROLL_10 = max(3, int(10 / tf_min))
    ROLL_20 = max(5, int(20 / tf_min))

    # Session logic (behaviorally equivalent across TFs)
    EARLY_SESSION_BARS = int(45 / tf_min)
    IMPULSE_WINDOW_BARS = int(300 / tf_min)

    # Volume scaling (important for higher TFs)
    VOLUME_MULT = {"1m": 1.5, "3m": 1.4, "5m": 1.3, "15m": 1.2}[timeframe]

    # =========================================================
    # PRICE LOCATION CONTEXT
    # =========================================================
    df["date"] = df["ts"].dt.date
    df["vwap_dist_pct"] = (df["close"] - df["vwap"]) / df["vwap"]

    df["day_high"] = df.groupby("date")["high"].cummax()
    df["day_low"] = df.groupby("date")["low"].cummin()

    df["day_high_dist"] = (df["day_high"] - df["close"]) / df["day_high"]
    df["day_low_dist"] = (df["close"] - df["day_low"]) / df["day_low"]

    df["orb_range"] = (df["orb_high"] - df["orb_low"]).replace(0, np.nan)
    df["orb_mid"] = (df["orb_high"] + df["orb_low"]) / 2
    df["orb_dist_pct"] = (df["close"] - df["orb_mid"]) / df["orb_range"]

    daily_close = df.groupby("date")["close"].last().shift(1)
    df["prev_day_close"] = df["date"].map(daily_close)
    df["gap_pct"] = (df["open"] - df["prev_day_close"]) / df["prev_day_close"]
    df["gap_flag"] = (df["gap_pct"].abs() > 0.003).astype(int)

    # ================= GAP CONTEXT (SESSION-LEVEL) =================

    # Use previous day's ATR as normalization (robust)
    prev_day_atr = df.groupby("date")["atr_14"].last().shift(1)
    df["prev_day_atr"] = df["date"].map(prev_day_atr)

    df["gap_atr"] = np.where(
        df["prev_day_atr"] > 0,
        (df["open"] - df["prev_day_close"]) / df["prev_day_atr"],
        0,
    )

    df["gap_dir"] = np.select(
        [df["gap_atr"] > 0, df["gap_atr"] < 0], ["UP", "DOWN"], default="NONE"
    )

    df["gap_regime"] = np.select(
        [df["gap_atr"].abs() < 0.5, df["gap_atr"].abs() < 1.2],
        ["NO_GAP", "MODERATE_GAP"],
        default="LARGE_GAP",
    )

    # =========================================================
    # MARKET REGIME CONTEXT
    # =========================================================
    df["ema_21_slope"] = df["ema_21"].diff().rolling(ROLL_5).mean()
    df["ema_50_slope"] = df["ema_50"].diff().rolling(ROLL_5).mean()

    df["atr_pct"] = df["atr_14"] / df["close"]

    df["bb_width"] = (df["bollinger_upper"] - df["bollinger_lower"]) / df[
        "bollinger_mid"
    ]

    df["range_expansion"] = (
        df["true_range"] > df["true_range"].rolling(ROLL_5).mean()
    ).astype(int)

    # =========================================================
    # PARTICIPATION CONTEXT
    # =========================================================
    df["volume_z"] = (df["volume"] - df["volume"].rolling(ROLL_20).mean()) / df[
        "volume"
    ].rolling(ROLL_20).std()

    df["effort_result"] = df["volume"] * df["true_range"]

    # =========================================================
    # STRUCTURE & MOMENTUM QUALITY
    # =========================================================
    df["range_efficiency"] = (df["close"] - df["open"]).abs() / df[
        "true_range"
    ].replace(0, np.nan)

    df["volume_expansion"] = (
        df["volume"] > df["volume"].rolling(ROLL_20).mean() * VOLUME_MULT
    ).astype(int)

    df["atr_expanding"] = (df["atr_14"] > df["atr_14"].rolling(ROLL_10).mean()).astype(
        int
    )

    df["vwap_acceptance"] = (df["vwap_dist_pct"].abs() < 0.01).astype(int)

    df["momentum_decay"] = (
        df["range_efficiency"] < df["range_efficiency"].rolling(ROLL_10).mean()
    ).astype(int)

    df["candle_overlap"] = (
        df["high"].rolling(ROLL_5).min() < df["low"].rolling(ROLL_5).max()
    ).astype(int)

    # =========================================================
    # TIME CONTEXT
    # =========================================================
    df["minute_of_day"] = df["bar_of_day"] * tf_min

    df["session_bucket"] = np.select(
        [df["minute_of_day"] < 45, df["minute_of_day"] < 300], [0, 1], default=2
    )

    df["expiry_proximity"] = (
        df["ts"].dt.day >= (df["ts"].dt.days_in_month - 2)
    ).astype(int)

    # VIX level (forward-filled to handle holidays)
    if "vix" in df.columns:
        df["vix_level"] = df["vix"].ffill()
    else:
        df["vix_level"] = 0.0

    # Day-over-day VIX change (risk expansion / contraction)
    df["vix"] = df["vix_level"]
    df["vix_change"] = df["vix_level"].diff().fillna(0)

    # VIX regime (volatility environment)
    df["vix_regime"] = np.select(
        [df["vix_level"] < 12, df["vix_level"] < 18],
        ["LOW_VOL", "NORMAL_VOL"],
        default="HIGH_VOL",
    )

    # News / event placeholder (future use)
    df["news_flag"] = 0

    # ADX safety guard (trend strength proxy)
    if "adx_14" not in df.columns:
        df["adx_14"] = 0

    # =========================================================
    # CLEAN FEATURES
    # =========================================================
    FEATURE_COLS = [
        "vwap_dist_pct",
        "day_high_dist",
        "day_low_dist",
        "orb_dist_pct",
        "gap_pct",
        "gap_flag",
        "ema_21_slope",
        "ema_50_slope",
        "adx_14",
        "atr_pct",
        "bb_width",
        "range_expansion",
        "volume_z",
        "effort_result",
        "range_efficiency",
        "volume_expansion",
        "atr_expanding",
        "vwap_acceptance",
        "momentum_decay",
        "candle_overlap",
        "minute_of_day",
        "session_bucket",
        "expiry_proximity",
        "vix_level",
        "vix_change",
        "news_flag",
    ]

    for c in FEATURE_COLS:
        df[c] = df[c].replace([np.inf, -np.inf], np.nan).fillna(0)

    # =========================================================
    # MARKET PHASE + STATE MACHINE
    # =========================================================
    df["market_phase"] = "UNCLASSIFIED"

    df["session_context"] = None  # GAP or BALANCE
    df["gap_resolved"] = 0  # hard lock

    df["gap_auction_started"] = 0

    df["gap_auction_active"] = 0

    # =========================================================
    # SESSION CONTEXT INITIALIZATION (ONCE PER DAY)
    # =========================================================
    df.loc[df["bar_of_day"] == 0, "session_context"] = np.where(
        df.loc[df["bar_of_day"] == 0, "gap_regime"] == "LARGE_GAP", "GAP", "BALANCE"
    )

    # Forward-fill session context for rest of day
    df["session_context"] = df.groupby(df["date"])["session_context"].ffill()

    df.loc[df["bar_of_day"] == 0, "gap_auction_started"] = 0
    df.loc[df["bar_of_day"] == 0, "gap_auction_active"] = 0
    df.loc[df["bar_of_day"] == 0, "gap_resolved"] = 0

    # Max discovery window (time-based, TF aware)
    GAP_AUCTION_MAX_MINUTES = 90
    GAP_AUCTION_MAX_BARS = int(GAP_AUCTION_MAX_MINUTES / tf_min)

    # ---------- GAP AUCTION ENTRY ----------
    gap_auction_entry = (
        (df["session_context"] == "GAP")
        & (df["gap_resolved"] == 0)
        & (df["candle_overlap"] == 1)
        & (df["range_efficiency"] < 0.30)
        & (df["atr_expanding"] == 0)
    )

    # ---------- STRUCTURAL RESOLUTION ----------
    gap_auction_resolved_structural = (
        (df["range_efficiency"] > 0.45)
        & (df["atr_expanding"] == 1)
        & (df["vwap_dist_pct"].abs() > 0.004)
    )

    # ---------- FAILED RESOLUTION ----------
    gap_auction_failed = (
        (df["range_efficiency"] < 0.20)
        & (df["volume"] < df["volume"].rolling(ROLL_20).mean())
        & (df["vwap_acceptance"] == 1)
    )

    # ================= BASE MARKET CONTEXT =================
    balance_chop = (
        (df["range_efficiency"] < 0.25)
        & (df["atr_expanding"] == 0)
        & (df["vwap_dist_pct"].abs() < 0.003)
        & (df["ema_21_slope"].abs() < 0.0001)
    )

    trend_acceptance = (
        (df["ema_21_slope"] > 0)
        & (df["close"] > df["vwap"])
        & (
            (df["range_efficiency"] >= 0.20)
            | ((df["gap_regime"] == "LARGE_GAP") & (df["range_efficiency"] >= 0.15))
        )
        & (df["atr_expanding"] == 0)
    )

    compression = (
        (df["atr_pct"] < df["atr_pct"].rolling(ROLL_20).mean() * 0.7)
        & (df["bb_width"] < df["bb_width"].rolling(ROLL_20).mean() * 0.7)
        & (df["range_efficiency"] < 0.30)
    )

    # ================= BASE REGIMES (ONLY IF UNCLASSIFIED) =================
    df.loc[
        balance_chop
        & (df["market_phase"] == "UNCLASSIFIED")
        & (df["gap_auction_active"] == 0)
    ]

    df.loc[
        trend_acceptance & (df["market_phase"] == "UNCLASSIFIED"), "market_phase"
    ] = "TREND_ACCEPTANCE"

    df.loc[compression & (df["market_phase"] == "UNCLASSIFIED"), "market_phase"] = (
        "COMPRESSION"
    )

    # ================= TREND CONDITIONS =================
    trend_valid = (
        (df["ema_21_slope"] > 0)
        & (df["close"] > df["vwap"])
        & (df["range_efficiency"] > 0.35)
    )

    trend_pause = (
        (df["ema_21_slope"] > 0)
        & (df["close"] > df["ema_21"])
        & (df["range_efficiency"] >= 0.20)
        & (df["range_efficiency"] < 0.35)
        & (df["volume"] > df["volume"].rolling(ROLL_20).mean())
    )

    trend_digestion = (
        (df["range_efficiency"] >= 0.15)
        & (df["range_efficiency"] < 0.30)
        & (df["atr_expanding"] == 0)
        & (df["close"] > df["vwap"])
        & (df["ema_21_slope"] > 0)
    )

    # ================= ABSORPTION / DISTRIBUTION =================
    absorption = (
        (df["close"] > df["vwap"])
        & (df["volume"] > df["volume"].rolling(ROLL_20).mean())
        & (df["atr_expanding"] == 0)
        & (df["range_efficiency"] < 0.35)
        & (df["vwap_acceptance"] == 1)
    )

    absorption_break = (df["range_efficiency"] > 0.45) | (df["atr_expanding"] == 1)

    distribution = absorption & (
        (df["bb_width"] > df["bb_width"].rolling(ROLL_20).mean())
    )

    distribution_break = (df["close"] > df["vwap"]) | (df["range_efficiency"] > 0.45)

    # ================= IMPULSE (EVENT DETECTION) =================
    base_impulse = (
        (df["volume_expansion"] == 1)
        & (df["atr_expanding"] == 1)
        & (df["range_efficiency"] > 0.6)
        & (df["momentum_decay"] == 0)
        & (df["vwap_dist_pct"].abs() > 0.004)
    )

    base_impulse &= (df["bar_of_day"] < IMPULSE_WINDOW_BARS) | (
        df["volume"] > df["volume"].rolling(ROLL_20).mean() * 2
    )

    bullish_impulse = base_impulse & (
        (df["close"] > df["open"])
        & (df["close"] > df["ema_21"])
        & (df["ema_21_slope"] > 0)
        & (df["vwap_dist_pct"] > 0)
    )

    bearish_impulse = base_impulse & (
        (df["close"] < df["open"])
        & (df["close"] < df["ema_21"])
        & (df["ema_21_slope"] < 0)
        & (df["vwap_dist_pct"] < 0)
    )

    neutral_impulse = base_impulse & ~bullish_impulse & ~bearish_impulse

    digestion = (
        (df["atr_expanding"] == 0)
        & (df["range_efficiency"] >= 0.15)
        & (df["range_efficiency"] < 0.35)
        & (df["volume"] <= df["volume"].rolling(ROLL_20).mean() * 1.2)
    )

    # ================= IMPULSE ASSIGNMENT (ONLY IF UNCLASSIFIED) =================
    df.loc[bullish_impulse & (df["market_phase"] == "UNCLASSIFIED"), "market_phase"] = (
        "IMPULSE_BULL"
    )

    df.loc[bearish_impulse & (df["market_phase"] == "UNCLASSIFIED"), "market_phase"] = (
        "IMPULSE_BEAR"
    )

    df.loc[neutral_impulse & (df["market_phase"] == "UNCLASSIFIED"), "market_phase"] = (
        "IMPULSE_NEUTRAL"
    )

    # =========================================================
    # POST-IMPULSE STATE MACHINE (BEHAVIOURAL)
    # =========================================================
    df["post_impulse_active"] = 0
    df["post_impulse_story"] = None
    df["impulse_dir"] = None

    vol_ma20 = df["volume"].rolling(ROLL_20).mean()

    for i in range(1, len(df)):

        # =========================================================
        # GAP AUCTION — SESSION LOCKED
        # =========================================================

        # ENTER GAP AUCTION (ONLY ONCE, ONLY IN GAP SESSION)
        if (
            df.at[i, "session_context"] == "GAP"
            and df.at[i, "gap_resolved"] == 0
            and df.at[i, "gap_auction_started"] == 0
            and gap_auction_entry.iloc[i]
        ):
            df.at[i, "gap_auction_started"] = 1
            df.at[i, "gap_auction_active"] = 1
            df.at[i, "gap_auction_start_bar"] = df.at[i, "bar_of_day"]
            # DO NOT touch market_phase here
            continue

        # MANAGE GAP AUCTION (UNTIL RESOLUTION)
        if df.at[i - 1, "gap_auction_active"] == 1 and df.at[i, "gap_resolved"] == 0:
            start_bar = df.at[i - 1, "gap_auction_start_bar"]
            bars_elapsed = df.at[i, "bar_of_day"] - start_bar

            if gap_auction_resolved_structural.iloc[i]:
                df.at[i, "gap_auction_active"] = 0
                df.at[i, "gap_resolved"] = 1
                df.at[i, "session_context"] = "BALANCE"
                continue

            if gap_auction_failed.iloc[i]:
                df.at[i, "gap_auction_active"] = 0
                df.at[i, "gap_resolved"] = 1
                df.at[i, "session_context"] = "BALANCE"
                continue

            if bars_elapsed >= GAP_AUCTION_MAX_BARS:
                df.at[i, "gap_auction_active"] = 0
                df.at[i, "gap_resolved"] = 1
                df.at[i, "session_context"] = "BALANCE"
                continue

            df.at[i, "gap_auction_active"] = 1
            # market_phase continues untouched

        # =========================================================
        # AUCTION IMPULSE LABELING (OBSERVATION ONLY)
        # =========================================================
        if df.at[i, "gap_auction_active"] == 1:

            if bullish_impulse.iloc[i]:
                df.at[i, "market_phase"] = "AUCTION_IMPULSE_UP"

            elif bearish_impulse.iloc[i]:
                df.at[i, "market_phase"] = "AUCTION_IMPULSE_DOWN"

            elif neutral_impulse.iloc[i]:
                df.at[i, "market_phase"] = "AUCTION_IMPULSE_NEUTRAL"

            # Do NOT activate post-impulse logic
            # Do NOT change gap state

        # =========================================================
        # POST-GAP HARD LOCK (NO GAP CAN RETURN)
        # =========================================================
        if df.at[i - 1, "gap_resolved"] == 1:
            df.at[i, "gap_resolved"] = 1
            df.at[i, "session_context"] = "BALANCE"

        # -------- IMPULSE PERMISSION (SESSION AWARE) --------
        impulse_allowed = True

        if df.at[i, "gap_auction_active"] == 1:
            impulse_allowed = False

        # -------- ENTER / MAINTAIN POST-IMPULSE --------
        if impulse_allowed and bullish_impulse.iloc[i - 1]:
            df.at[i, "post_impulse_active"] = 1
            df.at[i, "impulse_dir"] = "BULL"
        elif impulse_allowed and bearish_impulse.iloc[i - 1]:
            df.at[i, "post_impulse_active"] = 1
            df.at[i, "impulse_dir"] = "BEAR"
        elif impulse_allowed and neutral_impulse.iloc[i - 1]:
            df.at[i, "post_impulse_active"] = 1
            df.at[i, "impulse_dir"] = "NEUTRAL"
        else:
            df.at[i, "post_impulse_active"] = df.at[i - 1, "post_impulse_active"]
            df.at[i, "impulse_dir"] = df.at[i - 1, "impulse_dir"]

        # -------- POST-IMPULSE BEHAVIOUR --------
        if df.at[i, "post_impulse_active"] == 1:

            impulse_dir = df.at[i, "impulse_dir"]

            if (
                df.at[i, "range_efficiency"] < 0.25
                and df.at[i, "atr_expanding"] == 0
                and (
                    (
                        impulse_dir == "BULL"
                        and df.at[i, "close"] < df.at[i - 1, "close"]
                    )
                    or (
                        impulse_dir == "BEAR"
                        and df.at[i, "close"] > df.at[i - 1, "close"]
                    )
                )
            ):
                df.at[i, "market_phase"] = "PULLBACK_FAIL"
                df.at[i, "post_impulse_story"] = "WEAK_PULLBACK"
                continue

            if (
                df.at[i, "volume"] > vol_ma20.iloc[i]
                and df.at[i, "atr_expanding"] == 0
                and df.at[i, "range_efficiency"] < 0.35
            ):
                df.at[i, "market_phase"] = "ABSORPTION"
                df.at[i, "post_impulse_story"] = "EFFORT_NO_PROGRESS"
                continue

            if (
                (impulse_dir == "BULL" and df.at[i, "close"] < df.at[i - 1, "low"])
                or (impulse_dir == "BEAR" and df.at[i, "close"] > df.at[i - 1, "high"])
                or (impulse_dir == "NEUTRAL" and df.at[i, "range_efficiency"] < 0.20)
            ):
                df.at[i, "market_phase"] = "REJECTION"
                df.at[i, "post_impulse_story"] = "STRUCTURAL_FAILURE"
                df.at[i, "post_impulse_active"] = 0
                continue

            if (
                df.at[i, "atr_expanding"] == 1
                and df.at[i, "range_efficiency"] > 0.50
                and (
                    (impulse_dir == "BULL" and df.at[i, "close"] > df.at[i - 1, "high"])
                    or (
                        impulse_dir == "BEAR"
                        and df.at[i, "close"] < df.at[i - 1, "low"]
                    )
                )
            ):
                df.at[i, "market_phase"] = "EXPANSION"
                df.at[i, "post_impulse_story"] = "CONTINUATION_CONFIRMED"
                df.at[i, "post_impulse_active"] = 0
                continue

            df.at[i, "market_phase"] = "POST_IMPULSE_DIGESTION"

        # -------- NORMAL TREND LOGIC --------
        prev_phase = df.at[i - 1, "market_phase"]

        if prev_phase in ("IMPULSE_BULL", "IMPULSE_BEAR", "TREND_CONTINUATION"):
            if trend_valid.iloc[i]:
                df.at[i, "market_phase"] = "TREND_CONTINUATION"
            elif trend_digestion.iloc[i]:
                df.at[i, "market_phase"] = "TREND_DIGESTION"
            elif trend_pause.iloc[i]:
                df.at[i, "market_phase"] = "TREND_PAUSE"
            else:
                df.at[i, "market_phase"] = "TREND_ACCEPTANCE"

        elif prev_phase == "TREND_DIGESTION":
            df.at[i, "market_phase"] = (
                "TREND_CONTINUATION" if trend_valid.iloc[i] else "TREND_DIGESTION"
            )

        elif prev_phase == "TREND_PAUSE":
            df.at[i, "market_phase"] = (
                "TREND_CONTINUATION" if trend_valid.iloc[i] else "TREND_PAUSE"
            )

        elif prev_phase == "GAP_BALANCE":
            df.at[i, "market_phase"] = (
                "TREND_ACCEPTANCE" if trend_valid.iloc[i] else "GAP_BALANCE"
            )

        elif prev_phase == "ABSORPTION" and not absorption_break.iloc[i]:
            df.at[i, "market_phase"] = "ABSORPTION"

        elif prev_phase == "DISTRIBUTION" and not distribution_break.iloc[i]:
            df.at[i, "market_phase"] = "DISTRIBUTION"

        elif df.at[i, "market_phase"] == "UNCLASSIFIED":
            if distribution.iloc[i]:
                df.at[i, "market_phase"] = "DISTRIBUTION"
            elif absorption.iloc[i]:
                df.at[i, "market_phase"] = "ABSORPTION"
            else:
                df.at[i, "market_phase"] = "BALANCE_CHOP"

    # =========================================================
    # ORB RULE LOGIC (LONG SIDE)
    # =========================================================
    df["orb_breakout"] = (
        (df["close"] > df["orb_high"]) & df["bar_of_day"] <= int(90 / tf_min)
    ).astype(int)

    df["orb_quality"] = (
        (df["volume_expansion"] == 1)
        & (df["atr_expanding"] == 1)
        & (df["range_efficiency"] > 0.45)
    ).astype(int)

    df["orb_location"] = (
        (df["close"] > df["ema_21"]) & (df["vwap_dist_pct"] > 0)
    ).astype(int)

    df["ORB"] = (
        (df["orb_breakout"] == 1) & (df["orb_quality"] == 1) & (df["orb_location"] == 1)
    ).astype(int)

    # =========================================================
    # DROP INITIAL WINDOW
    # =========================================================
    df = df.iloc[window:].reset_index(drop=True)

    now = datetime.utcnow()
    market_rows = []
    rule_rows = []

    for _, r in df.iterrows():
        market_rows.append(
            (
                symbol,
                exchange,
                timeframe,
                r["ts"],
                r["market_phase"],
                r["ema_21_slope"],
                r["vwap_dist_pct"],
                r["day_high_dist"],
                r["day_low_dist"],
                r["orb_dist_pct"],
                r["gap_pct"],
                r["minute_of_day"],
                r["volume_expansion"],
                r["atr_expanding"],
                r["range_efficiency"],
                r["vwap_acceptance"],
                r["momentum_decay"],
                r["candle_overlap"],
                r["vix"],
                r["vix_change"],
                r["vix_regime"],
                r["gap_atr"],
                r["gap_dir"],
                r["gap_regime"],
                now,
            )
        )

        rules = {
            "ORB": ((r["ORB"] == 1)),
            "EMA_TREND": ((r["ema_21_slope"] > 0) and (r["close"] > r["ema_21"])),
            "VWAP_TREND": ((r["vwap_dist_pct"] > 0) and (r["vwap_acceptance"] == 0)),
            "ATR_EXPANSION": (r["atr_expanding"] == 1),
            "VOLUME_EXPANSION": (
                (r["volume_expansion"] == 1) and (r["range_efficiency"] > 0.35)
            ),
        }

        for name, eligible in rules.items():
            rule_rows.append(
                (
                    symbol,  # symbol
                    exchange,  # exchange
                    timeframe,  # timeframe
                    r["ts"],  # ts
                    name,  # strategy_id
                    bool(eligible),  # rule_eligibility
                    json.dumps(
                        {
                            "orb_high": json_safe(r["orb_high"]),
                            "orb_low": json_safe(r["orb_low"]),
                            "orb_breakout": int(r["orb_breakout"]),
                            "orb_quality": int(r["orb_quality"]),
                            "orb_location": int(r["orb_location"]),
                            "minute_of_day": int(r["minute_of_day"]),
                            "ema_21_slope": json_safe(r["ema_21_slope"]),
                            "vwap_dist_pct": json_safe(r["vwap_dist_pct"]),
                            "atr_expanding": int(r["atr_expanding"]),
                            "volume_expansion": int(r["volume_expansion"]),
                            "range_efficiency": json_safe(r["range_efficiency"]),
                        }
                    ),
                    r["market_phase"],  # market_phase (final regime)
                    now,  # created_at
                )
            )

    with get_db_conn() as conn:
        with conn.cursor() as cur:

            execute_values(
                cur,
                """
                INSERT INTO market_context (
                    symbol, exchange, timeframe, ts,
                    market_phase,
                    ema_21_slope,
                    vwap_dist_pct, day_high_dist, day_low_dist,
                    orb_dist_pct, gap_pct, minute_of_day,
                    volume_expansion, atr_expanding,
                    range_efficiency, vwap_acceptance,
                    momentum_decay, candle_overlap,
                    vix,
                    vix_change,
                    vix_regime,
                    gap_atr,
                    gap_dir,
                    gap_regime,
                    created_at
                ) VALUES %s
                ON CONFLICT (symbol, exchange, timeframe, ts)
                DO UPDATE SET
                    market_phase = EXCLUDED.market_phase,
                    ema_21_slope = EXCLUDED.ema_21_slope,

                    vwap_dist_pct = EXCLUDED.vwap_dist_pct,
                    day_high_dist = EXCLUDED.day_high_dist,
                    day_low_dist = EXCLUDED.day_low_dist,
                    orb_dist_pct = EXCLUDED.orb_dist_pct,
                    gap_pct = EXCLUDED.gap_pct,
                    minute_of_day = EXCLUDED.minute_of_day,
                    volume_expansion = EXCLUDED.volume_expansion,
                    atr_expanding = EXCLUDED.atr_expanding,
                    range_efficiency = EXCLUDED.range_efficiency,
                    vwap_acceptance = EXCLUDED.vwap_acceptance,
                    momentum_decay = EXCLUDED.momentum_decay,
                    candle_overlap = EXCLUDED.candle_overlap,
                    vix = EXCLUDED.vix,
                    vix_change = EXCLUDED.vix_change,
                    vix_regime = EXCLUDED.vix_regime,
                    gap_atr     = EXCLUDED.gap_atr,
                    gap_dir     = EXCLUDED.gap_dir,
                    gap_regime  = EXCLUDED.gap_regime,

                    
                    created_at = EXCLUDED.created_at;
            """,
                market_rows,
            )

            execute_values(
                cur,
                """
                INSERT INTO rule_evaluations (
                    symbol,
                    exchange,
                    timeframe,
                    ts,
                    strategy_id,
                    rule_eligibility,
                    condition_snapshot,
                    market_phase,
                    created_at
                )
                VALUES %s
                ON CONFLICT (symbol, exchange, timeframe, ts, strategy_id)
                DO UPDATE SET
                    rule_eligibility   = EXCLUDED.rule_eligibility,
                    condition_snapshot = EXCLUDED.condition_snapshot,
                    market_phase       = EXCLUDED.market_phase,
                    created_at         = EXCLUDED.created_at;
            """,
                rule_rows,
            )

    return jsonify(
        {
            "status": "SUCCESS",
            "market_rows": len(market_rows),
            "rule_rows": len(rule_rows),
        }
    )


from datetime import datetime, timedelta
import pandas as pd
from flask import request, jsonify
from psycopg2.extras import execute_values


@app.route("/api/offline/calc-strategy-outcomes", methods=["POST"])
def calc_strategy_outcomes():
    import pandas as pd
    import json
    from datetime import datetime, timedelta
    from psycopg2.extras import execute_values

    data = request.get_json() or {}

    symbol = (data.get("symbol") or "").upper().strip()
    timeframe = (data.get("timeframe") or "").lower().strip()
    exchange = (data.get("exchange") or "NSE").upper().strip()

    to_dt = pd.to_datetime(data.get("to_date") or datetime.utcnow(), utc=True)
    from_dt = pd.to_datetime(
        data.get("from_date") or (to_dt - timedelta(days=180)), utc=True
    )

    if not symbol or not timeframe:
        return jsonify({"error": "symbol and timeframe required"}), 400

    # =====================================================
    # PHASE → OUTCOME MODEL (BEHAVIOURAL, DIRECTIONAL)
    # =====================================================
    PHASE_MODEL = {
        # ========= IMPULSE =========
        "IMPULSE_BULL": {"dir": "LONG", "tp": 1.2, "sl": 0.6, "lookahead": 4},
        "IMPULSE_BEAR": {"dir": "SHORT", "tp": 1.2, "sl": 0.6, "lookahead": 4},
        "IMPULSE_NEUTRAL": {"dir": "MEAN", "tp": 0.8, "sl": 0.6, "lookahead": 3},
        # ========= CONTINUATION =========
        "EXPANSION": {"dir": "FOLLOW", "tp": 1.0, "sl": 0.7, "lookahead": 6},
        # ========= POST-IMPULSE =========
        "DIGESTION": {"dir": "MEAN", "tp": 0.6, "sl": 0.6, "lookahead": 6},
        "PULLBACK_FAIL": {"dir": "FADE", "tp": 0.6, "sl": 0.5, "lookahead": 5},
        # ========= STRUCTURAL =========
        "TREND_CONTINUATION": {"dir": "LONG", "tp": 1.2, "sl": 0.8, "lookahead": 12},
        "TREND_ACCEPTANCE": {"dir": "LONG", "tp": 1.0, "sl": 0.8, "lookahead": 14},
        "TREND_PAUSE": {"dir": "LONG", "tp": 0.8, "sl": 0.7, "lookahead": 10},
        # ========= NON-TREND =========
        "BALANCE_CHOP": {"dir": "MEAN", "tp": 0.5, "sl": 0.5, "lookahead": 6},
        "COMPRESSION": {"dir": "BREAKOUT", "tp": 0.7, "sl": 0.5, "lookahead": 6},
        "ABSORPTION": {"dir": "FOLLOW", "tp": 0.8, "sl": 0.6, "lookahead": 8},
        "DISTRIBUTION": {"dir": "SHORT", "tp": 0.8, "sl": 0.6, "lookahead": 8},
    }

    # =====================================================
    # EXIT SIMULATION (CANDLE-TRUE, WORST CASE)
    # =====================================================
    def simulate_exit(entry, tp, sl, future):
        mfe, mae = 0.0, 0.0

        for idx, r in enumerate(future.itertuples(index=False), start=1):
            mfe = max(mfe, r.high - entry)
            mae = min(mae, r.low - entry)

            if r.low <= sl:
                return "SL_HIT", sl, r.ts, idx, mfe, mae

            if r.high >= tp:
                return "TP_HIT", tp, r.ts, idx, mfe, mae

        last = future.iloc[-1]
        return "TIME_EXIT", last.close, last.ts, len(future), mfe, mae

    try:
        with get_db_conn() as conn:

            # =====================================================
            # LOAD PRICE + MARKET CONTEXT
            # =====================================================
            df = pd.read_sql(
                """
                SELECT
                    i.ts, i.open, i.high, i.low, i.close, i.atr_14,
                    mc.market_phase, mc.minute_of_day,
                    mc.ema_21_slope, mc.vwap_dist_pct, mc.range_efficiency
                FROM indicators i
                JOIN market_context mc
                  ON i.symbol = mc.symbol
                 AND i.exchange = mc.exchange
                 AND i.timeframe = mc.timeframe
                 AND i.ts = mc.ts
                WHERE i.symbol=%s AND i.exchange=%s AND i.timeframe=%s
                  AND i.ts BETWEEN %s AND %s
                ORDER BY i.ts
            """,
                conn,
                params=[symbol, exchange, timeframe, from_dt, to_dt],
            )

            if df.empty:
                return jsonify({"error": "No data found"}), 400

            df["ts"] = pd.to_datetime(df["ts"], utc=True)
            df = df.sort_values("ts").reset_index(drop=True)

            # =====================================================
            # LOAD RULE EVALUATIONS
            # =====================================================
            rules_df = pd.read_sql(
                """
                SELECT ts, strategy_id, rule_eligibility, condition_snapshot
                FROM rule_evaluations
                WHERE symbol=%s AND exchange=%s AND timeframe=%s
                  AND ts BETWEEN %s AND %s
            """,
                conn,
                params=[symbol, exchange, timeframe, from_dt, to_dt],
            )

            rules_df["ts"] = pd.to_datetime(rules_df["ts"], utc=True)
            rules_df["strategy_id"] = rules_df["strategy_id"].str.upper().str.strip()

            rule_truth = (
                rules_df.drop_duplicates(["ts", "strategy_id"], keep="last")
                .set_index(["ts", "strategy_id"])["rule_eligibility"]
                .to_dict()
            )

            snapshots = (
                rules_df.dropna(subset=["condition_snapshot"])
                .drop_duplicates("ts")
                .set_index("ts")["condition_snapshot"]
                .apply(lambda x: x if isinstance(x, dict) else json.loads(x))
                .to_dict()
            )

            # =====================================================
            # GENERATE OUTCOMES
            # =====================================================
            rows = []
            now = datetime.utcnow()

            for i in range(len(df)):
                row = df.iloc[i]
                cfg = PHASE_MODEL.get(row.market_phase)

                if not cfg or i + cfg["lookahead"] >= len(df):
                    continue

                atr = float(row.atr_14)
                if atr <= 0:
                    continue

                entry = float(row.close)
                direction = cfg["dir"]

                if direction == "SHORT":
                    tp = entry - cfg["tp"] * atr
                    sl = entry + cfg["sl"] * atr
                else:
                    tp = entry + cfg["tp"] * atr
                    sl = entry - cfg["sl"] * atr

                future = df.iloc[i + 1 : i + 1 + cfg["lookahead"]]

                exit_reason, exit_price, exit_ts, exit_after, mfe, mae = simulate_exit(
                    entry, tp, sl, future
                )

                if exit_ts <= row.ts:
                    continue  # time-travel guard

                R = abs(entry - sl)
                mfe_r = mfe / R if R > 0 else 0.0
                mae_r = mae / R if R > 0 else 0.0

                if exit_reason == "TP_HIT":
                    realized_r = (tp - entry) / R
                elif exit_reason == "SL_HIT":
                    realized_r = -1.0
                else:
                    realized_r = (exit_price - entry) / R if R > 0 else 0.0

                exit_speed_ratio = exit_after / cfg["lookahead"]
                outcome_timing = (
                    "FAST"
                    if exit_speed_ratio <= 0.33
                    else "NORMAL" if exit_speed_ratio <= 0.66 else "LATE"
                )

                ts = row.ts
                snap = snapshots.get(ts, {})

                rows.append(
                    (
                        symbol,
                        exchange,
                        timeframe,
                        ts,
                        row.market_phase,
                        int(row.minute_of_day),
                        rule_truth.get((ts, "ORB"), False),
                        rule_truth.get((ts, "EMA_TREND"), False),
                        rule_truth.get((ts, "ATR_EXPANSION"), False),
                        rule_truth.get((ts, "VWAP_TREND"), False),
                        rule_truth.get((ts, "VOLUME_EXPANSION"), False),
                        row.ema_21_slope,
                        row.vwap_dist_pct,
                        atr,
                        row.range_efficiency,
                        int(snap.get("orb_quality", 0)),
                        int(snap.get("orb_location", 0)),
                        realized_r if rule_truth.get((ts, "ORB"), False) else None,
                        (
                            realized_r
                            if rule_truth.get((ts, "EMA_TREND"), False)
                            else None
                        ),
                        (
                            realized_r
                            if rule_truth.get((ts, "ATR_EXPANSION"), False)
                            else None
                        ),
                        (
                            realized_r
                            if rule_truth.get((ts, "VWAP_TREND"), False)
                            else None
                        ),
                        (
                            realized_r
                            if rule_truth.get((ts, "VOLUME_EXPANSION"), False)
                            else None
                        ),
                        exit_reason,
                        exit_ts,
                        mfe,
                        mae,
                        cfg["lookahead"],
                        now,
                        mfe_r,
                        mae_r,
                        realized_r,
                        exit_after,
                        exit_speed_ratio,
                        outcome_timing,
                    )
                )

            if not rows:
                return jsonify({"error": "No outcomes generated"}), 400

            # =====================================================
            # UPSERT (UPDATE + INSERT)
            # =====================================================
            with conn.cursor() as cur:
                execute_values(
                    cur,
                    """
                    INSERT INTO strategy_outcomes (
                        symbol, exchange, timeframe, ts,
                        market_phase, minute_of_day,
                        orb_fired, ema_trend_fired, atr_expansion_fired,
                        vwap_trend_fired, volume_expansion_fired,
                        ema_21_slope, vwap_dist_pct, atr_14,
                        range_efficiency, orb_quality, orb_location,
                        orb_outcome, ema_trend_outcome,
                        atr_expansion_outcome, vwap_trend_outcome,
                        volume_expansion_outcome,
                        exit_reason, exit_ts,
                        mfe, mae,
                        lookahead_candles, created_at,
                        mfe_r, mae_r, realized_r,
                        exit_after_candles, exit_speed_ratio, outcome_timing
                    )
                    VALUES %s
                    ON CONFLICT (symbol, exchange, timeframe, ts)
                    DO UPDATE SET
                        market_phase            = EXCLUDED.market_phase,
                        minute_of_day           = EXCLUDED.minute_of_day,
                        orb_fired               = EXCLUDED.orb_fired,
                        ema_trend_fired         = EXCLUDED.ema_trend_fired,
                        atr_expansion_fired     = EXCLUDED.atr_expansion_fired,
                        vwap_trend_fired        = EXCLUDED.vwap_trend_fired,
                        volume_expansion_fired  = EXCLUDED.volume_expansion_fired,
                        ema_21_slope             = EXCLUDED.ema_21_slope,
                        vwap_dist_pct            = EXCLUDED.vwap_dist_pct,
                        atr_14                   = EXCLUDED.atr_14,
                        range_efficiency         = EXCLUDED.range_efficiency,
                        orb_quality              = EXCLUDED.orb_quality,
                        orb_location             = EXCLUDED.orb_location,
                        orb_outcome              = EXCLUDED.orb_outcome,
                        ema_trend_outcome        = EXCLUDED.ema_trend_outcome,
                        atr_expansion_outcome    = EXCLUDED.atr_expansion_outcome,
                        vwap_trend_outcome       = EXCLUDED.vwap_trend_outcome,
                        volume_expansion_outcome = EXCLUDED.volume_expansion_outcome,
                        exit_reason              = EXCLUDED.exit_reason,
                        exit_ts                  = EXCLUDED.exit_ts,
                        mfe                      = EXCLUDED.mfe,
                        mae                      = EXCLUDED.mae,
                        lookahead_candles        = EXCLUDED.lookahead_candles,
                        mfe_r                    = EXCLUDED.mfe_r,
                        mae_r                    = EXCLUDED.mae_r,
                        realized_r               = EXCLUDED.realized_r,
                        exit_after_candles       = EXCLUDED.exit_after_candles,
                        exit_speed_ratio         = EXCLUDED.exit_speed_ratio,
                        outcome_timing           = EXCLUDED.outcome_timing,
                        created_at               = EXCLUDED.created_at
                """,
                    rows,
                )

            conn.commit()

        return jsonify({"status": "SUCCESS", "rows_written": len(rows)})

    except Exception as e:
        app.logger.exception("Strategy outcome computation failed")
        return jsonify({"error": "internal_error", "message": str(e)}), 500


@app.route("/api/market-context/rule-stats", methods=["GET"])
def get_rule_stats():
    import pandas as pd

    symbol = (request.args.get("symbol") or "").upper().strip()
    timeframe = (request.args.get("timeframe") or "").lower().strip()

    if not symbol or not timeframe:
        return jsonify({"error": "symbol and timeframe required"}), 400

    with get_db_conn() as conn:
        df = pd.read_sql(
            """
            SELECT
                ts,
                orb_outcome,
                ema_outcome,
                atr_outcome,
                vwap_outcome,
                bb_outcome,
                exit_reason
            FROM strategy_outcomes
            WHERE symbol=%s AND timeframe=%s
            ORDER BY ts
        """,
            conn,
            params=[symbol, timeframe],
        )

    if df.empty:
        return jsonify(
            {
                "symbol": symbol,
                "timeframe": timeframe,
                "test_period": None,
                "months_tested": 0,
                "rules": [],
            }
        )

    # -------------------------
    # TIME METADATA
    # -------------------------
    df["ts"] = pd.to_datetime(df["ts"])
    test_start = df["ts"].min()
    test_end = df["ts"].max()

    df["year_month"] = df["ts"].dt.to_period("M").astype(str)
    months_tested = sorted(df["year_month"].unique().tolist())

    # -------------------------
    # RULE STATS FUNCTION
    # -------------------------
    def stats(col):
        s = df[col].dropna()
        if s.empty:
            return {
                "samples": 0,
                "success_rate": 0,
                "failure_rate": 0,
                "chop_rate": 0,
                "extended_rate": 0,
            }

        total = len(s)

        return {
            "samples": total,
            "success_rate": round((s == 1).sum() / total, 3),
            "failure_rate": round((s == -1).sum() / total, 3),
            "chop_rate": round((s == 0).sum() / total, 3),
            "extended_rate": round(
                (
                    df.loc[s.index, "exit_reason"]
                    .isin(["TRAIL_SL_HIT", "STRUCTURE_EXIT"])
                    .sum()
                )
                / total,
                3,
            ),
        }

    # -------------------------
    # RESPONSE
    # -------------------------
    return jsonify(
        {
            "symbol": symbol,
            "timeframe": timeframe,
            "test_period": {"from": test_start.isoformat(), "to": test_end.isoformat()},
            "months_tested": {"count": len(months_tested), "list": months_tested},
            "rules": [
                {"name": "ORB", **stats("orb_outcome")},
                {"name": "EMA_TREND", **stats("ema_outcome")},
                {"name": "ATR_EXPANSION", **stats("atr_outcome")},
                {"name": "VWAP_TREND", **stats("vwap_outcome")},
                {"name": "BB_EXPANSION", **stats("bb_outcome")},
            ],
        }
    )


NUM_FEATURES = [
    "minute_of_day",
    "ema_21_slope",
    "vwap_dist_pct",
    "atr_14",
    "range_efficiency",
]

RULE_FEATURES = [
    "orb_fired",
    "ema_trend_fired",
    "atr_expansion_fired",
    "vwap_trend_fired",
    "volume_expansion_fired",
]

CAT_FEATURES = ["market_phase"]

RULES = {
    "ORB": "orb_fired",
    "EMA_TREND": "ema_trend_fired",
    "VWAP_TREND": "vwap_trend_fired",
    "ATR_EXPANSION": "atr_expansion_fired",
    "VOLUME_EXPANSION": "volume_expansion_fired",
}


def get_engine():
    return create_engine(
        f"postgresql+psycopg2://{os.getenv('PGUSER')}:{os.getenv('PGPASSWORD')}"
        f"@{os.getenv('PGHOST')}:{os.getenv('PGPORT')}/{os.getenv('PGDATABASE')}"
    )


@app.route("/api/train-pipeline", methods=["POST"])
def train_pipeline():
    data = request.get_json() or {}
    symbol = data.get("symbol")
    timeframe = data.get("timeframe")

    if not symbol or not timeframe:
        return jsonify({"error": "symbol and timeframe required"}), 400

    engine = get_engine()

    results = {}

    for rule_name, rule_col in RULES.items():
        results[rule_name] = {
            "edge_gate": train_edge_gate(
                symbol, timeframe, rule_name, rule_col, engine
            ),
            "context_expectancy": train_context_expectancy(
                symbol, timeframe, rule_name, rule_col, engine
            ),
            "edge_decay": train_edge_decay(
                symbol, timeframe, rule_name, rule_col, engine
            ),
        }

    return jsonify(
        {
            "status": "SUCCESS",
            "symbol": symbol,
            "timeframe": timeframe,
            "rules": results,
        }
    )


def train_edge_gate(symbol, timeframe, rule_name, rule_col, engine):
    import pandas as pd, lightgbm as lgb, joblib, os
    from datetime import datetime
    from sqlalchemy import text
    from sklearn.pipeline import Pipeline
    from sklearn.compose import ColumnTransformer
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.metrics import roc_auc_score

    sql = f"""
    SELECT
        so.ts,
        mc.market_phase,
        mc.minute_of_day,
        so.ema_21_slope,
        so.vwap_dist_pct,
        so.atr_14,
        so.range_efficiency,
        CASE WHEN so.realized_r > 0 THEN 1 ELSE 0 END AS label
    FROM strategy_outcomes so
    JOIN market_context mc
      ON so.symbol = mc.symbol
     AND so.timeframe = mc.timeframe
     AND so.ts = mc.ts
    WHERE so.symbol = %(symbol)s
      AND so.timeframe = %(timeframe)s
      AND so.{rule_col} IS TRUE
      AND so.exit_reason IN ('TP_HIT','SL_HIT')
    ORDER BY so.ts
    """

    df = pd.read_sql(
        sql,
        engine,
        params={"symbol": symbol, "timeframe": timeframe},
        parse_dates=["ts"],
    )
    if len(df) < 500:
        return {"status": "FAILED", "reason": "Insufficient data"}

    train_df = df[df.ts < "2025-12-01"]
    test_df = df[df.ts >= "2025-12-01"]

    X_train, y_train = train_df.drop(columns=["ts", "label"]), train_df["label"]
    X_test, y_test = test_df.drop(columns=["ts", "label"]), test_df["label"]

    prep = ColumnTransformer(
        [
            ("num", "passthrough", NUM_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
        ]
    )

    model = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.04, random_state=42)
    pipe = Pipeline([("prep", prep), ("model", model)])
    pipe.fit(X_train, y_train)

    auc = roc_auc_score(y_test, pipe.predict_proba(X_test)[:, 1])

    os.makedirs("models", exist_ok=True)
    path = f"models/edge_gate_{rule_name}_{symbol}_{timeframe}_{datetime.utcnow():%Y%m%d_%H%M}.pkl"
    joblib.dump(pipe, path)

    # 🔽 SAVE TO DB
    with engine.begin() as conn:
        conn.execute(
            text(
                """
            INSERT INTO ml_model_runs
            (symbol, timeframe, model_type,
             trained_at, train_from, train_to, test_from, test_to,
             rows_used, auc, model_path)
            VALUES
            (:symbol, :tf, :model_type,
             :trained_at, :train_from, :train_to, :test_from, :test_to,
             :rows, :auc, :path)
        """
            ),
            {
                "symbol": symbol,
                "tf": timeframe,
                "model_type": f"edge_gate:{rule_name}",
                "trained_at": datetime.utcnow(),
                "train_from": train_df.ts.min(),
                "train_to": train_df.ts.max(),
                "test_from": test_df.ts.min(),
                "test_to": test_df.ts.max(),
                "rows": len(df),
                "auc": auc,
                "path": path,
            },
        )

    return {
        "status": "SUCCESS",
        "rule": rule_name,
        "auc": round(auc, 4),
        "recommended_threshold": 0.6,
        "model_path": path,
    }


def train_context_expectancy(symbol, timeframe, rule_name, rule_col, engine):
    import pandas as pd, lightgbm as lgb, joblib
    from datetime import datetime
    from sqlalchemy import text
    from sklearn.pipeline import Pipeline
    from sklearn.compose import ColumnTransformer
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.metrics import root_mean_squared_error

    sql = f"""
    SELECT
        so.ts,
        mc.market_phase,
        mc.minute_of_day,
        so.ema_21_slope,
        so.vwap_dist_pct,
        so.atr_14,
        so.range_efficiency,
        so.realized_r
    FROM strategy_outcomes so
    JOIN market_context mc
      ON so.symbol = mc.symbol
     AND so.timeframe = mc.timeframe
     AND so.ts = mc.ts
    WHERE so.symbol = %(symbol)s
      AND so.timeframe = %(timeframe)s
      AND so.{rule_col} IS TRUE
      AND so.realized_r IS NOT NULL
    ORDER BY so.ts
    """

    df = pd.read_sql(
        sql,
        engine,
        params={"symbol": symbol, "timeframe": timeframe},
        parse_dates=["ts"],
    )
    if len(df) < 500:
        return {"status": "FAILED", "reason": "Insufficient data"}

    train_df = df[df.ts < "2025-12-01"]
    test_df = df[df.ts >= "2025-12-01"]

    X_train, y_train = (
        train_df.drop(columns=["ts", "realized_r"]),
        train_df["realized_r"],
    )
    X_test, y_test = test_df.drop(columns=["ts", "realized_r"]), test_df["realized_r"]

    prep = ColumnTransformer(
        [
            ("num", "passthrough", NUM_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
        ]
    )

    model = lgb.LGBMRegressor(n_estimators=600, learning_rate=0.02, random_state=42)
    pipe = Pipeline([("prep", prep), ("model", model)])
    pipe.fit(X_train, y_train)

    rmse = root_mean_squared_error(y_test, pipe.predict(X_test))

    path = f"models/context_expectancy_{rule_name}_{symbol}_{timeframe}_{datetime.utcnow():%Y%m%d_%H%M}.pkl"
    joblib.dump(pipe, path)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
            INSERT INTO ml_model_runs
            (symbol, timeframe, model_type,
             trained_at, train_from, train_to, test_from, test_to,
             rows_used, model_path)
            VALUES
            (:symbol, :tf, :model_type,
             :trained_at, :train_from, :train_to, :test_from, :test_to,
             :rows, :path)
        """
            ),
            {
                "symbol": symbol,
                "tf": timeframe,
                "model_type": f"context_expectancy:{rule_name}",
                "trained_at": datetime.utcnow(),
                "train_from": train_df.ts.min(),
                "train_to": train_df.ts.max(),
                "test_from": test_df.ts.min(),
                "test_to": test_df.ts.max(),
                "rows": len(df),
                "path": path,
            },
        )

    return {"status": "SUCCESS", "rmse": round(rmse, 4), "model_path": path}


def train_edge_decay(symbol, timeframe, rule_name, rule_col, engine):
    import pandas as pd, lightgbm as lgb, joblib
    from datetime import datetime
    from sqlalchemy import text
    from sklearn.pipeline import Pipeline
    from sklearn.compose import ColumnTransformer
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.metrics import root_mean_squared_error

    sql = f"""
    SELECT
        so.ts,
        mc.market_phase,
        mc.minute_of_day,
        so.ema_21_slope,
        so.vwap_dist_pct,
        so.atr_14,
        so.range_efficiency,
        (
            AVG(so.realized_r) OVER (ORDER BY so.ts ROWS BETWEEN 3 PRECEDING AND CURRENT ROW)
          - AVG(so.realized_r) OVER (ORDER BY so.ts ROWS BETWEEN 6 PRECEDING AND 4 PRECEDING)
        ) AS edge_velocity
    FROM strategy_outcomes so
    JOIN market_context mc
      ON so.symbol = mc.symbol
     AND so.timeframe = mc.timeframe
     AND so.ts = mc.ts
    WHERE so.symbol = %(symbol)s
      AND so.timeframe = %(timeframe)s
      AND so.{rule_col} IS TRUE
      AND so.realized_r IS NOT NULL
    ORDER BY so.ts
    """

    df = pd.read_sql(
        sql,
        engine,
        params={"symbol": symbol, "timeframe": timeframe},
        parse_dates=["ts"],
    ).dropna()
    if len(df) < 500:
        return {"status": "FAILED", "reason": "Insufficient data"}

    train_df = df[df.ts < "2025-12-01"]
    test_df = df[df.ts >= "2025-12-01"]

    X_train, y_train = (
        train_df.drop(columns=["ts", "edge_velocity"]),
        train_df["edge_velocity"],
    )
    X_test, y_test = (
        test_df.drop(columns=["ts", "edge_velocity"]),
        test_df["edge_velocity"],
    )

    prep = ColumnTransformer(
        [
            ("num", "passthrough", NUM_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
        ]
    )

    model = lgb.LGBMRegressor(n_estimators=500, learning_rate=0.02, random_state=42)
    pipe = Pipeline([("prep", prep), ("model", model)])
    pipe.fit(X_train, y_train)

    rmse = root_mean_squared_error(y_test, pipe.predict(X_test))

    path = f"models/edge_decay_{rule_name}_{symbol}_{timeframe}_{datetime.utcnow():%Y%m%d_%H%M}.pkl"
    joblib.dump(pipe, path)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
            INSERT INTO ml_model_runs
            (symbol, timeframe, model_type,
             trained_at, train_from, train_to, test_from, test_to,
             rows_used, model_path)
            VALUES
            (:symbol, :tf, :model_type,
             :trained_at, :train_from, :train_to, :test_from, :test_to,
             :rows, :path)
        """
            ),
            {
                "symbol": symbol,
                "tf": timeframe,
                "model_type": f"edge_decay:{rule_name}",
                "trained_at": datetime.utcnow(),
                "train_from": train_df.ts.min(),
                "train_to": train_df.ts.max(),
                "test_from": test_df.ts.min(),
                "test_to": test_df.ts.max(),
                "rows": len(df),
                "path": path,
            },
        )

    return {"status": "SUCCESS", "rmse": round(rmse, 4), "model_path": path}


from flask import request, jsonify
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.metrics import accuracy_score, classification_report
import tensorflow as tf
import os

MODEL_DIR = "models"
os.makedirs(MODEL_DIR, exist_ok=True)


import numpy as np
import joblib
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.metrics import accuracy_score, root_mean_squared_error

from sklearn.impute import SimpleImputer


import base64
import pickle


###############################################################################
# 🔥 REDIS LIVE CANDLE STORAGE + LOADER
###############################################################################


def redis_store_candle(symbol: str, timeframe: str, candle: dict, max_len: int = 600):
    """
    Store the latest 1-minute live candle into Redis list.
    Auto-trim to fixed length for efficient ML prediction.
    """
    key = f"live:{symbol}:{timeframe}"
    if not REDIS_ENABLED:
        return False

    redis_client.lpush(key, json.dumps(candle))
    redis_client.ltrim(key, 0, max_len - 1)
    return True


def redis_load_candles(symbol: str, timeframe: str, limit: int = 500):
    """
    Load last N candles from Redis and convert to pandas DataFrame.
    """
    key = f"live:{symbol}:{timeframe}"
    if not REDIS_ENABLED:
        return pd.DataFrame()

    raw = redis_client.lrange(key, 0, limit - 1)
    if not raw:
        return pd.DataFrame()

    records = [json.loads(x) for x in raw]
    df = pd.DataFrame(records)

    # Fix timestamp
    def fix_ts(x):
        try:
            if str(x).isdigit():
                return pd.to_datetime(int(x), unit="ms")
            return pd.to_datetime(x)
        except:
            return pd.NaT

    df["ts"] = df["ts"].apply(fix_ts)
    df = df.sort_values("ts").reset_index(drop=True)
    return df


def redis_store_candle(symbol: str, timeframe: str, candle: dict):
    import json
    from datetime import datetime
    from zoneinfo import ZoneInfo

    IST = ZoneInfo("Asia/Kolkata")

    ts = int(candle["ts"])
    dt = datetime.fromtimestamp(ts / 1000, IST)

    if dt.date() != datetime.now(IST).date():
        return

    trade_date = dt.date().isoformat()
    key = f"candles:{symbol}:{timeframe}:{trade_date}"

    # 🔒 TIME-SERIES SAFE STORAGE
    redis_client.zadd(key, {json.dumps(candle): ts})


def bootstrap_indicators(symbol: str, timeframe="1m"):
    df = redis_load_candles(symbol, timeframe)
    if df.empty:
        return False

    df = df.sort_values("ts").reset_index(drop=True)

    ind_key = f"live:{symbol}:{timeframe}:indicators"
    redis_client.delete(ind_key)

    print(f"[INDICATORS] Bootstrapping {len(df)} candles")

    for i in range(len(df)):
        # Temporarily limit visible candles
        redis_client.set(
            f"_bootstrap_limit:{symbol}:{timeframe}", int(df.iloc[i]["ts"])
        )

        compute_and_store_last_n_indicators(symbol, timeframe, n=1)

    redis_client.delete(f"_bootstrap_limit:{symbol}:{timeframe}")
    print("[INDICATORS] Bootstrap completed")

    return True


def redis_load_candles(symbol, timeframe="1m", limit=1200):
    import json
    import pandas as pd
    from datetime import date

    today = date.today().isoformat()
    key = f"candles:{symbol}:{timeframe}:{today}"

    raw = redis_client.zrange(key, 0, -1)
    if not raw:
        return pd.DataFrame()

    candles = []
    for r in raw[-limit:]:
        try:
            candles.append(json.loads(r))
        except Exception:
            continue

    df = pd.DataFrame(candles)
    if df.empty:
        return df

    # ==================================================
    # 🔒 BOOTSTRAP LIMIT FILTER (ADD THIS BLOCK)
    # ==================================================
    limit_key = f"_bootstrap_limit:{symbol}:{timeframe}"
    limit_ts = redis_client.get(limit_key)

    if limit_ts is not None:
        try:
            limit_ts = int(limit_ts)
            df = df[df["ts"] <= limit_ts]
        except Exception:
            pass
    # ==================================================

    return df


def minute_bucket(ts_ms: int) -> int:
    return (ts_ms // 60000) * 60000


def candle_worker(symbol: str, feed_key: str):
    import json
    from datetime import datetime, time as dtime, date
    from zoneinfo import ZoneInfo

    IST = ZoneInfo("Asia/Kolkata")
    today = date.today()

    MARKET_START = dtime(9, 15)
    MARKET_LAST_CANDLE = dtime(15, 29)
    MARKET_HARD_CLOSE = dtime(15, 30)

    print(f"[CANDLE] Engine started for {symbol} ({today})")

    # ==========================================================
    # ======================= BACKFILL =========================
    # ==========================================================
    last_closed_ts = None

    tick_key = f"ticks:{today.isoformat()}:{feed_key}"
    raw_items = redis_client.lrange(tick_key, 0, -1)

    print(f"[CANDLE] Backfill ticks: {len(raw_items)}")

    backfill = []

    for raw in raw_items:
        try:
            msg = json.loads(raw)
        except Exception:
            continue

        feeds = msg.get("data", {}).get("feeds", {})
        if feed_key not in feeds:
            continue

        ff = feeds[feed_key]["fullFeed"]["marketFF"]
        ohlc = ff.get("marketOHLC", {}).get("ohlc", [])
        i1 = next((x for x in ohlc if x.get("interval") == "I1"), None)
        if not i1 or "ts" not in i1:
            continue

        backfill.append((int(i1["ts"]), i1))

    backfill.sort(key=lambda x: x[0])

    for ts, i1 in backfill:
        dt = datetime.fromtimestamp(ts / 1000, IST)

        if dt.date() != today:
            continue
        if dt.time() < MARKET_START or dt.time() > MARKET_LAST_CANDLE:
            continue
        if last_closed_ts and ts <= last_closed_ts:
            continue

        last_closed_ts = ts

        candle = {
            "ts": ts,
            "ts_ist": dt.strftime("%Y-%m-%d %H:%M:%S"),
            "open": float(i1["open"]),
            "high": float(i1["high"]),
            "low": float(i1["low"]),
            "close": float(i1["close"]),
            "volume": float(i1.get("vol", 0)),
        }

        redis_store_candle(symbol, "1m", candle)
        print(f"[BACKFILL] {symbol} {dt.strftime('%H:%M')}")

    # 🔥 Bootstrap indicators ONCE
    bootstrap_indicators(symbol, "1m")

    print("[CANDLE] Backfill completed → LIVE mode")

    # ==========================================================
    # ======================== LIVE =============================
    # ==========================================================
    pubsub = redis_client.pubsub(ignore_subscribe_messages=True)
    pubsub.subscribe("ticks:live")

    print("[CANDLE] Subscribed to LIVE ticks: ticks:live")

    last_minute_bucket = None
    last_ohlc_snapshot = None

    # 🔒 NON-BLOCKING LOOP (CRITICAL FIX)
    while True:

        # -------- HARD MARKET CLOSE --------
        now_ist = datetime.now(IST)
        if now_ist.time() >= MARKET_HARD_CLOSE:
            print("[CANDLE] Market closed — stopping candle worker")
            break

        message = pubsub.get_message(timeout=1.0)
        if not message:
            continue

        if message["type"] != "message":
            continue

        try:
            msg = json.loads(message["data"])
        except Exception:
            continue

        feeds = msg.get("data", {}).get("feeds", {})
        if feed_key not in feeds:
            continue

        ff = feeds[feed_key]["fullFeed"]["marketFF"]

        # -------- LTT (REAL CLOCK) --------
        ltpc = ff.get("ltpc")
        if not ltpc or "ltt" not in ltpc:
            continue

        ltt = int(ltpc["ltt"])
        tick_dt = datetime.fromtimestamp(ltt / 1000, IST)

        if tick_dt.date() != today:
            continue
        if tick_dt.time() < MARKET_START or tick_dt.time() > MARKET_LAST_CANDLE:
            continue

        current_bucket = minute_bucket(ltt)

        # -------- EXCHANGE OHLC SNAPSHOT --------
        ohlc = ff.get("marketOHLC", {}).get("ohlc", [])
        i1 = next((x for x in ohlc if x.get("interval") == "I1"), None)
        if not i1:
            continue

        last_ohlc_snapshot = i1

        # INIT
        if last_minute_bucket is None:
            last_minute_bucket = current_bucket
            continue

        # SAME MINUTE
        if current_bucket == last_minute_bucket:
            continue

        # ==================================================
        # 🔥 CLOSE PREVIOUS MINUTE IMMEDIATELY (NO LAG)
        # ==================================================
        candle_ts = last_minute_bucket
        candle_dt = datetime.fromtimestamp(candle_ts / 1000, IST)

        candle = {
            "ts": candle_ts,
            "ts_ist": candle_dt.strftime("%Y-%m-%d %H:%M:%S"),
            "open": float(last_ohlc_snapshot["open"]),
            "high": float(last_ohlc_snapshot["high"]),
            "low": float(last_ohlc_snapshot["low"]),
            "close": float(last_ohlc_snapshot["close"]),
            "volume": float(last_ohlc_snapshot.get("vol", 0)),
        }

        redis_store_candle(symbol, "1m", candle)
        compute_and_store_last_n_indicators(symbol, "1m", n=1)

        print(f"[LIVE] {symbol} {candle_dt.strftime('%H:%M')}")

        last_closed_ts = candle_ts
        last_minute_bucket = current_bucket


@app.route("/api/start-live-conversion", methods=["POST"])
def start_live_conversion():
    payload = request.get_json(force=True) or {}

    symbol = (payload.get("symbol") or "").upper().strip()
    feed_key = payload.get("feed_key")

    if not symbol or not feed_key:
        return jsonify({"error": "symbol and feed_key required"}), 400

    worker_key = f"{symbol}:1m"

    # Prevent duplicate workers
    if worker_key in live_workers:
        worker = live_workers.get(worker_key)
        if worker and worker.is_alive():
            return jsonify({"status": "ALREADY_RUNNING", "symbol": symbol}), 200
        else:
            live_workers.pop(worker_key, None)

    print(f"[API] Starting candle engine for {symbol}")

    worker = threading.Thread(
        target=candle_worker, args=(symbol, feed_key), daemon=True  # ✅ SINGLE ENGINE
    )
    worker.start()

    live_workers[worker_key] = worker

    return (
        jsonify({"status": "STARTED", "symbol": symbol, "engine": "I1_SINGLE_ENGINE"}),
        200,
    )


def compute_and_store_last_n_indicators(symbol: str, timeframe="1m", n=1):
    """
    Indicator engine (FINAL, SAFE):
    - Indicators computed ONLY after 200 candles
    - No partial / invalid indicators
    - Bootstrap + live safe
    - No repainting
    """

    import pandas as pd
    import numpy as np
    import ta
    import json
    from datetime import time
    from zoneinfo import ZoneInfo

    IST = ZoneInfo("Asia/Kolkata")
    ML_SEQ_LEN = 200

    # ---------- LOAD CANDLES ----------
    df = redis_load_candles(symbol, timeframe, limit=1200)
    if df.empty or len(df) < ML_SEQ_LEN:
        return False  # 🔒 HARD STOP

    # ---------- TIME NORMALIZATION ----------
    df["ts"] = pd.to_datetime(df["ts"], unit="ms", utc=True).dt.tz_convert(IST)
    df.sort_values("ts", inplace=True)
    df["date"] = df["ts"].dt.date

    # ---------- USE FULL HISTORY (NO SHORT DAYS) ----------
    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    vol = df["volume"].astype(float)

    # ---------- INDICATORS ----------
    df["rsi_14"] = ta.momentum.RSIIndicator(close, 14).rsi()

    df["ema_9"] = ta.trend.EMAIndicator(close, 9).ema_indicator()
    df["ema_21"] = ta.trend.EMAIndicator(close, 21).ema_indicator()
    df["ema_50"] = ta.trend.EMAIndicator(close, 50).ema_indicator()
    df["ema_200"] = ta.trend.EMAIndicator(close, 200).ema_indicator()

    macd = ta.trend.MACD(close)
    df["macd"] = macd.macd()
    df["macd_signal"] = macd.macd_signal()
    df["macd_hist"] = macd.macd_diff()

    atr = ta.volatility.AverageTrueRange(high, low, close, 14)
    df["atr_14"] = atr.average_true_range()
    df["atr_percent"] = df["atr_14"] / close * 100

    # ---------- BOLLINGER (ADDED) ----------
    bb = ta.volatility.BollingerBands(close, 20, 2)
    df["bollinger_mid"] = bb.bollinger_mavg()
    df["bollinger_upper"] = bb.bollinger_hband()
    df["bollinger_lower"] = bb.bollinger_lband()

    # ---------- VWAP (DAILY RESET – FIXED) ----------
    typical = (high + low + close) / 3
    df["vwap"] = (typical * vol).groupby(df["date"]).cumsum() / vol.groupby(
        df["date"]
    ).cumsum()

    # ---------- ORB (per day) ----------
    df["orb_high"] = np.nan
    df["orb_low"] = np.nan

    for d, day_df in df.groupby("date"):
        orb = day_df[
            (day_df["ts"].dt.time >= time(9, 15))
            & (day_df["ts"].dt.time <= time(9, 20))
        ]
        if orb.empty:
            continue

        df.loc[day_df.index, "orb_high"] = orb["high"].max()
        df.loc[day_df.index, "orb_low"] = orb["low"].min()

    df["orb_breakout"] = (df["close"] > df["orb_high"]).astype(int)
    df["orb_breakdown"] = (df["close"] < df["orb_low"]).astype(int)

    df["is_open_candle"] = (
        (df["ts"].dt.hour == 9) & (df["ts"].dt.minute == 15)
    ).astype(int)

    # ---------- GAP & VOLATILITY ----------
    df["prev_close"] = df["close"].shift(1)
    df["gap_percent"] = (
        (df["open"] - df["prev_close"]) / df["prev_close"] * 100
    ).fillna(0)

    df["volatility"] = df["close"].pct_change().rolling(20).std()

    # ---------- SUPERTREND SIGNAL ----------
    try:
        st = ta.trend.STCIndicator(df["close"])
        supertrend_signal = int(np.sign(st.stc().iloc[-1] - st.stc().iloc[-2]))
    except Exception:
        supertrend_signal = 0

    # ---------- FINAL ROW ----------
    last = df.iloc[-1]
    candle_ts = int(last["ts"].timestamp() * 1000)

    indicator_row = {
        "candle_ts": candle_ts,
        "candle_time_ist": last["ts"].strftime("%Y-%m-%d %H:%M:%S"),
        "indicator_ts": candle_ts,
        "close": float(last["close"]),
        "rsi_14": float(last["rsi_14"]),
        "ema_9": float(last["ema_9"]),
        "ema_21": float(last["ema_21"]),
        "ema_50": float(last["ema_50"]),
        "ema_200": float(last["ema_200"]),
        "macd": float(last["macd"]),
        "macd_signal": float(last["macd_signal"]),
        "macd_hist": float(last["macd_hist"]),
        "atr_14": float(last["atr_14"]),
        "atr_percent": float(last["atr_percent"]),
        "bollinger_mid": float(last["bollinger_mid"]),
        "bollinger_upper": float(last["bollinger_upper"]),
        "bollinger_lower": float(last["bollinger_lower"]),
        "volatility": float(last["volatility"]),
        "gap_percent": float(last["gap_percent"]),
        "vwap": float(last["vwap"]),
        "orb_high": float(last["orb_high"]),
        "orb_low": float(last["orb_low"]),
        "orb_breakout": int(last["orb_breakout"]),
        "orb_breakdown": int(last["orb_breakdown"]),
        "supertrend_signal": supertrend_signal,
        "is_open_candle": int(last["is_open_candle"]),
        "ml_ready": True,
        "sequence_len": len(df),
    }

    ind_key = f"live:{symbol}:{timeframe}:indicators"
    redis_client.rpush(ind_key, json.dumps(indicator_row))
    redis_client.ltrim(ind_key, -500, -1)

    return True


import pandas as pd

from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
from flask import request, jsonify
from tensorflow.keras.models import load_model
import joblib


@app.route("/api/symbol-feedkey", methods=["GET"])
def api_symbol_feedkey():
    """
    Returns feed_key for a given symbol using SYMBOL_TO_KEY.
    Used for Tick → Candle reconstruction.
    Example return:
      { "symbol": "TATAMOTORS", "feed_key": "NSE_EQ|INE155A01022" }
    """
    try:
        symbol = (request.args.get("symbol") or "").upper().strip()
        if not symbol:
            return jsonify({"error": "symbol required"}), 400

        entry = SYMBOL_TO_KEY.get(symbol)
        if not entry:
            return jsonify({"symbol": symbol, "feed_key": None})

        # If mapping is dict (NSE/BSE)
        if isinstance(entry, dict):
            # Prefer NSE
            if "NSE" in entry:
                return jsonify({"symbol": symbol, "feed_key": entry["NSE"]})
            # fallback BSE
            if "BSE" in entry:
                return jsonify({"symbol": symbol, "feed_key": entry["BSE"]})

            # If some other mapping exists
            key = list(entry.values())[0]
            return jsonify({"symbol": symbol, "feed_key": key})

        # If direct string mapping (single exchange)
        if isinstance(entry, str):
            return jsonify({"symbol": symbol, "feed_key": entry})

        return jsonify({"symbol": symbol, "feed_key": None})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/paper-trade/run", methods=["POST"])
def run_paper_trade():
    import pandas as pd
    import joblib
    import os
    from sqlalchemy import create_engine, text
    from collections import defaultdict

    data = request.get_json() or {}

    # =====================================================
    # VALIDATION
    # =====================================================
    required = ["model_run_id", "symbol", "timeframe", "margin_per_share"]
    for k in required:
        if k not in data:
            return jsonify({"error": f"{k} is required"}), 400

    model_run_id = int(data["model_run_id"])
    symbol = data["symbol"]
    timeframe = data["timeframe"]
    margin_per_share = float(data["margin_per_share"])

    if margin_per_share <= 0:
        return jsonify({"error": "margin_per_share must be > 0"}), 400

    threshold = float(data.get("threshold", 0.6))
    starting_capital = float(data.get("starting_capital", 10000))

    # =====================================================
    # HARD CONTROLS
    # =====================================================
    CAPITAL_STOP = 7000
    MAX_TRADES_PER_DAY = 5

    # =====================================================
    # PHASE GOVERNANCE (CORE LOGIC)
    # =====================================================
    ALLOWED_PHASES = {
        "IMPULSE",
        "TREND_ACCEPTANCE",
        "TREND_CONTINUATION",
        "TREND_PAUSE",
    }

    PHASE_RISK = {
        "IMPULSE": 0.015,
        "TREND_CONTINUATION": 0.012,
        "TREND_ACCEPTANCE": 0.010,
        "TREND_PAUSE": 0.005,
    }

    PHASE_RR = {
        "IMPULSE": 4.0,
        "TREND_CONTINUATION": 3.0,
        "TREND_ACCEPTANCE": 2.5,
        "TREND_PAUSE": 1.5,
    }

    PHASE_LOOKAHEAD = {
        "IMPULSE": 8,
        "TREND_CONTINUATION": 30,
        "TREND_ACCEPTANCE": 20,
        "TREND_PAUSE": 10,
    }

    # =====================================================
    # DB CONNECTION
    # =====================================================
    engine = create_engine(
        f"postgresql+psycopg2://{os.getenv('PGUSER')}:{os.getenv('PGPASSWORD')}"
        f"@{os.getenv('PGHOST')}:{os.getenv('PGPORT')}/{os.getenv('PGDATABASE')}"
    )

    # =====================================================
    # LOAD MODEL + FEATURE CONTRACT
    # =====================================================
    row = pd.read_sql(
        "SELECT model_path FROM ml_model_runs WHERE id=%(id)s",
        engine,
        params={"id": model_run_id},
    )

    if row.empty:
        return jsonify({"error": "Invalid model_run_id"}), 400

    model = joblib.load(row.iloc[0]["model_path"])

    # =====================================================
    # LOAD DATA (ALL ML FEATURES INCLUDED)
    # =====================================================
    df = pd.read_sql(
        """
        SELECT
            r.ts,
            r.strategy_id AS rule_type,
            r.market_phase,

            i.close, i.high, i.low,
            i.atr_14,

            -- ML FEATURES
            i.ema_21,
            (i.ema_21 - i.ema_50) AS ema_trend_strength,
            i.volume_ratio,
            (i.close - i.vwap) / NULLIF(i.vwap,0) AS vwap_dist_pct,
            i.obv,
            i.orb_breakout::int,
            i.rsi_14,
            i.macd_hist,
            CASE
                WHEN i.supertrend_signal='UP' THEN 1
                WHEN i.supertrend_signal='DOWN' THEN -1
                ELSE 0
            END AS supertrend_signal

        FROM rule_evaluations r
        JOIN indicators i USING (symbol, exchange, timeframe, ts)
        WHERE r.rule_eligibility = true
          AND r.symbol = %(symbol)s
          AND r.timeframe = %(tf)s
        ORDER BY r.ts
    """,
        engine,
        params={"symbol": symbol, "tf": timeframe},
        parse_dates=["ts"],
    )

    if df.empty:
        return jsonify({"error": "No eligible trades found"}), 400

    # Let sklearn Pipeline handle feature selection internally
    df["prob"] = model.predict_proba(df)[:, 1]

    # =====================================================
    # PAPER TRADING ENGINE
    # =====================================================
    capital = starting_capital
    peak = capital
    max_dd = 0.0

    trades = []
    wins = losses = 0
    daily_trades = defaultdict(int)

    for i in range(len(df) - 1):

        if capital <= CAPITAL_STOP:
            break

        row = df.iloc[i]
        phase = row["market_phase"]
        trade_date = row["ts"].date()

        if phase not in ALLOWED_PHASES:
            continue

        if daily_trades[trade_date] >= MAX_TRADES_PER_DAY:
            continue

        if row["prob"] < threshold:
            continue

        atr = float(row["atr_14"])
        if atr <= 0:
            continue

        risk_pct = PHASE_RISK[phase]
        rr_ratio = PHASE_RR[phase]
        lookahead = PHASE_LOOKAHEAD[phase]

        risk_amount = capital * risk_pct
        if capital - risk_amount < CAPITAL_STOP:
            continue

        entry = float(row["close"])
        sl_dist = atr

        qty_risk = int(risk_amount / sl_dist)
        qty_margin = int(capital / margin_per_share)
        qty = min(qty_risk, qty_margin)

        if qty <= 0:
            continue

        sl = entry - sl_dist
        tp = entry + rr_ratio * sl_dist

        future = df.iloc[i + 1 : i + 1 + lookahead]
        future = future[future["ts"].dt.date == trade_date]

        exit_price = entry
        exit_reason = "TIME_EXIT"

        for _, f in future.iterrows():
            if f["low"] <= sl:
                exit_price = sl
                exit_reason = "SL_HIT"
                break
            if f["high"] >= tp:
                exit_price = tp
                exit_reason = "TP_HIT"
                break

        pnl = (exit_price - entry) * qty
        capital = max(capital + pnl, 0)

        peak = max(peak, capital)
        max_dd = max(max_dd, (peak - capital) / peak if peak > 0 else 0)

        result = "WIN" if pnl > 0 else "LOSS"
        wins += pnl > 0
        losses += pnl <= 0

        daily_trades[trade_date] += 1

        trades.append(
            {
                "paper_trade_run_id": None,
                "model_run_id": model_run_id,
                "symbol": symbol,
                "timeframe": timeframe,
                "trade_ts": row["ts"],
                "trade_date": trade_date,
                "rule_type": row["rule_type"],
                "market_phase": phase,
                "probability": float(row["prob"]),
                "threshold": threshold,
                "result": result,
                "entry_price": entry,
                "exit_price": exit_price,
                "qty": qty,
                "margin_used": qty * margin_per_share,
                "pnl": pnl,
                "exit_reason": exit_reason,
                "capital_after": capital,
            }
        )

    # =====================================================
    # METRICS
    # =====================================================
    total_trades = wins + losses
    win_rate = wins / max(total_trades, 1)
    expectancy = (win_rate * 1) - (1 - win_rate)

    # =====================================================
    # STORE RUN
    # =====================================================
    with engine.begin() as conn:
        run_id = conn.execute(
            text(
                """
            INSERT INTO paper_trade_runs (
                model_run_id, symbol, timeframe,
                threshold, starting_capital, final_capital,
                total_trades, wins, losses,
                win_rate, expectancy, max_drawdown_pct
            )
            VALUES (
                :mr, :sym, :tf,
                :th, :start, :final,
                :tt, :w, :l,
                :wr, :exp, :dd
            )
            RETURNING id
        """
            ),
            {
                "mr": model_run_id,
                "sym": symbol,
                "tf": timeframe,
                "th": threshold,
                "start": starting_capital,
                "final": capital,
                "tt": total_trades,
                "w": wins,
                "l": losses,
                "wr": win_rate,
                "exp": expectancy,
                "dd": max_dd * 100,
            },
        ).scalar()

    if trades:
        for t in trades:
            t["paper_trade_run_id"] = run_id
        pd.DataFrame(trades).to_sql(
            "paper_trades", engine, if_exists="append", index=False
        )

    return jsonify(
        {
            "status": "SUCCESS",
            "paper_trade_run_id": run_id,
            "final_capital": round(capital, 2),
            "net_pnl": round(capital - starting_capital, 2),
            "total_trades": total_trades,
            "win_rate": round(win_rate, 4),
            "max_drawdown_pct": round(max_dd * 100, 2),
        }
    )


@app.route("/api/paper-trade/equity-curve", methods=["GET"])
def paper_equity_curve():
    from sqlalchemy import create_engine
    import os
    import pandas as pd

    run_id = request.args.get("run_id", type=int)
    if not run_id:
        return jsonify({"error": "run_id is required"}), 400

    # ✅ CREATE ENGINE HERE
    engine = create_engine(
        f"postgresql+psycopg2://{os.getenv('PGUSER')}:{os.getenv('PGPASSWORD')}"
        f"@{os.getenv('PGHOST')}:{os.getenv('PGPORT')}/{os.getenv('PGDATABASE')}"
    )

    df = pd.read_sql(
        """
        SELECT
            trade_ts AS time,
            capital_after AS capital
        FROM paper_trades
        WHERE paper_trade_run_id = %(id)s
        ORDER BY trade_ts
    """,
        engine,
        params={"id": run_id},
    )

    return jsonify({"run_id": run_id, "curve": df.to_dict(orient="records")})


@app.route("/api/paper-trade/compare-thresholds", methods=["POST"])
def compare_thresholds():
    data = request.get_json()
    results = {}

    for t in data["thresholds"]:
        data["threshold"] = t
        resp = run_paper_trade().json
        results[str(t)] = resp

    results[str(t)] = {
        "final_capital": resp["final_capital"],
        "net_pnl": resp["net_pnl"],
        "total_trades": resp["total_trades"],
        "win_rate": resp["win_rate"],
        "max_drawdown": resp["max_drawdown"],
    }


# ===========================================
# 🔑 Build Global SYMBOL_TO_KEY Mapping
# ==========================================
def load_symbol_map():
    global SYMBOL_TO_KEY
    print("🔄 Building SYMBOL_TO_KEY map...")

    inst_path = os.path.join(BASE_DIR, "upstox_instruments.json.gz")

    if not os.path.exists(inst_path):
        print("❌ Instruments file missing!")
        SYMBOL_TO_KEY = {}
        return

    try:
        with gzip.open(inst_path, "rt", encoding="utf-8") as f:
            instruments = json.load(f)

        print(f"📦 Total instruments in file: {len(instruments)}")

        temp = {}

        for i in instruments:
            try:
                # Symbol
                symbol = (
                    i.get("symbol") or i.get("trading_symbol") or i.get("tradingsymbol")
                )
                if not symbol:
                    continue
                symbol = symbol.upper().strip()

                # Keys / ISIN
                raw_key = (
                    i.get("instrument_key") or i.get("instrumentKey") or i.get("token")
                )
                isin = (i.get("isin") or "").upper().strip()

                # Detect Exchange
                exchange = (i.get("exchange") or i.get("segment") or "").upper()

                # Normalize text
                if "NSE" in exchange:
                    exchange = "NSE"
                elif "BSE" in exchange:
                    exchange = "BSE"
                else:
                    # allow INDEX instruments
                    if i.get("instrument_type", "").upper() == "INDEX" and raw_key:
                        temp.setdefault(symbol, {})["INDEX"] = raw_key
                    continue

                temp.setdefault(symbol, {})

                # --- MAIN MAPPING LOGIC ----

                # 1️⃣ Prefer ISIN based mapping
                if isin:
                    temp[symbol][exchange] = f"{exchange}_EQ|{isin}"

                # 2️⃣ If no ISIN but raw key contains proper format → keep it
                elif raw_key and "|" in raw_key:
                    temp[symbol][exchange] = raw_key

                # 3️⃣ If raw_key exists but no `|`, and it's NOT index → reject (invalid)
                else:
                    continue

            except Exception:
                continue

        SYMBOL_TO_KEY = temp
        print(f"🎯 Final mapped symbols: {len(SYMBOL_TO_KEY)}")

    except Exception as e:
        print("❌ Failed parsing instruments file:", e)
        SYMBOL_TO_KEY = {}


# 👉 MUST be here (not inside the function)
load_symbol_map()


def run_instrument_startup_sync():
    print("🔁 [BOOT] Starting instrument sync")

    inst_path = os.path.join(BASE_DIR, "upstox_instruments.json.gz")
    if not os.path.exists(inst_path):
        print("⚠️ [BOOT] Instruments file not found, skipping")
        return

    try:
        with app.app_context():
            sync_instruments()

        print("✅ [BOOT] Instrument sync completed")

    except Exception as e:
        print("❌ [BOOT] Instrument sync failed:", e)


def startup_sync_once():
    lock_file = os.path.join(BASE_DIR, ".instrument_sync.lock")

    if os.path.exists(lock_file):
        print("ℹ️ [BOOT] Instrument sync already done, skipping")
        return

    try:
        sync_instruments_core()

        with open(lock_file, "w") as f:
            f.write(datetime.utcnow().isoformat())

        print("✅ [BOOT] Instrument sync completed")

    except Exception as e:
        print("❌ [BOOT] Instrument sync failed:", e)


if __name__ == "__main__":
    init_db()

    try:
        print("📊 Checking INDIA VIX on startup...")
        update_vix_if_needed()
        app.logger.info("✅ INDIA VIX updated on startup")
    except Exception as e:
        app.logger.error(f"❌ INDIA VIX update failed: {e}")

    startup_sync_once()
