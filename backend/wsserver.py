# wsserver.py
"""
Upstox -> Redis -> Local WebSocket bridge (Market Feed V3)

Features:
- Authorize with Upstox to get WSS URL (GET /v3/feed/market-data-feed/authorize)
- Connect to Upstox WSS, send subscription JSON (encoded as bytes)
- Receive binary protobuf ticks, decode if protobuf module available
- Publish ticks to Redis channel 'ticks:live'
- Broadcast ticks to local WebSocket clients (ws://0.0.0.0:9000)
- Listen to Redis channel 'subscribe:requests' for subscription requests (instrument_key)
- Defensive: works even if protobuf or upstox_client is missing
"""

import os
import sys
import json
import time
import ssl
import base64
import asyncio
import traceback
import threading
from typing import Set

import requests
import redis
import websockets

# Optional generated protobuf (MarketDataFeedV3_pb2.py)
try:
    import MarketDataFeedV3_pb2 as pb
    from google.protobuf.json_format import MessageToDict
except Exception:
    pb = None
    MessageToDict = None

# Optional: upstox_client SDK — not required for this direct WSS approach
try:
    from upstox_client import MarketDataStreamerV3, Configuration, ApiClient  # type: ignore
except Exception:
    MarketDataStreamerV3 = None
    Configuration = None
    ApiClient = None

# -------------------- Configuration --------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://:linux123@127.0.0.1:6379/10")
WS_HOST = os.getenv("WS_HOST", "0.0.0.0")
WS_PORT = int(os.getenv("WS_PORT", "9000"))
ACCESS_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN", "")
SKIP_SSL_VERIFY = os.getenv("SKIP_SSL_VERIFY", "0") in ("1", "true", "True")

REDIS_SUBSCRIBE_CHANNEL = "subscribe:requests"
REDIS_TICKS_CHANNEL = "ticks:live"
REDIS_UNSUB_CHANNEL = "unsubscribe:requests"


# -------------------- Globals --------------------
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=False)
CONNECTED_CLIENTS: Set[websockets.WebSocketServerProtocol] = set()
CURRENT_SUBS = set()
SUBSCRIBE_QUEUE = asyncio.Queue()
ASYNC_LOOP: asyncio.AbstractEventLoop | None = None

# -------------------- Helpers --------------------
def log(*args, **kwargs):
    print(*args, **kwargs, flush=True)

def get_access_token_from_redis():
    try:
        raw = redis_client.get("upstox:tokens")
        if not raw:
            return None
        if isinstance(raw, bytes):
            data = json.loads(raw.decode("utf-8"))
        else:
            data = json.loads(raw)
        return data.get("access_token")
    except Exception:
        return None

def build_subscribe_payload(instrument_keys, mode="full", guid=None):
    if guid is None:
        guid = str(int(time.time() * 1000))

    return {
        "guid": guid,
        "method": "sub",
        "data": {
            "mode": mode,
            "instrumentKeys": instrument_keys
        }
    }

def try_decode_tick(raw_bytes: bytes) -> str:
    if pb is not None:
        try:
            feed = pb.FeedResponse()
            feed.ParseFromString(raw_bytes)
            if MessageToDict is not None:
                try:
                    d = MessageToDict(feed, preserving_proto_field_name=True)
                    return json.dumps({"proto_parsed": True, "data": d})
                except Exception:
                    return json.dumps({"proto_parsed": True, "raw_base64": base64.b64encode(raw_bytes).decode()})
        except Exception:
            pass

    try:
        txt = raw_bytes.decode("utf-8")
        try:
            js = json.loads(txt)
            return json.dumps({"proto_parsed": False, "data": js})
        except:
            return json.dumps({"proto_parsed": False, "raw_text": txt})
    except:
        return json.dumps({"proto_parsed": False, "raw_base64": base64.b64encode(raw_bytes).decode()})

async def broadcast_to_clients(payload_str: str):
    dead = []
    for ws in list(CONNECTED_CLIENTS):
        try:
            await ws.send(payload_str)
        except:
            dead.append(ws)
    for ws in dead:
        CONNECTED_CLIENTS.discard(ws)


# -------------------- Upstox WSS connection (async) --------------------
async def upstox_wss_worker(loop, subscription_queue: asyncio.Queue):
    global ACCESS_TOKEN

    if not ACCESS_TOKEN:
        ACCESS_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN", "") or get_access_token_from_redis() or ACCESS_TOKEN

    if not ACCESS_TOKEN:
        log("🔴 No Upstox access token (UPSTOX_ACCESS_TOKEN). Upstox connection disabled.")
        while True:
            await asyncio.sleep(10)
            ACCESS_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN", "") or get_access_token_from_redis() or ACCESS_TOKEN
            if ACCESS_TOKEN:
                log("🟢 Found UPSTOX_ACCESS_TOKEN; continuing to connect.")
                break

    def authorize_call():
        headers = {"Accept": "application/json", "Authorization": f"Bearer {ACCESS_TOKEN}"}
        url = "https://api.upstox.com/v3/feed/market-data-feed/authorize"
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        return r.json()

    while True:
        try:
            log("🔁 Authorizing Upstox feed...")
            j = await asyncio.to_thread(authorize_call)
            uri = None

            if isinstance(j, dict):
                data = j.get("data") or j
                if isinstance(data, dict):
                    uri = data.get("authorized_redirect_uri") or data.get("authorizedRedirectUri")

                if not uri:
                    def find_wss(obj):
                        if isinstance(obj, str) and obj.startswith("wss://"):
                            return obj
                        if isinstance(obj, dict):
                            for v in obj.values():
                                r = find_wss(v)
                                if r:
                                    return r
                        if isinstance(obj, list):
                            for v in obj:
                                r = find_wss(v)
                                if r:
                                    return r
                    uri = find_wss(j)

            if not uri:
                raise RuntimeError(f"No WSS URL in authorize response: {j}")

            log("🔗 Authorized WebSocket URL:", uri)

            ssl_ctx = ssl.create_default_context()
            if SKIP_SSL_VERIFY:
                ssl_ctx.check_hostname = False
                ssl_ctx.verify_mode = ssl.CERT_NONE

            log("🔌 Connecting to Upstox WSS...")
            async with websockets.connect(uri, ssl=ssl_ctx, max_size=None) as ws:
                log("✅ Connected to Upstox feed")

                async def consumer():
                    try:
                        async for message in ws:
                            if isinstance(message, str):
                                payload = json.dumps({"proto_parsed": False, "raw_text": message})
                            else:
                                payload = try_decode_tick(message)

                            # --------- Redis Publish ---------
                            redis_client.publish(REDIS_TICKS_CHANNEL, payload.encode("utf-8"))

                            # =====================================================
                            # 🗂 DAILY TICK STORAGE (Your requested feature)
                            # =====================================================
                            try:
                                tick_obj = json.loads(payload)
                                feeds = tick_obj.get("data", {}).get("feeds", {})
                                if feeds:
                                    today = time.strftime("%Y-%m-%d")
                                    for ik, feed in feeds.items():
                                        redis_key = f"ticks:{today}:{ik}"   # folder-like
                                        redis_client.lpush(redis_key, payload.encode("utf-8"))
                            except Exception:
                                traceback.print_exc()
                            # =====================================================

                            # Broadcast to websocket clients
                            await broadcast_to_clients(payload)

                    except websockets.ConnectionClosed:
                        log("⚠️ Upstox WSS connection closed.")
                    except Exception:
                        traceback.print_exc()
                    finally:
                        log("ℹ️ Consumer stopped")

                consumer_task = asyncio.create_task(consumer())

                async def keepalive():
                    try:
                        while True:
                            await asyncio.sleep(20)
                            try:
                                pong = await ws.ping()
                                await asyncio.wait_for(pong, timeout=10)
                            except:
                                pass
                    except asyncio.CancelledError:
                        pass

                keepalive_task = asyncio.create_task(keepalive())

                try:
                    while True:
                        item = await subscription_queue.get()
                        if item is None:
                            break

                        # item expected: {"instrumentKeys": [...], "mode": "full", "guid": "...", "method":"sub"/"unsub"}
                        keys = item.get("instrumentKeys") or []
                        if not keys:
                            continue

                        # Build payload (default method = "sub")
                        payload = build_subscribe_payload(keys, mode=item.get("mode", "full"), guid=item.get("guid"))
                        # If caller requested unsubscribe, override method
                        if item.get("method") == "unsub" or item.get("action") == "unsub" or item.get("action") == "unsubscribe":
                            payload["method"] = "unsub"

                        txt = json.dumps(payload).encode("utf-8")

                        try:
                            await ws.send(txt)
                            log(f"📨 Sent subscribe/unsubscribe to Upstox: method={payload.get('method')} keys={keys}")
                        except:
                            # re-queue on failure (keep behavior unchanged)
                            await subscription_queue.put(item)
                            raise
                finally:
                    keepalive_task.cancel()
                    consumer_task.cancel()
                    try:
                        await keepalive_task
                    except:
                        pass
                    try:
                        await consumer_task
                    except:
                        pass

        except Exception:
            traceback.print_exc()
            log("⏳ Reconnecting in 5s...")
            await asyncio.sleep(5)

# -------------------- Redis listeners --------------------
def redis_subscribe_request_thread(loop, subscription_queue):
    log("📡 Listening for subscribe:requests...")
    try:
        pub = redis_client.pubsub(ignore_subscribe_messages=True)
        pub.subscribe(REDIS_SUBSCRIBE_CHANNEL)
    except:
        traceback.print_exc()
        return

    for item in pub.listen():
        try:
            raw = item.get("data")
            if not raw:
                continue
            payload = json.loads(raw.decode("utf-8"))

            # Support both subscribe and unsubscribe actions from Redis
            action = (payload.get("action") or "").lower()
            ik = payload.get("instrument_key") or payload.get("instrumentKey") or payload.get("symbol")
            if not ik:
                continue

            if action in ("unsub", "unsubscribe"):
                log("📨 Redis unsubscribe request:", ik)
                try:
                    CURRENT_SUBS.discard(ik)
                except Exception:
                    pass
                send_item = {"instrumentKeys": [ik], "method": "unsub"}
                # schedule onto asyncio queue from this thread
                loop.call_soon_threadsafe(asyncio.create_task, subscription_queue.put(send_item))
            else:
                # default: subscribe
                log("📨 Subscribe request:", ik)
                CURRENT_SUBS.add(ik)
                send_item = {"instrumentKeys": [ik], "method": "sub"}
                loop.call_soon_threadsafe(asyncio.create_task, subscription_queue.put(send_item))
        except:
            traceback.print_exc()

def redis_unsubscribe_request_thread(loop, subscription_queue):
    log("📡 Listening for unsubscribe:requests...")
    try:
        pub = redis_client.pubsub(ignore_subscribe_messages=True)
        pub.subscribe(REDIS_UNSUB_CHANNEL)
    except:
        traceback.print_exc()
        return

    for item in pub.listen():
        try:
            raw = item.get("data")
            if not raw:
                continue
            payload = json.loads(raw.decode("utf-8"))

            ik = payload.get("instrument_key")
            if not ik:
                continue

            log("❌ Unsubscribe request:", ik)

            try:
                CURRENT_SUBS.discard(ik)
            except:
                pass

            send_item = {"instrumentKeys": [ik], "method": "unsub"}
            loop.call_soon_threadsafe(asyncio.create_task, subscription_queue.put(send_item))

        except:
            traceback.print_exc()
            

def redis_ticks_listener_thread(loop):
    log("📢 Redis tick listener starting...")
    try:
        pub = redis_client.pubsub(ignore_subscribe_messages=True)
        pub.subscribe(REDIS_TICKS_CHANNEL)
    except:
        traceback.print_exc()
        return

    for item in pub.listen():
        try:
            raw = item.get("data")
            if not raw:
                continue
            payload = raw.decode("utf-8")
            loop.call_soon_threadsafe(asyncio.create_task, broadcast_to_clients(payload))
        except:
            traceback.print_exc()

# -------------------- Local WebSocket server --------------------
async def ws_client_handler(websocket):
    CONNECTED_CLIENTS.add(websocket)
    log(f"🟢 Client connected ({len(CONNECTED_CLIENTS)})")

    try:
        while True:
            try:
                msg = await websocket.recv()
            except websockets.ConnectionClosed:
                break
            except Exception:
                # ignore transient errors and continue receiving
                continue

            # ---- handle incoming client messages for subscribe/unsubscribe ----
            try:
                if not msg:
                    continue
                # some clients may send bytes; ensure string
                if isinstance(msg, (bytes, bytearray)):
                    try:
                        msg = msg.decode("utf-8")
                    except:
                        continue

                parsed = None
                try:
                    parsed = json.loads(msg)
                except:
                    # not JSON — ignore
                    parsed = None

                if isinstance(parsed, dict):
                    # Client asks to subscribe: {"subscribe": ["NSE_EQ|...","..."]}
                    if "subscribe" in parsed:
                        keys = parsed.get("subscribe") or []
                        if isinstance(keys, (list, tuple)) and keys:
                            for k in keys:
                                CURRENT_SUBS.add(k)
                            send_item = {"instrumentKeys": list(keys), "method": "sub"}
                            # schedule onto queue
                            asyncio.create_task(SUBSCRIBE_QUEUE.put(send_item))
                            log("📡 Received WS subscribe from client:", keys)

                    # Client asks to unsubscribe: {"unsubscribe": ["NSE_EQ|...","..."]} OR {"action":"unsubscribe","instrument_key":"..."}
                    if "unsubscribe" in parsed:
                        keys = parsed.get("unsubscribe") or []
                        if isinstance(keys, (list, tuple)) and keys:
                            for k in keys:
                                try:
                                    CURRENT_SUBS.discard(k)
                                except:
                                    pass
                            send_item = {"instrumentKeys": list(keys), "method": "unsub"}
                            asyncio.create_task(SUBSCRIBE_QUEUE.put(send_item))
                            log("❌ Received WS unsubscribe from client:", keys)

                    # support single-action style
                    if parsed.get("action") and parsed.get("instrument_key"):
                        act = parsed.get("action").lower()
                        ik = parsed.get("instrument_key")
                        if act in ("unsub", "unsubscribe"):
                            try:
                                CURRENT_SUBS.discard(ik)
                            except:
                                pass
                            send_item = {"instrumentKeys": [ik], "method": "unsub"}
                            asyncio.create_task(SUBSCRIBE_QUEUE.put(send_item))
                            log("❌ Received WS unsubscribe (single) from client:", ik)
                        else:
                            # default subscribe
                            CURRENT_SUBS.add(ik)
                            send_item = {"instrumentKeys": [ik], "method": "sub"}
                            asyncio.create_task(SUBSCRIBE_QUEUE.put(send_item))
                            log("📡 Received WS subscribe (single) from client:", ik)

                # ignore other message types
            except Exception:
                traceback.print_exc()
                continue

    finally:
        CONNECTED_CLIENTS.discard(websocket)
        log(f"🔴 Client disconnected ({len(CONNECTED_CLIENTS)})")


# -------------------- Main --------------------
def start_redis_threads(loop, subscription_queue):
    t1 = threading.Thread(target=redis_subscribe_request_thread, args=(loop, subscription_queue), daemon=True)
    t1.start()

    # 🔥 NEW: Unsubscribe listener thread
    t_unsub = threading.Thread(target=redis_unsubscribe_request_thread, args=(loop, subscription_queue), daemon=True)
    t_unsub.start()

    t2 = threading.Thread(target=redis_ticks_listener_thread, args=(loop,), daemon=True)
    t2.start()
    return [t1, t_unsub, t2]


async def main_async():
    global ASYNC_LOOP
    ASYNC_LOOP = asyncio.get_running_loop()

    log("📡 Redis:", REDIS_URL)

    upstox_task = asyncio.create_task(upstox_wss_worker(ASYNC_LOOP, SUBSCRIBE_QUEUE))

    log(f"🌐 Starting WS server ws://{WS_HOST}:{WS_PORT}")
    server = await websockets.serve(ws_client_handler, WS_HOST, WS_PORT)

    start_redis_threads(ASYNC_LOOP, SUBSCRIBE_QUEUE)

    await asyncio.Future()

def main():
    global ACCESS_TOKEN
    if not ACCESS_TOKEN:
        ACCESS_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN", "") or get_access_token_from_redis() or ACCESS_TOKEN

    asyncio.run(main_async())

if __name__ == "__main__":
    main()
