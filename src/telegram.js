import { config } from "./config.js";

function apiUrl(method) {
  return `https://api.telegram.org/bot${config.token}/${method}`;
}

export async function sendMessage(text, chatId = config.chatId) {
  let response;
  try {
    response = await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    });
  } catch (error) {
    const cause = error.cause ? ` Cause: ${error.cause.code || ""} ${error.cause.message || ""}` : "";
    throw new Error(`Cannot reach Telegram Bot API.${cause}`);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    throw new Error(`Telegram sendMessage failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body.result;
}

export async function getUpdates(offset) {
  let response;
  try {
    const url = new URL(apiUrl("getUpdates"));
    if (offset) url.searchParams.set("offset", String(offset));
    url.searchParams.set("timeout", "0");
    response = await fetch(url);
  } catch (error) {
    const cause = error.cause ? ` Cause: ${error.cause.code || ""} ${error.cause.message || ""}` : "";
    throw new Error(`Cannot reach Telegram Bot API.${cause}`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    throw new Error(`Telegram getUpdates failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body.result || [];
}

export async function discoverChats() {
  const updates = await getUpdates();
  const seen = new Map();

  for (const update of updates) {
    const message = update.message || update.channel_post || update.edited_message;
    const chat = message?.chat;
    if (!chat) continue;
    seen.set(String(chat.id), {
      id: chat.id,
      type: chat.type,
      title: chat.title || chat.username || [chat.first_name, chat.last_name].filter(Boolean).join(" ")
    });
  }

  return [...seen.values()];
}
