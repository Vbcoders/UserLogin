/* Supplemental UI fixes for the private chat. The main chat/encryption logic lives in chat.html. */
(function () {
  'use strict';

  function get(id) { return document.getElementById(id); }

  function ensureReplyComposer() {
    const composer = document.querySelector('.composer');
    if (!composer || get('replyComposer')) return;

    const box = document.createElement('div');
    box.id = 'replyComposer';
    box.className = 'replyComposer';
    box.innerHTML =
      '<div class="replyComposerText">' +
        '<strong id="replyComposerLabel">Replying to message</strong>' +
        '<span id="replyComposerValue"></span>' +
      '</div>' +
      '<button id="replyComposerClose" class="replyComposerClose" type="button">×</button>';

    composer.insertBefore(box, composer.firstChild);

    get('replyComposerClose').onclick = function () {
      window.replyTarget = null;
      box.classList.remove('show');
      const input = get('input');
      if (input) input.focus();
    };
  }

  function showReplyPreview() {
    ensureReplyComposer();
    const box = get('replyComposer');
    const target = window.replyTarget;
    if (!box || !target) return;

    const value = get('replyComposerValue');
    if (value) {
      value.textContent = target.plain && target.plain.text
        ? target.plain.text
        : '📷 Image';
    }
    box.classList.add('show');
  }

  function clearReplyPreview() {
    const box = get('replyComposer');
    if (box) box.classList.remove('show');
    window.replyTarget = null;
  }

  function install() {
    ensureReplyComposer();

    const replyButton = get('reply');
    if (replyButton && !replyButton.dataset.replyFixInstalled) {
      replyButton.dataset.replyFixInstalled = '1';
      replyButton.addEventListener('click', function () {
        // chat.html sets replyTarget in its existing handler.
        setTimeout(showReplyPreview, 0);
      });
    }

    const sendButton = get('send');
    if (sendButton && !sendButton.dataset.replyFixInstalled) {
      sendButton.dataset.replyFixInstalled = '1';
      sendButton.addEventListener('click', function () {
        // send() is async. Wait for it to finish, then force the composer
        // preview closed so a sent reply can never remain in the typing row.
        setTimeout(clearReplyPreview, 150);
        setTimeout(clearReplyPreview, 500);
        setTimeout(clearReplyPreview, 1200);
      });
    }

    const input = get('input');
    if (input && !input.dataset.replyFixInstalled) {
      input.dataset.replyFixInstalled = '1';
      input.addEventListener('input', function () {
        // If the input has been cleared by send(), the reply preview must go.
        if (!input.value.trim() && !window.replyTarget) {
          const box = get('replyComposer');
          if (box) box.classList.remove('show');
        }
      });
    }
  }

  const observer = new MutationObserver(install);
  function start() {
    install();
    const root = get('root');
    if (root) observer.observe(root, { childList: true, subtree: true });
    setInterval(install, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
