import asyncio
from quart import Quart, render_template
import socketio

# Socket.IO Server (async)
sio = socketio.AsyncServer(async_mode="asgi")
app = Quart(__name__)
sio_app = socketio.ASGIApp(sio, app)

@app.route("/")
async def index():
    return await render_template("index.html")

@sio.event
async def connect(sid, environ):
    print(f"Client verbunden: {sid}")
    # Nachrichtensender starten (nur für diesen Client)
    asyncio.create_task(send_messages(sid))

async def send_messages(sid):
    count = 1
    while True:
        message = {"text": f"Nachricht #{count}"}
        await sio.emit("new_message", message, to=sid)
        print(f"📤 Sende: {message}")
        count += 1
        await asyncio.sleep(1)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(sio_app, host="127.0.0.1", port=5000, log_level="debug")
