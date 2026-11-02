"use strict";

const RETRY_AFTER_CLOSE = true;
const RETRY_DELAY_MS = 5000;

const connection =
    new signalR.HubConnectionBuilder()
        .withUrl("https://signalr-hub-g3c7dqh7apf0fdfv.mexicocentral-01.azurewebsites.net/chatHub")
        .withAutomaticReconnect()
        .build();


const badge = document.getElementById("connectionBadge");
const roomButtons = document.querySelectorAll("#roomList [data-room]");
const roomTitle = document.getElementById("roomTitle");
const messagesList = document.getElementById("messagesList");
const userInput = document.getElementById("userInput");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const chatForm = document.getElementById("chatForm");
const feedback = document.getElementById("feedback");

let currentRoom = null; 
let feedbackTimer = null;


const BADGES = {
    connecting:   ["text-bg-secondary", "Conectando..."],
    connected:    ["text-bg-success",   "Conectado"],
    reconnecting: ["text-bg-warning",   "Reconectando..."],
    disconnected: ["text-bg-danger",    "Desconectado"]
};

function setBadge(kind, extra = "") {
    const [css, text] = BADGES[kind];
    badge.className = `badge rounded-pill ${css}`;
    badge.textContent = extra ? `${text} ${extra}` : text;
    console.log(`[conexión] ${text} ${extra}`.trim());
}

function updateControls() {
    const connected =
        connection.state === signalR.HubConnectionState.Connected;

    roomButtons.forEach((button) => {
        button.disabled = !connected;
    });

    const canWrite = connected && currentRoom !== null;
    messageInput.disabled = !canWrite;
    sendButton.disabled = !canWrite;
}


function friendlyError(error) {
    const marker = "HubException: ";
    const text = error?.message ?? String(error);
    const index = text.indexOf(marker);
    return index >= 0 ? text.substring(index + marker.length) : text;
}

function showError(text) {
    feedback.textContent = text;
    feedback.classList.remove("d-none");
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(
        () => feedback.classList.add("d-none"), 6000);
}

function clearError() {
    feedback.classList.add("d-none");
}


function scrollToBottom() {
    messagesList.scrollTop = messagesList.scrollHeight;
}

function showEmptyState(text) {
    messagesList.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "text-center text-muted my-auto";
    empty.textContent = text;
    empty.dataset.empty = "true";
    messagesList.appendChild(empty);
}

function removeEmptyState() {
    messagesList
        .querySelectorAll("[data-empty]")
        .forEach((node) => node.remove());
}

function addSystemLine(text) {
    removeEmptyState();
    const line = document.createElement("div");
    line.className = "text-center text-muted small my-2";
    line.textContent = text;
    messagesList.appendChild(line);
    scrollToBottom();
}

function addMessage(message) {
    removeEmptyState();

    const mine =
        message.user.toLowerCase() === userInput.value.trim().toLowerCase();
    const time = new Date(message.sentAt).toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit"
    });

    const row = document.createElement("div");
    row.className =
        `d-flex mb-2 ${mine ? "justify-content-end" : "justify-content-start"}`;

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${mine ? "mine" : "theirs"}`;

    const meta = document.createElement("div");
    meta.className = "chat-meta";
    meta.textContent = `${mine ? "Tú" : message.user} · ${time}`;

    const text = document.createElement("div");
    text.textContent = message.message; 

    bubble.append(meta, text);
    row.appendChild(bubble);
    messagesList.appendChild(row);
    scrollToBottom();
}

function renderRoom() {
    roomTitle.textContent =
        currentRoom ? `Sala: ${currentRoom}` : "Elige una sala";

    roomButtons.forEach((button) => {
        button.classList.toggle(
            "active", button.dataset.room === currentRoom);
    });
}


connection.on("ReceiveMessage", (message) => {
    addMessage(message);
});


async function joinRoom(room) {
    if (room === currentRoom) {
        return;
    }

    try {
        await connection.invoke("JoinRoom", room);
        currentRoom = room;
        renderRoom();
        messagesList.replaceChildren();
        addSystemLine(`Entraste a la sala ${room}`);
        clearError();
        updateControls();
        messageInput.focus();
    } catch (error) {
        showError(friendlyError(error));
    }
}

roomButtons.forEach((button) => {
    button.addEventListener("click", () => joinRoom(button.dataset.room));
});

async function rejoinRoom() {
    if (currentRoom === null) {
        return;
    }
    try {
        await connection.invoke("JoinRoom", currentRoom);
    } catch (error) {
        showError(friendlyError(error));
    }
}


connection.onreconnecting(() => {
    setBadge("reconnecting");
    updateControls();
});

connection.onreconnected(async () => {
    await rejoinRoom();
    setBadge("connected");
    updateControls();
});

connection.onclose(() => {
    updateControls();
    if (RETRY_AFTER_CLOSE) {
        setBadge("disconnected",
            `· reintentando en ${RETRY_DELAY_MS / 1000} s`);
        setTimeout(startConnection, RETRY_DELAY_MS);
    } else {
        setBadge("disconnected", "· recarga la página");
    }
});

async function startConnection() {
    try {
        setBadge("connecting");
        await connection.start();
        await rejoinRoom();
        setBadge("connected");
        updateControls();
    } catch (error) {
        console.error(error);
        updateControls();
        if (RETRY_AFTER_CLOSE) {
            setBadge("disconnected",
                `· reintentando en ${RETRY_DELAY_MS / 1000} s`);
            setTimeout(startConnection, RETRY_DELAY_MS);
        } else {
            setBadge("disconnected", "· revisa la consola");
        }
    }
}



chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const user = userInput.value.trim();
    const message = messageInput.value.trim();

    if (!user) {
        showError("Escribe tu nombre antes de enviar.");
        userInput.focus();
        return;
    }

    if (!message) {
        return;
    }

    if (connection.state !== signalR.HubConnectionState.Connected) {
        showError("No existe una conexión activa.");
        return;
    }

    try {
        await connection.invoke("SendMessage", user, message);
        messageInput.value = "";
        messageInput.focus();
    } catch (error) {
      
        showError(friendlyError(error));
        console.error("No se pudo enviar el mensaje:", error);
    }
});



try {
    userInput.value = localStorage.getItem("chatUser") ?? "";
    userInput.addEventListener("input", () => {
        localStorage.setItem("chatUser", userInput.value);
    });
} catch {
  
}


showEmptyState("Elige una sala para empezar a chatear");
renderRoom();
updateControls();
startConnection();
