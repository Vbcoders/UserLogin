/* Private chat UI/security enhancements. */
(function () {
  'use strict';

  const get = id => document.getElementById(id);
  const css = document.createElement('style');
  css.textContent = `
    .meta.receipt-sent{opacity:.65}.meta.receipt-delivered{opacity:.75}.meta.receipt-read{color:#2563eb;opacity:1;font-weight:700}
    .replyQuote{cursor:pointer}.replyQuote.reply-highlight{animation:replyPulse 1.4s ease;border-radius:8px}
    @keyframes replyPulse{0%,100%{outline:0}30%{outline:3px solid #60a5fa;outline-offset:2px}}
    #screenshotWarning{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(.96);z-index:10000;display:none;width:min(90vw,430px);padding:24px 22px;border-radius:20px;background:rgba(15,23,42,.96);color:#fff;text-align:center;box-shadow:0 20px 70px rgba(0,0,0,.35);backdrop-filter:blur(12px)}
    #screenshotWarning.show{display:block;animation:screenshotIn .18s ease-out forwards}
    #screenshotWarning .sw-icon{font-size:34px;margin-bottom:8px}#screenshotWarning .sw-title{font-size:19px;font-weight:800}#screenshotWarning .sw-text{font-size:13px;opacity:.82;margin-top:6px}
    @keyframes screenshotIn{to{transform:translate(-50%,-50%) scale(1)}}
  `;
  document.head.appendChild(css);

  function screenshotWarning(reason) {
    let box = get('screenshotWarning');
    if (!box) {
      box = document.createElement('div');
      box.id = 'screenshotWarning';
      box.innerHTML = '<div class="sw-icon">⚠️</div><div class="sw-title">Screenshot attempt detected</div><div class="sw-text"></div>';
      document.body.appendChild(box);
    }
    const user = window.firebase?.auth?.().currentUser;
    const name = user?.displayName || user?.email?.split('@')[0] || 'User';
    box.querySelector('.sw-text').textContent = name + ' — trying to take a screenshot of this chat.';
    box.dataset.reason = reason || 'unknown';
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
    clearTimeout(box._hideTimer);
    box._hideTimer = setTimeout(() => box.classList.remove('show'), 2800);
  }

  // Web/Chrome limitation: browsers do not expose a native Android screenshot
  // event. These handlers cover screenshot keyboard shortcuts and browser
  // lifecycle transitions that some Android/browser configurations expose.
  document.addEventListener('keydown', e => {
    const k = String(e.key || '').toLowerCase();
    if (k === 'printscreen' || (e.shiftKey && e.ctrlKey && k === 's') || (e.shiftKey && e.metaKey && (k === '3' || k === '4'))) {
      e.preventDefault();
      screenshotWarning('keyboard');
    }
  }, true);

  let lifecycleCandidate = false;
  let lifecycleTimer = null;
  function markLifecycleCandidate(reason) {
    if (document.visibilityState !== 'visible') return;
    lifecycleCandidate = true;
    clearTimeout(lifecycleTimer);
    lifecycleTimer = setTimeout(() => { lifecycleCandidate = false; }, 1400);
    screenshotWarning(reason);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lifecycleCandidate = true;
      clearTimeout(lifecycleTimer);
      lifecycleTimer = setTimeout(() => { lifecycleCandidate = false; }, 1400);
    } else if (lifecycleCandidate) {
      markLifecycleCandidate('visibility');
    }
  }, true);
  window.addEventListener('blur', () => {
    clearTimeout(lifecycleTimer);
    lifecycleCandidate = true;
    lifecycleTimer = setTimeout(() => { lifecycleCandidate = false; }, 1200);
  }, true);
  window.addEventListener('focus', () => {
    if (lifecycleCandidate) markLifecycleCandidate('focus');
  }, true);
  window.addEventListener('beforeprint', () => screenshotWarning('print'), true);

  function jumpToReply(quote) {
    const rows = Array.from(document.querySelectorAll('#messages .row'));
    const wanted = String(quote.textContent || '').replace(/^↩\s*/, '').trim();
    if (!wanted) return;
    const currentRow = quote.closest('.row');
    const currentIndex = rows.indexOf(currentRow);
    let target = null;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const text = rows[i].querySelector('.text,.caption');
      if (text && text.textContent.trim() === wanted) { target = rows[i]; break; }
    }
    if (!target) {
      for (let i = 0; i < currentIndex; i++) {
        const text = rows[i].querySelector('.text,.caption');
        if (text && text.textContent.trim() === wanted) { target = rows[i]; }
      }
    }
    if (!target) return;
    target.scrollIntoView({behavior:'smooth',block:'center'});
    const bubble = target.querySelector('.bubble');
    if (bubble) {
      bubble.classList.remove('reply-highlight');
      void bubble.offsetWidth;
      bubble.classList.add('reply-highlight');
      setTimeout(() => bubble.classList.remove('reply-highlight'), 1500);
    }
  }

  function installReplyJump() {
    document.querySelectorAll('#messages .replyQuote').forEach(q => {
      if (q.dataset.jumpInstalled) return;
      q.dataset.jumpInstalled = '1';
      q.addEventListener('click', e => { e.stopPropagation(); jumpToReply(q); });
    });
  }

  function pairMatches(m, uid, other) {
    return !!m && ((m.uid === uid && m.recipientUid === other) || (m.uid === other && m.recipientUid === uid));
  }

  function getChatRows(snap, uid) {
    const rows = [];
    let other = null;
    snap.forEach(x => {
      const m = x.val();
      if (!m || !m.uid || !m.recipientUid) return;
      if (m.uid === uid) other = other || m.recipientUid;
      else if (m.recipientUid === uid) other = other || m.uid;
    });
    snap.forEach(x => {
      const m = x.val();
      if (!m || !pairMatches(m, uid, other)) return;
      rows.push({...m,key:x.key});
    });
    rows.sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
    return {rows, other};
  }

  async function markReceipts() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const snap = await firebase.database().ref('chats').once('value');
    const {rows} = getChatRows(snap, user.uid);
    const visible = document.visibilityState === 'visible';
    const updates = {};
    rows.forEach(m => {
      if (m.uid !== user.uid && m.recipientUid === user.uid) {
        if (m.deliveryStatus !== 'read') updates['chats/' + m.key + '/deliveryStatus'] = visible ? 'read' : 'delivered';
        if (visible) updates['chats/' + m.key + '/readAt'] = firebase.database.ServerValue.TIMESTAMP;
        else if (!m.deliveredAt) updates['chats/' + m.key + '/deliveredAt'] = firebase.database.ServerValue.TIMESTAMP;
      }
    });
    if (Object.keys(updates).length) await firebase.database().ref().update(updates).catch(()=>{});
    updateReceiptLabels(rows, user.uid);
  }

  function updateReceiptLabels(rows, uid) {
    const domRows = Array.from(document.querySelectorAll('#messages .row'));
    rows.forEach((m, i) => {
      if (m.uid !== uid || !domRows[i]) return;
      const meta = domRows[i].querySelector('.meta');
      if (!meta) return;
      const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      const status = m.deliveryStatus === 'read' ? '✓✓' : m.deliveryStatus === 'delivered' ? '✓✓' : '✓';
      meta.textContent = time + '  ' + status;
      meta.classList.remove('receipt-sent','receipt-delivered','receipt-read');
      meta.classList.add(m.deliveryStatus === 'read' ? 'receipt-read' : m.deliveryStatus === 'delivered' ? 'receipt-delivered' : 'receipt-sent');
    });
  }

  let receiptTimer = null;
  function startReceipts() {
    const run = () => {
      clearTimeout(receiptTimer);
      receiptTimer = setTimeout(async () => {
        try { await markReceipts(); } catch (_) {}
      }, 350);
    };
    run();
    document.addEventListener('visibilitychange', run);
    const messages = get('messages');
    if (messages) new MutationObserver(() => { installReplyJump(); run(); }).observe(messages,{childList:true,subtree:true});
    setInterval(run, 2500);
  }

  function start() {
    startReceipts();
    installReplyJump();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
