/** Nonce-protected iframe client. All messages are text nodes; visitor credentials
 * stay in session storage and private headers, never the merchant URL. */
export const chatVisitorScript = String.raw`
(() => {
  'use strict';
  const config = JSON.parse(document.getElementById('chat-config').textContent);
  const $ = id => document.getElementById(id), endpoint = '/api/chat/' + config.id;
  const key = 'convelta-chat:' + config.id + ':' + config.origin;
  let session, started = false, visible = true, after = 0, fetching = false, sending = false;
  let pending = null, closed = false, humanOnly = false;
  const seen = new Set();
  $('brand').textContent = config.name;
  $('greeting').textContent = config.greeting;
  $('subtitle').textContent = config.aiEnabled ? 'C · AI 助理與客服團隊' : '留言後，同事會喺呢度回覆';
  $('quick').hidden = !config.aiEnabled;
  function persist() { try { sessionStorage.setItem(key, JSON.stringify({...session, pending})); } catch {} }
  try { session = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch {}
  if (!session || !/^[A-Za-z0-9_-]{43}$/.test(session.token || '') || !/^[-a-f0-9]{36}$/.test(session.id || '')) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    session = {id: crypto.randomUUID(), token: btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')};
  }
  started = session.started === true;
  const saved = session.pending;
  if (saved && saved.threadId === session.id && saved.origin === config.origin && /^[-a-f0-9]{36}$/.test(saved.commandId || '') &&
      typeof saved.body === 'string' && saved.body.length <= 2000 && ['message','human','human_only','resume_c'].includes(saved.kind)) {
    pending = saved;
    $('body').value = saved.body;
    $('retry').hidden = false;
  }
  persist();
  function error(message) { $('error').textContent = message; $('error').hidden = !message; }
  function controls() {
    $('body').disabled = closed || sending || !!pending;
    $('send').disabled = closed || sending || !!pending;
    for (const button of $('quick').querySelectorAll('button')) button.disabled = closed || sending || !!pending;
    $('resume').hidden = !humanOnly;
    $('human-only').hidden = humanOnly;
    $('count').textContent = $('body').value.length + ' / 2000';
  }
  controls();
  async function request(method, payload) {
    const url = method === 'GET' ? endpoint + '?' + new URLSearchParams({threadId: session.id, origin: config.origin, after: String(after)}) : endpoint;
    let response, data;
    try {
      response = await fetch(url, {method, credentials: 'omit', cache: 'no-store', headers: {
        Authorization: 'Bearer ' + session.token, ...(method === 'POST' ? {'Content-Type':'application/json'} : {})
      }, ...(payload ? {body: JSON.stringify(payload)} : {})});
      data = await response.json();
    } catch { throw new Error('暫時連線唔到，請保留訊息稍後再試。'); }
    if (!response.ok) {
      if (response.status === 401) $('restart').hidden = false;
      throw new Error(data.error || '暫時連線唔到，請稍後再試。');
    }
    return data;
  }
  async function start() {
    if (started) return;
    session.name = session.name ?? $('name').value.trim();
    persist();
    await request('POST', {action:'start', threadId:session.id, origin:config.origin, name:session.name, website:''});
    started = true; session.started = true; persist(); $('intro').hidden = true;
  }
  function draw(message) {
    if (seen.has(message.id)) return;
    seen.add(message.id); $('empty').hidden = true;
    const box = document.createElement('div');
    box.className = 'message ' + (message.direction === 'incoming' ? 'incoming' : 'outgoing') + (message.sender === 'c' ? ' c' : '');
    const text = document.createElement('div'); text.textContent = message.body; box.appendChild(text);
    const by = document.createElement('div'); by.className = 'byline';
    const speaker = message.direction === 'incoming' ? '你' : message.sender === 'c' ? 'C · AI 助理' : message.actorName || config.name;
    by.textContent = speaker + ' · ' + new Date(message.createdAt).toLocaleTimeString('zh-HK', {hour:'2-digit', minute:'2-digit'});
    box.appendChild(by); $('messages').appendChild(box); after = Math.max(after, message.sequence);
    $('messages').scrollTop = $('messages').scrollHeight;
  }
  async function read() {
    if (fetching || !started || !visible || document.visibilityState === 'hidden') return;
    fetching = true;
    try {
      const data = await request('GET');
      for (const message of data.messages) draw(message);
      closed = data.status === 'closed'; humanOnly = data.preference === 'human_only';
      $('restart').hidden = !closed;
      $('waiting').hidden = !data.humanWaiting || closed;
      $('state').textContent = closed ? '呢段對話已結束' : humanOnly ? '已選擇只由真人回覆；C 會等候' :
        ['queued','running'].includes(data.aiState) ? 'C 正在了解你嘅問題…' : data.cPaused ? '同事正在接待；C 暫停回覆' :
        '訊息已保存；回覆會喺呢度顯示';
      controls();
      if (!pending) error('');
      if (data.messages.length === 51) { fetching = false; return read(); }
    } catch (e) { error(e.message); } finally { fetching = false; }
  }
  async function send(kind = 'message', suggestion = '') {
    if (sending || closed) return;
    if (!pending) {
      const draft = $('body').value.trim(), body = suggestion ? suggestion + (draft ? '\n' + draft : '') : draft;
      if (!body) return;
      if (body.length > 2000) { error('訊息加上接待要求超過 2000 字，請先縮短內容。'); return; }
      pending = {action:'send', threadId:session.id, origin:config.origin, commandId:crypto.randomUUID(), body, kind, website:''};
      persist();
    }
    if ($('form').elements.website.value) return;
    sending = true; controls(); $('send').textContent = '發送中'; $('retry').hidden = true; error('');
    try {
      await start(); await request('POST', pending);
      pending = null; persist(); $('body').value = ''; await read();
    } catch (e) { error(e.message); $('retry').hidden = false; }
    finally { sending = false; controls(); $('send').textContent = '發送'; }
  }
  $('form').addEventListener('submit', e => { e.preventDefault(); send(); });
  $('retry').addEventListener('click', () => send());
  $('features').addEventListener('click', () => send('message', '想了解你哋嘅服務同功能。'));
  $('human').addEventListener('click', () => send('human', '我想同真人客服傾。'));
  $('human-only').addEventListener('click', () => send('human_only', '我想只由真人回覆，請 C 暫時等候。'));
  $('resume').addEventListener('click', () => send('resume_c', 'C 可以繼續幫我解答問題，真人請求請保留。'));
  $('restart').addEventListener('click', () => { try { sessionStorage.removeItem(key); } catch {} location.reload(); });
  $('body').addEventListener('input', controls);
  function close() { window.parent.postMessage({type:'convelta:close'}, config.origin); }
  $('close').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('message', e => {
    if (e.source !== parent || e.origin !== config.origin) return;
    if (e.data && e.data.type === 'convelta:visible') { visible = e.data.visible === true; if (visible) read(); }
  });
  async function poll() { if (started) await read(); setTimeout(poll, 5000); }
  if (started) { $('intro').hidden = true; read(); }
  setTimeout(poll, 5000);
})();`;
