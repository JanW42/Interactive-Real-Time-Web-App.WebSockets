import asyncio
import socketio
import subprocess
import sounddevice as sd
import threading
import queue
import numpy as np
import os
from quart import Quart, render_template
import time

# Queues & Steuerung
sample_queue = queue.Queue()
volume_queue = queue.Queue()
message_queue = asyncio.Queue()
audio_task_event = threading.Event()
terminate_signal = threading.Event()
current_audio_file = "output.mp3"

main_event_loop = None

# Quart + Socket.IO Setup
sio = socketio.AsyncServer(async_mode="asgi")
app = Quart(__name__)
sio_app = socketio.ASGIApp(sio, app)

@app.route("/")
async def index():
    return await render_template("index.html")

@sio.event
async def connect(sid, environm, auth=None):
    global main_event_loop
    main_event_loop = asyncio.get_running_loop()
    print(f"🔌 Client verbunden: {sid}")
    asyncio.create_task(send_messages(sid))
    asyncio.create_task(send_volume_updates(sid))
    print("🚀 Starte Hintergrund-Threads...")
    send_message("🚀 Starte Hintergrund-Threads..")
    send_message(f"🔌 Client verbunden: {sid}")
    threading.Thread(target=audio_playback_thread, daemon=True).start()
    threading.Thread(target=volume_analysis_thread, daemon=True).start()
    threading.Thread(target=monitor_input_file, daemon=True).start()

# Funktion, die du synchron im Code aufrufen kannst
def send_message(text: str):
    global main_event_loop
    if not main_event_loop:
        print("❌ Kein Eventloop gesetzt")
        return

    try:
        if threading.current_thread() is threading.main_thread():
            # Wenn wir im Eventloop-Thread sind: über create_task()
            main_event_loop.create_task(message_queue.put(text))
        else:
            # In anderem Thread: run_coroutine_threadsafe
            asyncio.run_coroutine_threadsafe(message_queue.put(text), main_event_loop)
        print(f"📝 Nachricht eingereiht: {text}")
    except Exception as e:
        print(f"❌ Fehler beim Einreihen: {e}")
    
# Nachrichten an den Socket.IO-Client senden
async def send_messages(sid):
    print(f"📡 Starte Nachrichtensender für Client {sid}")
    while True:
        try:
            # Hole nächste Nachricht (wartet async)
            message = await message_queue.get()
            print(f"📤 Sende an Client {sid}: {message}")
            await sio.emit("new_message", {"text": message}, to=sid)
        except asyncio.CancelledError:
            print(f"🛑 Nachrichtensender für {sid} wurde gestoppt (Cancelled)")
            break  # Bei Abbruch durch Task-Stop o.ä.
        except Exception as e:
            print(f"❌ Fehler in send_messages({sid}): {e}")
        await asyncio.sleep(0.1)  # Eventloop schonen
 
async def send_volume_updates(sid):
    while not terminate_signal.is_set():
        try:
            volume = volume_queue.get(timeout=1)
        except queue.Empty:
            continue
        await sio.emit("volume_update", {"volume": volume}, to=sid)
        #send_message(f"Volume input sendet {volume}")

# Thread: Audio abspielen und auf neue Input.mp3 warten
def audio_playback_thread():
    global current_audio_file
    while not terminate_signal.is_set():
        audio_task_event.wait()
        #if not os.path.exists(current_audio_file):
        #    time.sleep(1)
        #    continue

        print(f"▶️ Starte Wiedergabe: {current_audio_file}")
        process = subprocess.Popen([
            "C:/ffmpeg/bin/ffmpeg.exe", "-i", current_audio_file,
            "-f", "s16le", "-acodec", "pcm_s16le",
            "-ac", "1", "-ar", "44100", "-"
        ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=10**6)

        samplerate = 44100
        blocksize = 2048
        stream = sd.OutputStream(samplerate=samplerate, channels=1, dtype='int16')
        stream.start()

        try:
            while not terminate_signal.is_set():
                data = process.stdout.read(blocksize * 2)
                if not data:
                    break
                samples = np.frombuffer(data, dtype=np.int16)
                stream.write(samples)
                sample_queue.put(samples)
        finally:
            process.kill()
            stream.stop()
            stream.close()
            send_message("Wiedergabe beendet")
            print("⏹️ Wiedergabe beendet.")

        # Wenn Input.mp3 gespielt wurde, löschen und wieder auf neue warten
        if current_audio_file == "input.mp3":
            try:
                os.remove("input.mp3")
                print("🗑️ input.mp3 gelöscht")
            except Exception as e:
                print(f"⚠️ Fehler beim Löschen: {e}")
            current_audio_file = None

        # Warten auf nächste Datei (siehe monitor_task)
        audio_task_event.clear()

# Thread: Analyse

def volume_analysis_thread():
    while not terminate_signal.is_set():
        samples = sample_queue.get()
        if samples is None or terminate_signal.is_set():
            continue
        volume = np.linalg.norm(samples) / (len(samples) * 300)
        volume = min(max(volume, 0), 1)
        volume_queue.put(volume)

# Task: Überwacht, ob neue input.mp3 auftaucht
def monitor_input_file():
    global current_audio_file
    if os.path.exists("output.mp3"):
        audio_task_event.set()  # Erste Datei starten

    while True:
        if os.path.exists("input.mp3") and not audio_task_event.is_set(): #Nur wenn es eine Input.mp3 gibt und der audio_task_thread nicht läuft dann:
            current_audio_file = "input.mp3"
            send_message("starte Wiedergabe")
            print("📥 Neue input.mp3 erkannt – starte Wiedergabe")
            audio_task_event.set() #Hier wird der Thread starte Wiedergabe Audio ausgeführt

        time.sleep(1) # warte 1 Sekunde bevor geguckt wird ob es eine Input.mp3 gibt.

# Server starten
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(sio_app, host="127.0.0.1", port=5000, log_level="info")