/*
 * A ponte da mudança de endereço (ver src/app/core/move-house.ts).
 *
 * O site saiu de igorsolerc.github.io/mural-de-jogos para murall.igorsc.com.br. O que o mural guarda no
 * navegador (localStorage e IndexedDB) é de cada endereço: o novo começa vazio. Esta página, aberta pelo
 * endereço novo numa janela, roda no endereço ANTIGO (o service worker de lá a guardou antes da mudança e
 * a serve do cache, mesmo com o GitHub redirecionando o resto), lê o mural deste navegador e entrega para
 * a janela que a abriu, só se ela for o endereço novo (o `postMessage` com a origem certa garante).
 *
 * Fica de fora o login (a sessão e a conta): no endereço novo a pessoa entra de novo.
 */
(function () {
  'use strict';
  var NOVO = 'https://murall.igorsc.com.br';
  var ANTIGO = 'https://igorsolerc.github.io';
  var PREFIXOS = ['mural-de-jogos:', 'meu-mural:'];
  var FORA = ['meu-mural:nuvem:sessao', 'meu-mural:nuvem:conta'];
  var msg = document.getElementById('msg');

  function dizer(texto) {
    if (msg) msg.textContent = texto;
  }

  if (!window.opener) {
    dizer('Esta página só serve para levar o mural para o endereço novo. Abra o Murall em ' + NOVO + '.');
    return;
  }

  // aberta já no endereço novo: este navegador não guardou a página do antigo (não passou por ele depois
  // da preparação da mudança). Avisa quem abriu e fecha.
  if (location.origin !== ANTIGO) {
    try {
      window.opener.postMessage({ tipo: 'murall-ponte', semAntigo: true }, location.origin);
    } catch (e) {
      /* quem abriu já fechou */
    }
    dizer('Este navegador não tem mais o endereço antigo guardado.');
    setTimeout(function () {
      window.close();
    }, 1500);
    return;
  }

  function guardados() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k === null || FORA.indexOf(k) >= 0) continue;
        if (PREFIXOS.some(function (p) { return k.indexOf(p) === 0; })) out[k] = localStorage.getItem(k);
      }
    } catch (e) {
      /* sem localStorage */
    }
    return out;
  }

  function banco() {
    return new Promise(function (resolve) {
      var out = {};
      var req;
      try {
        req = indexedDB.open('meu-mural:dados', 1);
      } catch (e) {
        resolve(out);
        return;
      }
      req.onupgradeneeded = function () {
        req.result.createObjectStore('chaves');
      };
      req.onerror = req.onblocked = function () {
        resolve(out);
      };
      req.onsuccess = function () {
        var db = req.result;
        try {
          var tx = db.transaction('chaves');
          var cur = tx.objectStore('chaves').openCursor();
          cur.onsuccess = function () {
            var c = cur.result;
            if (!c) return;
            if (typeof c.value === 'string') out[String(c.key)] = c.value;
            c.continue();
          };
          tx.oncomplete = function () {
            db.close();
            resolve(out);
          };
          tx.onerror = tx.onabort = function () {
            db.close();
            resolve(out);
          };
        } catch (e) {
          db.close();
          resolve(out);
        }
      };
    });
  }

  banco().then(function (idb) {
    try {
      window.opener.postMessage({ tipo: 'murall-ponte', ls: guardados(), idb: idb }, NOVO);
      dizer('Pronto. Pode voltar para o Murall.');
    } catch (e) {
      dizer('Não deu para entregar o mural: a janela do Murall foi fechada. Tente de novo por lá.');
      return;
    }
    setTimeout(function () {
      window.close();
    }, 800);
  });
})();
