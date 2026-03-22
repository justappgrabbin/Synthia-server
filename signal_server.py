"""
TRIDENT Minimal Signaling Server
WebSocket only — used once per peer pair for WebRTC handshake.
After handshake, all RAG traffic is pure P2P DataChannel.

Run: python signal_server.py
     pip install websockets
"""

import asyncio, json
from websockets.server import serve

peers = {}   # device_id → websocket

async def handler(ws):
    device_id = None
    try:
        async for raw in ws:
            msg = json.loads(raw)
            t   = msg.get('type')

            if t == 'register':
                device_id = msg['deviceId']
                peers[device_id] = ws
                # Tell new peer who else is online
                await ws.send(json.dumps({'type': 'peers', 'list': list(peers.keys())}))
                # Tell others a new peer joined
                for pid, pws in peers.items():
                    if pid != device_id:
                        try: await pws.send(json.dumps({'type': 'peers', 'list': list(peers.keys())}))
                        except: pass
                print(f"[signal] {device_id} joined  ({len(peers)} online)")

            elif t in ('offer', 'answer', 'ice'):
                # Forward to target peer
                target = msg.get('to')
                if target in peers:
                    try: await peers[target].send(raw)
                    except: pass

    finally:
        if device_id and device_id in peers:
            del peers[device_id]
            print(f"[signal] {device_id} left  ({len(peers)} online)")

async def main():
    print("TRIDENT Signaling Server — ws://0.0.0.0:8765")
    print("Peers connect here once, then go fully P2P")
    async with serve(handler, '0.0.0.0', 8765):
        await asyncio.Future()  # run forever

if __name__ == '__main__':
    asyncio.run(main())
