/* Classic script (not a module). Capacitor's capacitor:// handler answers same-origin
   loads, but WebKit refuses CORS-anonymous module loads on that custom scheme.
   This file must stay a classic script without a crossorigin attribute so it
   still runs when the module graph does not. Keep nativeShell in sync with
   src/fms/boot-diagnostic.test.ts. */
(function () {
  function nativeShell(protocol, forced) {
    return forced === true || protocol === 'capacitor:' || protocol === 'ionic:';
  }
  var root = document.documentElement;
  var armed = nativeShell(location.protocol, window.__forceIosShell === true);
  if (armed) root.classList.add('ios-shell');
  var panel = document.getElementById('boot-diagnostic');
  var phase = 'html';
  var notes = ['列国纪正在启动…', location.protocol + '//' + location.host + location.pathname + location.search];
  function paint(kind) {
    if (!panel || !armed || phase === 'map') return;
    panel.hidden = false;
    panel.dataset.kind = kind;
    panel.textContent = notes.join('\n');
  }
  window.__lieguojiNativeShell = nativeShell;
  window.__lieguojiBoot = function (next, detail) {
    phase = next;
    if (detail) notes.push(detail);
    if (next === 'module') notes[0] = '页面脚本已运行，正在绘制地图…';
    if (next === 'map') {
      if (panel) { panel.hidden = true; panel.dataset.kind = 'map'; }
      return;
    }
    if (next === 'error') { notes[0] = '地图没有显示'; paint('error'); return; }
    paint('pending');
  };
  window.addEventListener('error', function (event) {
    notes.push('错误 ' + (event && event.message ? event.message : '脚本'));
    if (phase !== 'map') { phase = 'error'; paint('error'); }
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    notes.push('未处理异常 ' + (reason && reason.message ? reason.message : String(reason)));
    if (phase !== 'map') { phase = 'error'; paint('error'); }
  });
  setTimeout(function () { if (armed && phase !== 'map' && phase !== 'error') paint('pending'); }, 1500);
  setTimeout(function () {
    if (!armed || phase === 'map') return;
    var scripts = [];
    var list = document.scripts;
    for (var i = 0; i < list.length; i++) {
      var script = list[i];
      scripts.push((script.type || 'classic') + (script.src ? ' ' + script.getAttribute('src') : ' inline') + (script.hasAttribute('crossorigin') ? ' crossorigin' : ''));
    }
    notes.push('阶段 ' + phase);
    notes.push('脚本 ' + scripts.join(' | '));
    var canvas = document.querySelector('canvas');
    notes.push(canvas ? '画布 ' + canvas.width + '×' + canvas.height + '，显示 ' + canvas.clientWidth + '×' + canvas.clientHeight : '页面里没有画布');
    notes.push('安全上下文 ' + (window.isSecureContext ? '是' : '否'));
    if (phase === 'html') notes.push('模块脚本没有执行。capacitor: 上带 crossorigin 的模块会被 WebKit 丢掉：本地协议的响应没有 Access-Control-Allow-Origin。');
    notes[0] = '地图没有显示';
    phase = 'error';
    paint('error');
  }, 12000);
})();
