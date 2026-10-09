<script setup lang="ts">
interface Message {
  id: string;
  name: string;
  text: string;
  at: string;
}

const { data, error } = await useFetch<{ messages: Message[] }>("/api/chat");
const messages = ref<Message[]>(data.value?.messages ?? []);
const name = ref("guest");
const text = ref("");
const status = ref(error.value ? "history unavailable" : "connecting");
const sending = ref(false);
let source: EventSource | undefined;

const visible = computed(() => messages.value.filter((m) => m.name !== "zoo-probe"));

function add(m: Message) {
  if (messages.value.some((x) => x.id === m.id)) return;
  messages.value = [...messages.value, m].slice(-100);
}

onMounted(() => {
  source = new EventSource("/api/chat/stream");
  source.addEventListener("ready", () => (status.value = "live"));
  source.addEventListener("message", (e) => add(JSON.parse((e as MessageEvent).data)));
  source.onerror = () => (status.value = "reconnecting");
});
onBeforeUnmount(() => source?.close());

async function send() {
  sending.value = true;
  try {
    const out = await $fetch<{ message: Message }>("/api/chat", { method: "POST", body: { name: name.value, text: text.value }, timeout: 5000 });
    add(out.message);
    text.value = "";
  } catch (e) {
    const err = e as { data?: { error?: string }; message: string };
    status.value = `send failed: ${err.data?.error ?? err.message}`;
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <main class="wrap">
    <h1>nuxt-chat</h1>
    <p class="sub">Nuxt 4 SSR on ox. History is server-rendered from Redis; new messages arrive over SSE through Redis pub/sub. Status: <strong id="status">{{ status }}</strong></p>
    <ul id="messages">
      <li v-for="m in visible" :key="m.id">
        <span class="who">{{ m.name }}</span> {{ m.text }} <time :datetime="m.at">{{ m.at.slice(11, 16) }}</time>
      </li>
      <li v-if="visible.length === 0" class="empty">No messages yet. Say hello.</li>
    </ul>
    <form @submit.prevent="send">
      <input v-model="name" aria-label="name" maxlength="32" required />
      <input v-model="text" aria-label="message" maxlength="500" placeholder="Message" required />
      <button :disabled="sending">Send</button>
    </form>
    <p class="sub"><a href="/_zoo/health">health</a> · <a href="/_zoo/probe">probe</a></p>
  </main>
</template>

<style>
body { font-family: system-ui, sans-serif; color: #333; margin: 0; }
.wrap { max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
.sub { color: #666; }
#messages { list-style: none; padding: 0; border: 1px solid #ddd; border-radius: 14px; min-height: 12rem; max-height: 24rem; overflow-y: auto; }
#messages li { padding: .4rem .8rem; border-bottom: 1px solid #f0f0f0; }
.who { font-weight: 600; }
time { color: #999; font-size: .8em; }
.empty { color: #999; }
form { display: flex; gap: .5rem; }
form input:last-of-type { flex: 1; }
input, button { font: inherit; padding: .4rem .6rem; border: 1px solid #ccc; border-radius: 8px; }
</style>
