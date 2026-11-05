/**
 * The `usa serve` landing page: a form that drives the JSON API and renders
 * results inline. Everything dynamic is built with textContent and
 * createElement — the string `innerHTML` must never appear in this file
 * (report content derives from audited trees and is untrusted). There is a
 * test asserting that.
 */
export function uiPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>USA — local audit server</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
label { display: block; margin: .5rem 0; }
input, select { font: inherit; padding: .2rem .4rem; }
#status { margin: 1rem 0; font-weight: bold; }
.finding { border: 1px solid currentColor; border-radius: .5rem; padding: .5rem 1rem; margin: .5rem 0; }
pre { white-space: pre-wrap; word-break: break-word; background: rgba(127,127,127,.12); padding: 1rem; }
</style>
</head>
<body>
<h1>USA — local audit server</h1>
<p>Loopback only. Paste the bearer token printed at startup; it authenticates every API call.</p>
<form id="run">
<label>Token <input id="token" type="password" autocomplete="off"></label>
<label>Target <input id="target" value="."></label>
<label>Depth <select id="depth"><option>quick</option><option selected>standard</option><option>deep</option></select></label>
<label>Format <select id="format"><option selected>json</option><option>html</option><option>md</option></select></label>
<button type="submit">Run audit</button>
</form>
<div id="status"></div>
<div id="result"></div>
<h2>History</h2>
<button id="refresh" type="button">Refresh</button>
<div id="history"></div>
<script>
(function () {
  var form = document.getElementById('run');
  var status = document.getElementById('status');
  var result = document.getElementById('result');
  function say(text) { status.textContent = text; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function line(parent, tag, text) {
    var el = document.createElement(tag);
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }
  function api(path, options) {
    var token = document.getElementById('token').value;
    options = options || {};
    options.headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    return fetch(path, options).then(function (r) {
      return r.json().then(function (body) { return { code: r.status, body: body }; });
    });
  }
  function loadHistory() {
    var history = document.getElementById('history');
    clear(history);
    api('/api/audits').then(function (got) {
      if (got.code !== 200) { line(history, 'p', 'History: ' + (got.body.error || got.code)); return; }
      (got.body.audits || []).forEach(function (a) {
        var row = line(history, 'div', '');
        var link = document.createElement('a');
        link.href = '#';
        link.textContent = a.id.slice(0, 8) + ' — ' + a.status + ' — ' + a.options.target;
        link.addEventListener('click', function (ev) {
          ev.preventDefault();
          api('/api/audits/' + a.id).then(function (one) {
            if (one.code !== 200) { say('Error: ' + (one.body.error || one.code)); return; }
            say(one.body.status === 'done' ? 'Done.' : one.body.status + '.');
            if (one.body.status === 'done') render(one.body);
          }).catch(function (err) { say('Request failed: ' + err); });
        });
        row.appendChild(link);
      });
    }).catch(function (err) { line(history, 'p', 'History failed: ' + err); });
  }
  document.getElementById('refresh').addEventListener('click', loadHistory);
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    clear(result);
    var payload = {
      target: document.getElementById('target').value,
      depth: document.getElementById('depth').value,
      format: document.getElementById('format').value,
    };
    say('Starting…');
    api('/api/audits', { method: 'POST', body: JSON.stringify(payload) }).then(function (started) {
      if (started.code !== 202) { say('Error: ' + (started.body.error || started.code)); return; }
      say('Running…');
      var timer = setInterval(function () {
        api('/api/audits/' + started.body.id).then(function (got) {
          if (got.code !== 200) { clearInterval(timer); say('Error: ' + (got.body.error || got.code)); return; }
          if (got.body.status === 'running') return;
          clearInterval(timer);
          if (got.body.status === 'error') { say('Audit failed: ' + got.body.error); return; }
          say('Done.');
          render(got.body);
          loadHistory();
        }).catch(function (err) { clearInterval(timer); say('Request failed: ' + err); });
      }, 1000);
    }).catch(function (err) { say('Request failed: ' + err); });
  });
  function render(job) {
    clear(result);
    if (job.options.format !== 'json') {
      line(result, 'pre', job.report);
      return;
    }
    var doc;
    try { doc = JSON.parse(job.report); }
    catch (err) { line(result, 'pre', job.report); return; }
    var findings = doc.findings || [];
    var open = findings.filter(function (f) { return f.status !== 'PASS' && f.status !== 'UNKNOWN'; });
    var headline = doc.score.overall === null
      ? 'insufficient evidence · ' + doc.score.automationCoverage + '% verified'
      : doc.score.overall + ' / 100 · ' + doc.score.automationCoverage + '% verified';
    line(result, 'h2', 'Score ' + headline + ' — ' + open.length + ' open findings');
    open.forEach(function (f) {
      var box = line(result, 'div', '');
      box.className = 'finding';
      line(box, 'h3', f.ruleId + ' — ' + f.title);
      line(box, 'p', f.message);
    });
  }
})();
</script>
</body>
</html>
`;
}
