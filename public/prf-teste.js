/*
 * O teste do PRF (temporário, ver a seção 16.9 do PLANO-COFRE.md).
 *
 * Cria uma passkey de teste neste endereço e pede a extensão PRF do WebAuthn na criação e na
 * abertura, com a mesma entrada que o cofre vai usar (SHA-256 de "murall-cofre-v1-prf"). Mostra só
 * se a resposta veio, de que tamanho e uma impressão curta dela (para conferir que se repete); a
 * resposta em si nunca aparece. Nada vai para servidor nenhum: o desafio é sorteado aqui mesmo e
 * a assinatura não é conferida, porque o teste não abre nada.
 */
(function () {
  'use strict';

  var registro = document.getElementById('registro');
  var navegador = document.getElementById('navegador');
  var botaoAbrir = document.getElementById('abrir');
  var botaoQualquer = document.getElementById('abrir-qualquer');
  var botaoCopiar = document.getElementById('copiar');
  var aviso = document.getElementById('aviso');
  var botoesCriar = Array.prototype.slice.call(document.querySelectorAll('[data-criar]'));

  /** As passkeys criadas nesta visita (só o id, na memória). */
  var criadas = [];
  /** O que vai para o "Copiar o resultado". */
  var linhas = [];
  /** A impressão da última resposta do PRF, para dizer se a seguinte é igual. */
  var ultimaImpressao = '';
  var anotados = 0;
  var ocupado = false;

  function aleatorio(n) {
    var b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return b;
  }

  function hex(buf, n) {
    var b = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < Math.min(n, b.length); i++) s += b[i].toString(16).padStart(2, '0');
    return s;
  }

  function entradaPrf() {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode('murall-cofre-v1-prf'));
  }

  function nomeDoNavegador() {
    var ua = navigator.userAgent;
    var nome = /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /CriOS\//.test(ua)
            ? 'Chrome (iPhone)'
            : /Chrome\//.test(ua)
              ? 'Chrome'
              : /Safari\//.test(ua)
                ? 'Safari'
                : 'Navegador';
    var sistema = /iPhone|iPad/.test(ua)
      ? 'iPhone/iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'sistema desconhecido';
    return nome + ' no ' + sistema;
  }

  /** Uma linha nova no resultado: um título e os detalhes, cada um com sim/não marcado. */
  function anotar(titulo, detalhes) {
    if (!anotados++) registro.textContent = '';
    var li = document.createElement('li');
    var b = document.createElement('b');
    b.textContent = titulo;
    li.appendChild(b);
    var texto = [titulo];
    detalhes.forEach(function (d) {
      var linha = document.createElement('span');
      linha.appendChild(document.createTextNode(d.rotulo + ': '));
      var valor = document.createElement('span');
      valor.textContent = d.valor;
      if (d.bom === true) valor.className = 'sim';
      else if (d.bom === false) valor.className = 'nao';
      linha.appendChild(valor);
      li.appendChild(linha);
      texto.push('  ' + d.rotulo + ': ' + d.valor);
    });
    registro.appendChild(li);
    linhas.push(texto.join('\n'));
    botaoCopiar.disabled = false;
  }

  function motivo(erro) {
    var nome = erro && erro.name;
    if (nome === 'NotAllowedError') return 'cancelado, ou o tempo acabou';
    if (nome === 'InvalidStateError') return 'esta passkey já existe neste aparelho';
    if (nome === 'SecurityError') return 'este endereço não aceita passkeys';
    if (nome === 'NotSupportedError') return 'o aparelho não aceitou o pedido';
    return (nome || 'erro') + (erro && erro.message ? ' (' + erro.message + ')' : '');
  }

  function travar(sim) {
    ocupado = sim;
    botoesCriar.forEach(function (b) {
      b.disabled = sim;
    });
    botaoQualquer.disabled = sim;
    botaoAbrir.disabled = sim || !criadas.length;
  }

  /** O que a resposta do PRF diz, em linhas para o resultado. */
  async function lerPrf(prf, naCriacao) {
    var detalhes = [];
    if (!prf) {
      detalhes.push({ rotulo: 'PRF', valor: 'o aparelho não respondeu', bom: false });
      return detalhes;
    }
    if (naCriacao) {
      detalhes.push({
        rotulo: 'PRF ligado',
        valor: prf.enabled === true ? 'sim' : prf.enabled === false ? 'não' : 'não disse',
        bom: prf.enabled === true ? true : prf.enabled === false ? false : undefined,
      });
      if (prf.enabled === false) return detalhes;
    }
    var primeiro = prf.results && prf.results.first;
    if (!primeiro) {
      detalhes.push({
        rotulo: naCriacao ? 'Resposta já na criação' : 'Resposta do PRF',
        valor: naCriacao ? 'não (normal: vem ao abrir)' : 'não veio',
        bom: naCriacao ? undefined : false,
      });
      return detalhes;
    }
    var tamanho = primeiro.byteLength;
    var impressao = hex(await crypto.subtle.digest('SHA-256', primeiro), 4);
    detalhes.push({ rotulo: naCriacao ? 'Resposta já na criação' : 'Resposta do PRF', valor: 'sim, ' + tamanho + ' bytes', bom: tamanho === 32 });
    detalhes.push({ rotulo: 'Impressão', valor: impressao });
    if (ultimaImpressao) {
      var igual = ultimaImpressao === impressao;
      detalhes.push({ rotulo: 'Igual à anterior', valor: igual ? 'sim' : 'não', bom: igual });
    }
    ultimaImpressao = impressao;
    return detalhes;
  }

  async function criar(ondeFica) {
    if (ocupado) return;
    travar(true);
    var onde = ondeFica === 'platform' ? 'neste aparelho' : 'com o celular';
    try {
      var cred = await navigator.credentials.create({
        publicKey: {
          rp: { name: 'Murall: teste do PRF' },
          user: { id: aleatorio(16), name: 'Teste do PRF', displayName: 'Teste do PRF' },
          challenge: aleatorio(32),
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: ondeFica,
            residentKey: 'preferred',
            userVerification: 'required',
          },
          hints: ondeFica === 'platform' ? ['client-device'] : ['hybrid'],
          attestation: 'none',
          timeout: 120000,
          extensions: { prf: { eval: { first: await entradaPrf() } } },
        },
      });
      criadas.push(cred.rawId);
      var ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
      var detalhes = [
        { rotulo: 'Onde ficou', valor: cred.authenticatorAttachment === 'platform' ? 'neste aparelho' : cred.authenticatorAttachment === 'cross-platform' ? 'em outro aparelho' : 'não disse' },
      ];
      if (cred.response && cred.response.getTransports) detalhes.push({ rotulo: 'Transporte', valor: cred.response.getTransports().join(', ') || 'não disse' });
      anotar('Criar, ' + onde, detalhes.concat(await lerPrf(ext.prf, true)));
    } catch (erro) {
      anotar('Criar, ' + onde, [{ rotulo: 'Não deu', valor: motivo(erro), bom: false }]);
    } finally {
      travar(false);
    }
  }

  async function abrir(soAsCriadas) {
    if (ocupado) return;
    travar(true);
    var titulo = soAsCriadas ? 'Abrir com a passkey criada' : 'Abrir com a passkey escolhida';
    try {
      var pedido = {
        challenge: aleatorio(32),
        userVerification: 'required',
        timeout: 120000,
        extensions: { prf: { eval: { first: await entradaPrf() } } },
      };
      if (soAsCriadas) {
        pedido.allowCredentials = criadas.map(function (id) {
          return { type: 'public-key', id: id };
        });
      }
      var cred = await navigator.credentials.get({ publicKey: pedido });
      var ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
      var detalhes = [
        { rotulo: 'De onde', valor: cred.authenticatorAttachment === 'platform' ? 'deste aparelho' : cred.authenticatorAttachment === 'cross-platform' ? 'de outro aparelho' : 'não disse' },
      ];
      anotar(titulo, detalhes.concat(await lerPrf(ext.prf, false)));
    } catch (erro) {
      anotar(titulo, [{ rotulo: 'Não deu', valor: motivo(erro), bom: false }]);
    } finally {
      travar(false);
    }
  }

  /** Uma pergunta ao navegador que não pode prender a página: sem resposta em 3 s, fica sem. */
  function comPrazo(promessa) {
    return Promise.race([
      promessa,
      new Promise(function (r) {
        setTimeout(r, 3000);
      }),
    ]);
  }

  async function conferirNavegador() {
    var partes = [nomeDoNavegador()];
    // aberta como arquivo (ou num endereço sem https), o navegador recusa toda passkey
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      var site = 'https://murall.igorsc.com.br/prf-teste.html';
      navegador.textContent = 'Aberta como ' + (location.protocol === 'file:' ? 'arquivo' : 'endereço sem https') + ', o navegador recusa as passkeys. Abra pelo site: ';
      var link = document.createElement('a');
      link.href = site;
      link.textContent = site;
      navegador.appendChild(link);
      botoesCriar.concat([botaoQualquer]).forEach(function (b) {
        b.disabled = true;
      });
      linhas.push('Endereço: ' + location.protocol + ' (sem https)\n  Sem passkeys.');
      return;
    }
    if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) {
      navegador.textContent = partes[0] + ': ' + (window.isSecureContext ? 'este navegador não tem passkeys.' : 'passkeys só funcionam com https.');
      botoesCriar.concat([botaoQualquer]).forEach(function (b) {
        b.disabled = true;
      });
      linhas.push('Navegador: ' + navigator.userAgent + '\n  Sem passkeys.');
      return;
    }
    navegador.textContent = partes[0] + '.';
    try {
      var temNoAparelho = await comPrazo(PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
      if (temNoAparelho !== undefined) partes.push(temNoAparelho ? 'com passkey no aparelho' : 'sem passkey no aparelho');
      if (PublicKeyCredential.getClientCapabilities) {
        var c = await comPrazo(PublicKeyCredential.getClientCapabilities());
        if (c && 'extension:prf' in c) partes.push(c['extension:prf'] ? 'diz que tem PRF' : 'diz que não tem PRF');
      }
    } catch (e) {
      /* segue sem a informação */
    }
    navegador.textContent = partes.join(' · ') + '.';
    linhas.unshift('Navegador: ' + navigator.userAgent + '\n  ' + partes.join(' · ') + '\n  Endereço: ' + location.origin);
  }

  botoesCriar.forEach(function (b) {
    b.addEventListener('click', function () {
      criar(b.getAttribute('data-criar'));
    });
  });
  botaoAbrir.addEventListener('click', function () {
    abrir(true);
  });
  botaoQualquer.addEventListener('click', function () {
    abrir(false);
  });
  botaoCopiar.addEventListener('click', function () {
    var texto = 'Teste do PRF, ' + new Date().toLocaleString('pt-BR') + '\n\n' + linhas.join('\n\n');
    navigator.clipboard.writeText(texto).then(
      function () {
        aviso.textContent = 'Copiado. Cole na conversa sobre o cofre.';
      },
      function () {
        aviso.textContent = 'Não deu para copiar. Tire um print desta parte.';
      },
    );
  });

  conferirNavegador();
})();
