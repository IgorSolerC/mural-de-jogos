/*
 * A volta do Google, ao ligar o Google Agenda no Calendário (ver src/app/core/google-agenda-sync.ts).
 *
 * O Google manda para cá o código (ou o erro) e o `state`. Com a janela do Murall que abriu esta, a
 * resposta vai para ela (só para o mesmo endereço) e esta fecha; sem ela (o navegador abriu o Google
 * na mesma aba), a resposta fica guardada e esta volta para o Calendário, que termina a ligação.
 */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var data = { tipo: 'murall-google', codigo: q.get('code') || '', estado: q.get('state') || '', erro: q.get('error') || '' };
  // o código não fica no histórico nem no endereço
  try {
    history.replaceState(null, '', location.pathname);
  } catch (e) {
    /* segue */
  }
  var msg = document.getElementById('msg');
  // guardada sempre: a página do Murall que abriu esta ouve a mudança (o Google pode ter cortado o
  // `opener`), ou termina ao abrir o Calendário
  try {
    localStorage.setItem('meu-mural:google-retorno', JSON.stringify(data));
  } catch (e) {
    /* sem localStorage: só a mensagem */
  }
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(data, location.origin);
    } catch (e) {
      /* segue */
    }
  }
  if (msg) msg.textContent = data.erro ? 'A ligação não foi feita. Pode fechar esta janela.' : 'Pronto. Pode voltar para o Murall.';
  setTimeout(function () {
    window.close();
    // não fechou (a mesma aba do site): volta para o Calendário, que termina a ligação
    setTimeout(function () {
      location.replace('./#/anotacoes/calendario');
    }, 300);
  }, 500);
})();
