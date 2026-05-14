/* ============================================================
   Zyro AI Chat Widget
   Zyrox Smartphone Store – AI Assistant
============================================================ */

(function () {
  'use strict';

  /* ── State ── */
  let isOpen = false;
  let isTyping = false;
  let conversationHistory = [];
  let greeted = false;

  /* ── Inline robot SVG — the full character used as the FAB ── */
  const ROBOT_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="100%" height="100%">
      <defs>
        <radialGradient id="zBg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#7c5ce7"/>
          <stop offset="100%" stop-color="#4834d4"/>
        </radialGradient>
        <radialGradient id="zEye" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#00f5ff"/>
          <stop offset="100%" stop-color="#0077aa"/>
        </radialGradient>
        <linearGradient id="zBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f0f0f8"/>
          <stop offset="100%" stop-color="#d0d0e8"/>
        </linearGradient>
        <filter id="zGlow">
          <feGaussianBlur stdDeviation="1.8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="zShadow">
          <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="rgba(0,0,0,0.5)"/>
        </filter>
      </defs>

      <!-- Shadow under robot -->
      <ellipse cx="50" cy="116" rx="22" ry="5" fill="rgba(0,0,0,0.25)"/>

      <!-- Left antenna -->
      <line x1="34" y1="22" x2="26" y2="8" stroke="#e53935" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="25" cy="7" r="4.5" fill="#4fc3f7" filter="url(#zGlow)"/>
      <circle cx="25" cy="7" r="2.5" fill="#b2ebf2"/>

      <!-- Right antenna -->
      <line x1="66" y1="22" x2="74" y2="8" stroke="#e53935" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="75" cy="7" r="4.5" fill="#4fc3f7" filter="url(#zGlow)"/>
      <circle cx="75" cy="7" r="2.5" fill="#b2ebf2"/>

      <!-- Yellow top cap -->
      <rect x="36" y="18" width="28" height="9" rx="4.5" fill="#ffc107"/>
      <rect x="40" y="16" width="20" height="6" rx="3" fill="#ffca28"/>

      <!-- Robot head -->
      <rect x="22" y="25" width="56" height="50" rx="10" fill="url(#zBody)" filter="url(#zShadow)"/>
      <rect x="22" y="25" width="56" height="50" rx="10" fill="none" stroke="rgba(120,100,200,0.2)" stroke-width="1"/>

      <!-- Dark visor -->
      <rect x="28" y="33" width="44" height="26" rx="6" fill="#12122a"/>
      <rect x="28" y="33" width="44" height="26" rx="6" fill="none" stroke="rgba(79,110,247,0.35)" stroke-width="1"/>

      <!-- Left eye -->
      <ellipse cx="41" cy="46" rx="7" ry="8" fill="#001020"/>
      <ellipse cx="41" cy="46" rx="5" ry="6.5" fill="url(#zEye)" filter="url(#zGlow)"/>
      <ellipse cx="41" cy="46" rx="2.8" ry="3.5" fill="#e0ffff"/>
      <ellipse cx="40" cy="44" rx="1.5" ry="1.5" fill="white" opacity="0.85"/>

      <!-- Right eye -->
      <ellipse cx="59" cy="46" rx="7" ry="8" fill="#001020"/>
      <ellipse cx="59" cy="46" rx="5" ry="6.5" fill="url(#zEye)" filter="url(#zGlow)"/>
      <ellipse cx="59" cy="46" rx="2.8" ry="3.5" fill="#e0ffff"/>
      <ellipse cx="58" cy="44" rx="1.5" ry="1.5" fill="white" opacity="0.85"/>

      <!-- Mouth grille -->
      <rect x="35" y="63" width="30" height="8" rx="4" fill="#1e1e3a"/>
      <line x1="40" y1="64.5" x2="40" y2="69.5" stroke="rgba(79,110,247,0.6)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="46" y1="64.5" x2="46" y2="69.5" stroke="rgba(79,110,247,0.6)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="52" y1="64.5" x2="52" y2="69.5" stroke="rgba(79,110,247,0.6)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="58" y1="64.5" x2="58" y2="69.5" stroke="rgba(79,110,247,0.6)" stroke-width="1.5" stroke-linecap="round"/>

      <!-- Left ear -->
      <rect x="14" y="34" width="9" height="20" rx="4" fill="#c8c8e0"/>
      <rect x="15.5" y="38" width="5" height="12" rx="2.5" fill="#a0a0c0"/>

      <!-- Right ear -->
      <rect x="77" y="34" width="9" height="20" rx="4" fill="#c8c8e0"/>
      <rect x="79.5" y="38" width="5" height="12" rx="2.5" fill="#a0a0c0"/>

      <!-- Neck -->
      <rect x="42" y="74" width="16" height="8" rx="3" fill="#c0c0d8"/>

      <!-- Body / torso -->
      <rect x="26" y="81" width="48" height="30" rx="10" fill="url(#zBody)" filter="url(#zShadow)"/>
      <rect x="26" y="81" width="48" height="30" rx="10" fill="none" stroke="rgba(120,100,200,0.15)" stroke-width="1"/>

      <!-- Chest panel -->
      <rect x="33" y="87" width="34" height="18" rx="5" fill="#1a1a2e"/>
      <!-- Chest lights -->
      <circle cx="41" cy="96" r="3.5" fill="#4f6ef7" opacity="0.9"/>
      <circle cx="50" cy="96" r="3.5" fill="#7c3aed" opacity="0.9"/>
      <circle cx="59" cy="96" r="3.5" fill="#4f6ef7" opacity="0.9"/>
      <!-- Chest light glow -->
      <circle cx="41" cy="96" r="2" fill="#818cf8"/>
      <circle cx="50" cy="96" r="2" fill="#a78bfa"/>
      <circle cx="59" cy="96" r="2" fill="#818cf8"/>
    </svg>
  `;

  /* ── Small robot SVG for avatars (header, bubbles, typing) ── */
  const ROBOT_AVATAR_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <radialGradient id="aBg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#7c5ce7"/>
          <stop offset="100%" stop-color="#4834d4"/>
        </radialGradient>
        <radialGradient id="aEye" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#00f5ff"/>
          <stop offset="100%" stop-color="#0077aa"/>
        </radialGradient>
        <linearGradient id="aBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f0f0f8"/>
          <stop offset="100%" stop-color="#d0d0e8"/>
        </linearGradient>
        <filter id="aGlow">
          <feGaussianBlur stdDeviation="1.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <!-- Circle bg -->
      <circle cx="50" cy="50" r="50" fill="url(#aBg)"/>
      <!-- Antennas -->
      <line x1="38" y1="18" x2="32" y2="8" stroke="#e53935" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="31" cy="7" r="3.5" fill="#4fc3f7" filter="url(#aGlow)"/>
      <line x1="62" y1="18" x2="68" y2="8" stroke="#e53935" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="69" cy="7" r="3.5" fill="#4fc3f7" filter="url(#aGlow)"/>
      <!-- Yellow cap -->
      <rect x="36" y="14" width="28" height="8" rx="4" fill="#ffc107"/>
      <!-- Head -->
      <rect x="24" y="20" width="52" height="46" rx="9" fill="url(#aBody)"/>
      <!-- Visor -->
      <rect x="30" y="28" width="40" height="24" rx="5" fill="#12122a"/>
      <!-- Eyes -->
      <ellipse cx="42" cy="40" rx="6" ry="7" fill="#001020"/>
      <ellipse cx="42" cy="40" rx="4.5" ry="5.5" fill="url(#aEye)" filter="url(#aGlow)"/>
      <ellipse cx="42" cy="40" rx="2.5" ry="3" fill="#e0ffff"/>
      <ellipse cx="58" cy="40" rx="6" ry="7" fill="#001020"/>
      <ellipse cx="58" cy="40" rx="4.5" ry="5.5" fill="url(#aEye)" filter="url(#aGlow)"/>
      <ellipse cx="58" cy="40" rx="2.5" ry="3" fill="#e0ffff"/>
      <!-- Mouth -->
      <rect x="36" y="56" width="28" height="7" rx="3.5" fill="#1e1e3a"/>
      <line x1="42" y1="57.5" x2="42" y2="61.5" stroke="rgba(79,110,247,0.7)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="50" y1="57.5" x2="50" y2="61.5" stroke="rgba(79,110,247,0.7)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="58" y1="57.5" x2="58" y2="61.5" stroke="rgba(79,110,247,0.7)" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Ears -->
      <rect x="16" y="30" width="9" height="16" rx="4" fill="#c8c8e0"/>
      <rect x="75" y="30" width="9" height="16" rx="4" fill="#c8c8e0"/>
      <!-- Body -->
      <rect x="28" y="68" width="44" height="26" rx="8" fill="url(#aBody)"/>
      <!-- Chest lights -->
      <circle cx="42" cy="81" r="3" fill="#4f6ef7" opacity="0.9"/>
      <circle cx="50" cy="81" r="3" fill="#7c3aed" opacity="0.9"/>
      <circle cx="58" cy="81" r="3" fill="#4f6ef7" opacity="0.9"/>
    </svg>
  `;

  /* ── Inject HTML ── */
  function injectWidget() {
    const html = `
      <!-- Zyro AI Robot FAB — the robot IS the button -->
      <div id="zyro-fab-wrap">
        <button id="zyro-fab" aria-label="Chat with Zyro AI" title="Chat with Zyro">
          <div class="zyro-robot-body zyro-fab-open">${ROBOT_SVG}</div>
          <div class="zyro-close-fab zyro-fab-close" style="display:none;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
        </button>
        <div class="zyro-fab-label">Ask Zyro</div>
      </div>

      <!-- Zyro Chat Box -->
      <div id="zyro-chatbox" role="dialog" aria-label="Zyro AI Chat" aria-hidden="true">
        <!-- Header -->
        <div class="zyro-header">
          <div class="zyro-header-left">
            <div class="zyro-avatar">${ROBOT_AVATAR_SVG}</div>
            <div>
              <div class="zyro-name">Zyro</div>
              <div class="zyro-status"><span class="zyro-dot"></span> Online · AI Assistant</div>
            </div>
          </div>
          <button class="zyro-close-btn" onclick="ZyroChat.close()" aria-label="Close chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Messages -->
        <div class="zyro-messages" id="zyro-messages" role="log" aria-live="polite"></div>

        <!-- Typing indicator -->
        <div class="zyro-typing" id="zyro-typing" style="display:none;">
          <div class="zyro-typing-avatar">${ROBOT_AVATAR_SVG}</div>
          <div class="zyro-typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>

        <!-- Quick Suggestions -->
        <div class="zyro-suggestions" id="zyro-suggestions">
          <button onclick="ZyroChat.sendQuick('What phones do you have?')">📱 Browse phones</button>
          <button onclick="ZyroChat.sendQuick('What are the current offers?')">🏷️ Current offers</button>
          <button onclick="ZyroChat.sendQuick('How do I track my order?')">📦 Track order</button>
          <button onclick="ZyroChat.sendQuick('Tell me about the wallet')">💰 Wallet info</button>
        </div>

        <!-- Input -->
        <div class="zyro-input-area">
          <textarea
            id="zyro-input"
            placeholder="Ask Zyro anything..."
            rows="1"
            aria-label="Message Zyro"
            onkeydown="ZyroChat.handleKey(event)"
            oninput="ZyroChat.autoResize(this)"
          ></textarea>
          <button id="zyro-send-btn" onclick="ZyroChat.send()" aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div class="zyro-footer">Powered by Zyro AI · Zyrox</div>
      </div>
    `;

    const container = document.createElement('div');
    container.id = 'zyro-widget-root';
    container.innerHTML = html;
    document.body.appendChild(container);

    injectStyles();

    document.getElementById('zyro-fab').addEventListener('click', ZyroChat.toggle);
  }

  /* ── Styles ── */
  function injectStyles() {
    const css = `
      #zyro-widget-root * { box-sizing: border-box; }

      /* ── FAB WRAP ── */
      #zyro-fab-wrap {
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        z-index: 9998;
        cursor: pointer;
      }

      /* ── FAB BUTTON — transparent, robot IS the button ── */
      #zyro-fab {
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        width: 80px;
        height: 96px;
        min-height: unset;
        min-width: unset;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        animation: zyro-float 3s ease-in-out infinite;
        filter: drop-shadow(0 8px 24px rgba(79,110,247,0.5)) drop-shadow(0 2px 8px rgba(0,0,0,0.4));
        transition: filter 0.3s ease, transform 0.3s ease;
      }
      #zyro-fab:hover {
        filter: drop-shadow(0 12px 32px rgba(79,110,247,0.75)) drop-shadow(0 4px 12px rgba(0,0,0,0.5));
        animation-play-state: paused;
        transform: scale(1.08) translateY(-4px);
      }
      #zyro-fab:active { transform: scale(0.94) !important; }

      .zyro-robot-body {
        width: 80px;
        height: 96px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .zyro-close-fab {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4f6ef7, #7c3aed);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        box-shadow: 0 6px 24px rgba(79,110,247,0.5);
        transition: transform 0.3s ease;
      }
      #zyro-fab:hover .zyro-close-fab { transform: rotate(90deg); }

      .zyro-fab-label {
        font-family: 'Inter', sans-serif;
        font-size: 11px;
        font-weight: 600;
        color: #a5b4fc;
        background: rgba(13,15,26,0.85);
        border: 1px solid rgba(79,110,247,0.3);
        border-radius: 20px;
        padding: 3px 10px;
        letter-spacing: 0.3px;
        backdrop-filter: blur(8px);
        white-space: nowrap;
        transition: all 0.3s ease;
        pointer-events: none;
      }
      #zyro-fab-wrap:hover .zyro-fab-label {
        background: rgba(79,110,247,0.2);
        color: #fff;
        border-color: rgba(79,110,247,0.6);
      }

      @keyframes zyro-float {
        0%   { transform: translateY(0px); }
        50%  { transform: translateY(-8px); }
        100% { transform: translateY(0px); }
      }

      /* Chat Box */
      #zyro-chatbox {
        position: fixed;
        bottom: 140px;
        right: 24px;
        width: 375px;
        max-width: calc(100vw - 32px);
        height: 545px;
        max-height: calc(100vh - 160px);
        background: #0d0f1a;
        border: 1px solid rgba(79,110,247,0.25);
        border-radius: 20px;
        display: flex;
        flex-direction: column;
        z-index: 9997;
        box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(79,110,247,0.1);
        transform: scale(0.85) translateY(20px);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease;
        transform-origin: bottom right;
        overflow: hidden;
      }
      #zyro-chatbox.zyro-open {
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: all;
      }

      /* Header */
      .zyro-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: linear-gradient(135deg, #1a1d2e 0%, #12151f 100%);
        border-bottom: 1px solid rgba(79,110,247,0.15);
        flex-shrink: 0;
      }
      .zyro-header-left { display: flex; align-items: center; gap: 10px; }
      .zyro-avatar {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .zyro-name { font-size: 15px; font-weight: 700; color: #fff; font-family: 'Inter', sans-serif; }
      .zyro-status { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #7b8fb5; font-family: 'Inter', sans-serif; }
      .zyro-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #22c55e;
        animation: zyro-blink 2s ease-in-out infinite;
      }
      @keyframes zyro-blink {
        0%,100% { opacity: 1; } 50% { opacity: 0.4; }
      }
      .zyro-close-btn {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        color: #7b8fb5;
        width: 30px; height: 30px;
        border-radius: 8px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s;
        padding: 0; min-height: unset; min-width: unset;
      }
      .zyro-close-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

      /* Messages */
      .zyro-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px 14px 8px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        scroll-behavior: smooth;
      }
      .zyro-messages::-webkit-scrollbar { width: 4px; }
      .zyro-messages::-webkit-scrollbar-track { background: transparent; }
      .zyro-messages::-webkit-scrollbar-thumb { background: rgba(79,110,247,0.3); border-radius: 4px; }

      /* Message bubbles */
      .zyro-msg {
        display: flex;
        gap: 8px;
        animation: zyro-msg-in 0.3s cubic-bezier(0.34,1.56,0.64,1);
      }
      @keyframes zyro-msg-in {
        from { opacity: 0; transform: translateY(10px) scale(0.95); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .zyro-msg.user { flex-direction: row-reverse; }

      .zyro-msg-avatar {
        width: 32px; height: 32px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 12px; font-weight: 700;
        flex-shrink: 0; align-self: flex-end;
        font-family: 'Inter', sans-serif;
        overflow: hidden;
      }
      .zyro-msg.bot .zyro-msg-avatar { background: transparent; }
      .zyro-msg.user .zyro-msg-avatar { background: linear-gradient(135deg, #1e293b, #334155); }

      .zyro-bubble {
        max-width: 78%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 13.5px;
        line-height: 1.55;
        font-family: 'Inter', sans-serif;
        word-break: break-word;
      }
      .zyro-msg.bot .zyro-bubble {
        background: #1a1d2e;
        color: #e2e8f0;
        border-bottom-left-radius: 4px;
        border: 1px solid rgba(79,110,247,0.12);
      }
      .zyro-msg.user .zyro-bubble {
        background: linear-gradient(135deg, #4f6ef7, #6366f1);
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .zyro-bubble strong { color: #a5b4fc; }
      .zyro-bubble a { color: #818cf8; text-decoration: underline; }
      .zyro-bubble ul { margin: 6px 0 0 16px; padding: 0; }
      .zyro-bubble li { margin-bottom: 3px; }

      /* ── Route link pills ── */
      .zyro-route-link {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: linear-gradient(135deg, rgba(79,110,247,0.18), rgba(124,58,237,0.18));
        border: 1px solid rgba(79,110,247,0.45);
        color: #a5b4fc !important;
        text-decoration: none !important;
        font-size: 12px;
        font-weight: 600;
        padding: 4px 11px 4px 8px;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
        vertical-align: middle;
        margin: 2px 2px;
        font-family: 'Inter', sans-serif;
      }
      .zyro-route-link::before {
        content: '↗';
        font-size: 11px;
        opacity: 0.8;
      }
      .zyro-route-link:hover {
        background: linear-gradient(135deg, rgba(79,110,247,0.35), rgba(124,58,237,0.35));
        border-color: rgba(79,110,247,0.8);
        color: #fff !important;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(79,110,247,0.3);
      }
      .zyro-route-link:active {
        transform: translateY(0px) scale(0.97);
      }

      /* External links */
      .zyro-external-link {
        color: #818cf8 !important;
        text-decoration: underline !important;
        text-underline-offset: 2px;
      }
      .zyro-external-link:hover { color: #a5b4fc !important; }

      .zyro-time {
        font-size: 10px;
        color: #4b5563;
        margin-top: 3px;
        font-family: 'Inter', sans-serif;
        text-align: right;
      }
      .zyro-msg.bot .zyro-time { text-align: left; }

      /* Typing indicator */
      .zyro-typing {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 14px 8px;
        flex-shrink: 0;
      }
      .zyro-typing-avatar {
        width: 32px; height: 32px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
      }
      .zyro-typing-dots {
        background: #1a1d2e;
        border: 1px solid rgba(79,110,247,0.12);
        border-radius: 16px;
        padding: 10px 14px;
        display: flex; gap: 4px; align-items: center;
      }
      .zyro-typing-dots span {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: #4f6ef7;
        animation: zyro-bounce 1.2s ease-in-out infinite;
      }
      .zyro-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
      .zyro-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes zyro-bounce {
        0%,60%,100% { transform: translateY(0); opacity: 0.5; }
        30%          { transform: translateY(-5px); opacity: 1; }
      }

      /* Quick suggestions */
      .zyro-suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 6px 14px 8px;
        flex-shrink: 0;
      }
      .zyro-suggestions button {
        background: rgba(79,110,247,0.08);
        border: 1px solid rgba(79,110,247,0.2);
        color: #a5b4fc;
        font-size: 11.5px;
        padding: 5px 10px;
        border-radius: 20px;
        cursor: pointer;
        font-family: 'Inter', sans-serif;
        transition: all 0.2s;
        white-space: nowrap;
        min-height: unset; min-width: unset;
      }
      .zyro-suggestions button:hover {
        background: rgba(79,110,247,0.18);
        border-color: rgba(79,110,247,0.4);
        color: #fff;
        transform: translateY(-1px);
      }

      /* Input area */
      .zyro-input-area {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        padding: 10px 14px;
        border-top: 1px solid rgba(255,255,255,0.05);
        background: #0d0f1a;
        flex-shrink: 0;
      }
      #zyro-input {
        flex: 1;
        background: #1a1d2e;
        border: 1px solid rgba(79,110,247,0.2);
        border-radius: 12px;
        color: #e2e8f0;
        font-size: 13.5px;
        font-family: 'Inter', sans-serif;
        padding: 10px 14px;
        resize: none;
        outline: none;
        max-height: 100px;
        line-height: 1.5;
        transition: border-color 0.2s;
        min-height: unset;
      }
      #zyro-input:focus { border-color: rgba(79,110,247,0.5); }
      #zyro-input::placeholder { color: #4b5563; }

      #zyro-send-btn {
        width: 40px; height: 40px;
        border-radius: 12px;
        background: linear-gradient(135deg, #4f6ef7, #7c3aed);
        border: none;
        color: #fff;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s;
        padding: 0; min-height: unset; min-width: unset;
      }
      #zyro-send-btn:hover { transform: scale(1.08); box-shadow: 0 4px 16px rgba(79,110,247,0.4); }
      #zyro-send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

      /* Footer */
      .zyro-footer {
        text-align: center;
        font-size: 10px;
        color: #374151;
        padding: 6px;
        font-family: 'Inter', sans-serif;
        flex-shrink: 0;
      }

      /* Mobile adjustments */
      @media (max-width: 480px) {
        #zyro-fab-wrap { bottom: 76px; right: 14px; }
        #zyro-fab { width: 68px; height: 82px; }
        .zyro-robot-body { width: 68px; height: 82px; }
        #zyro-chatbox { bottom: 160px; right: 8px; left: 8px; width: auto; max-width: 100%; }
      }
    `;

    const style = document.createElement('style');
    style.id = 'zyro-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── Helpers ── */
  function getTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getUserName() {
    // Try to get from the DOM (navbar shows user's first name)
    const profileBtn = document.querySelector('.profile-btn span');
    if (profileBtn && profileBtn.textContent.trim() && profileBtn.textContent.trim() !== 'ACCOUNT') {
      return profileBtn.textContent.trim();
    }
    // Fallback: window variable injected by EJS
    if (window.__zyroUserName) return window.__zyroUserName;
    return null;
  }

  function scrollToBottom() {
    const msgs = document.getElementById('zyro-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  function appendMessage(role, text) {
    const msgs = document.getElementById('zyro-messages');
    const isBot = role === 'bot';

    const userName = getUserName();
    const userInitial = userName ? userName.charAt(0).toUpperCase() : 'U';

    const wrapper = document.createElement('div');
    wrapper.className = `zyro-msg ${isBot ? 'bot' : 'user'}`;

    // Format text: convert markdown links, **bold**, *italic*, newlines
    let formatted = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    // Convert markdown links [text](/route) to clickable route buttons
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, route) => {
      // Check if it's an internal route (starts with /)
      if (route.startsWith('/')) {
        return `<a href="${route}" class="zyro-route-link" onclick="ZyroChat.navigateTo('${route}'); return false;">${linkText}</a>`;
      }
      // External link
      return `<a href="${route}" target="_blank" rel="noopener noreferrer" class="zyro-external-link">${linkText}</a>`;
    });

    const botAvatarHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32" height="32"><defs><radialGradient id="mBg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#7c5ce7"/><stop offset="100%" stop-color="#4834d4"/></radialGradient><radialGradient id="mEye" cx="50%" cy="30%" r="70%"><stop offset="0%" stop-color="#00f5ff"/><stop offset="100%" stop-color="#0077aa"/></radialGradient><linearGradient id="mBody" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f0f0f8"/><stop offset="100%" stop-color="#d0d0e8"/></linearGradient><filter id="mGlow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="50" cy="50" r="50" fill="url(#mBg)"/><line x1="38" y1="18" x2="32" y2="8" stroke="#e53935" stroke-width="2.5" stroke-linecap="round"/><circle cx="31" cy="7" r="3.5" fill="#4fc3f7" filter="url(#mGlow)"/><line x1="62" y1="18" x2="68" y2="8" stroke="#e53935" stroke-width="2.5" stroke-linecap="round"/><circle cx="69" cy="7" r="3.5" fill="#4fc3f7" filter="url(#mGlow)"/><rect x="36" y="14" width="28" height="8" rx="4" fill="#ffc107"/><rect x="24" y="20" width="52" height="46" rx="9" fill="url(#mBody)"/><rect x="30" y="28" width="40" height="24" rx="5" fill="#12122a"/><ellipse cx="42" cy="40" rx="6" ry="7" fill="#001020"/><ellipse cx="42" cy="40" rx="4.5" ry="5.5" fill="url(#mEye)" filter="url(#mGlow)"/><ellipse cx="42" cy="40" rx="2.5" ry="3" fill="#e0ffff"/><ellipse cx="58" cy="40" rx="6" ry="7" fill="#001020"/><ellipse cx="58" cy="40" rx="4.5" ry="5.5" fill="url(#mEye)" filter="url(#mGlow)"/><ellipse cx="58" cy="40" rx="2.5" ry="3" fill="#e0ffff"/><rect x="36" y="56" width="28" height="7" rx="3.5" fill="#1e1e3a"/><rect x="16" y="30" width="9" height="16" rx="4" fill="#c8c8e0"/><rect x="75" y="30" width="9" height="16" rx="4" fill="#c8c8e0"/><rect x="28" y="68" width="44" height="26" rx="8" fill="url(#mBody)"/><circle cx="42" cy="81" r="3" fill="#4f6ef7" opacity="0.9"/><circle cx="50" cy="81" r="3" fill="#7c3aed" opacity="0.9"/><circle cx="58" cy="81" r="3" fill="#4f6ef7" opacity="0.9"/></svg>`;

    wrapper.innerHTML = `
      <div class="zyro-msg-avatar">${isBot ? botAvatarHtml : userInitial}</div>
      <div>
        <div class="zyro-bubble">${formatted}</div>
        <div class="zyro-time">${getTime()}</div>
      </div>
    `;

    msgs.appendChild(wrapper);
    scrollToBottom();
  }

  function setTyping(show) {
    isTyping = show;
    const el = document.getElementById('zyro-typing');
    const btn = document.getElementById('zyro-send-btn');
    if (el) el.style.display = show ? 'flex' : 'none';
    if (btn) btn.disabled = show;
    if (show) scrollToBottom();
  }

  function hideSuggestions() {
    const s = document.getElementById('zyro-suggestions');
    if (s) s.style.display = 'none';
  }

  /* ── Greeting ── */
  function sendGreeting() {
    if (greeted) return;
    greeted = true;

    const userName = getUserName();
    const hour = new Date().getHours();
    const timeGreet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const nameStr = userName ? `, ${userName}` : '';

    const greeting = `${timeGreet}${nameStr}! 👋 I'm **Zyro**, your personal AI assistant at **Zyrox**.\n\nI can help you with:\n• 📱 Finding the perfect smartphone\n• 🏷️ Current offers & coupons\n• 📦 Order tracking & returns\n• 💰 Wallet & payments\n• 🔧 Any questions about Zyrox\n\nWhat can I help you with today?`;

    setTimeout(() => {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        appendMessage('bot', greeting);
      }, 1200);
    }, 400);
  }

  /* ── API Call ── */
  async function callZyroAPI(userMessage) {
    conversationHistory.push({ role: 'user', content: userMessage });

    try {
      const response = await fetch('/api/zyro-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: conversationHistory.slice(-10) // last 10 turns for context
        })
      });

      if (!response.ok) throw new Error('API error');

      const data = await response.json();
      const reply = data.reply || "I'm sorry, I couldn't process that. Please try again.";

      conversationHistory.push({ role: 'assistant', content: reply });
      return reply;
    } catch (err) {
      console.error('Zyro API error:', err);
      return "Sorry, I'm having trouble connecting right now. Please try again in a moment! 🙏";
    }
  }

  /* ── Public API ── */
  window.ZyroChat = {
    toggle() {
      isOpen ? ZyroChat.close() : ZyroChat.open();
    },

    open() {
      isOpen = true;
      const box = document.getElementById('zyro-chatbox');
      const fab = document.getElementById('zyro-fab');
      const label = document.querySelector('.zyro-fab-label');
      if (box) {
        box.classList.add('zyro-open');
        box.setAttribute('aria-hidden', 'false');
      }
      if (fab) {
        fab.querySelector('.zyro-robot-body').style.display = 'none';
        fab.querySelector('.zyro-close-fab').style.display = 'flex';
        fab.style.animation = 'none';
        fab.style.width = '56px';
        fab.style.height = '56px';
      }
      if (label) label.style.display = 'none';
      sendGreeting();
      setTimeout(() => {
        const input = document.getElementById('zyro-input');
        if (input) input.focus();
      }, 350);
    },

    close() {
      isOpen = false;
      const box = document.getElementById('zyro-chatbox');
      const fab = document.getElementById('zyro-fab');
      const label = document.querySelector('.zyro-fab-label');
      if (box) {
        box.classList.remove('zyro-open');
        box.setAttribute('aria-hidden', 'true');
      }
      if (fab) {
        fab.querySelector('.zyro-robot-body').style.display = 'flex';
        fab.querySelector('.zyro-close-fab').style.display = 'none';
        fab.style.animation = '';
        fab.style.width = '80px';
        fab.style.height = '96px';
      }
      if (label) label.style.display = '';
    },

    async send() {
      const input = document.getElementById('zyro-input');
      const message = input ? input.value.trim() : '';
      if (!message || isTyping) return;

      hideSuggestions();
      input.value = '';
      input.style.height = 'auto';

      appendMessage('user', message);
      setTyping(true);

      const reply = await callZyroAPI(message);

      setTyping(false);
      appendMessage('bot', reply);
    },

    async sendQuick(message) {
      hideSuggestions();
      appendMessage('user', message);
      setTyping(true);

      const reply = await callZyroAPI(message);

      setTyping(false);
      appendMessage('bot', reply);
    },

    handleKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ZyroChat.send();
      }
    },

    autoResize(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    },

    navigateTo(route) {
      // Close chat smoothly then navigate
      ZyroChat.close();
      setTimeout(() => {
        window.location.href = route;
      }, 200);
    }
  };

  /* ── Init ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidget);
  } else {
    injectWidget();
  }
})();
