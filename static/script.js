const socket = io();
const container = document.getElementById("messages");

socket.on("connect", () => {
    console.log("Verbunden mit Server");
});

socket.on("new_message", (data) => {
    const msg = document.createElement("div");
    msg.classList.add("message");
    msg.textContent = data.text;

    container.appendChild(msg);

    const all = container.querySelectorAll(".message");

    // Wenn mehr als 5 Nachrichten, die älteste entfernen
    if (all.length >= 6) {
        container.removeChild(all[0]);
    }
});
