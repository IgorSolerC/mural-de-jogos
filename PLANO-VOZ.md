# Plano: ouvir a nota em voz alta (17/nov/2026)

Pedido do dono: estudando japonês pelo Murall, quer um botão na ficha aberta (a leitura e a tela cheia)
que leia a nota em voz alta, em três línguas à escolha: Português do Brasil, Inglês e Japonês. "O ideal
perfeito seria uma AI generativa de texto para voz": pesquisar se é possível, de graça.

## A pesquisa: dá, de graça, sem servidor

O navegador já fala: a **Web Speech API** (`speechSynthesis`) usa as vozes do sistema e do navegador.
Nada para baixar, nada pago, nada sai do aparelho além do que o próprio navegador já manda para as vozes
dele.

| Onde | Vozes | Observações |
|---|---|---|
| Edge (computador) | Neurais da Microsoft, "Online (Natural)": Nanami e Keita (ja-JP), Francisca, Thalita e Antonio (pt-BR), Jenny, Aria e outras (en-US) | É a "AI generativa" pedida, de graça. Precisam de internet. Avisam a palavra que está sendo dita. |
| Chrome (computador) | Do Google, pela internet: "Google 日本語", "Google português do Brasil", "Google US English"; mais as do Windows | As do Google cortam a fala depois de uns 14 s e não avisam a palavra (só o começo e o fim). |
| Android (Chrome) | O motor de voz do Google, instalado no celular | O `pause()` não volta. A lista pode trazer língua sem o pacote instalado (cai no inglês). |
| iPhone (Safari e todos) | As da Apple (Kyoko e Otoya, Luciana, Samantha…) | Falar precisa começar num toque (o botão é um toque). |
| Este Windows | Maria e Daniel (pt-BR), David, Zira e Mark (en-US); **nenhuma japonesa** | No Chrome, o japonês vem pela voz do Google; no Edge, pela Nanami. |

Descartados:

- **Modelo de voz no navegador.** O Kokoro-js só fala inglês. O piper-plus fala japonês, mas baixa uns
  60 MB (19 MB só do dicionário japonês), é lento no celular e não tem voz boa de pt-BR.
- **Voz de nuvem.** Google Cloud e Azure são pagos (cartão na conta). A MeloTTS da Cloudflare não fala
  português e cobra por minuto além da cota. O atalho não oficial das vozes do Edge (edge-tts) quebra
  de vez em quando e não é permitido.

## O que o dono decidiu (perguntas de 17/nov)

1. **Uma voz por vez.** A nota inteira sai na voz da língua escolhida, como pedido ("tentar pronunciar
   com base na língua"). A leitura misturada (o japonês na voz japonesa e a tradução na portuguesa) foi
   testada e funciona, mas ficou para depois, se ele pedir.
2. **Lê tudo o que está no texto**, o rōmaji também. Nada de pular trecho por adivinhação.
3. **A língua se escolhe toda vez**: tocar no botão sempre mostra as três.
4. **Edge, Chrome, Android e iPhone**: os quatro precisam funcionar.
5. **As vozes preferidas** (testadas no Chrome, numa página de teste, em 17/nov): "Google 日本語"
   (ja-JP), "Google português do Brasil" (pt-BR) e "Google UK English Male" (en-GB). As do Windows
   (Maria, David…) soam robóticas.

## O que decidi (sem rodada de escolha)

- **Lê o que está à mostra, na ordem da tela**: o nome da ficha e depois o texto, como aparece. O
  spoiler fechado, as tarefas feitas recolhidas e o card fechado não são lidos (não estão na tela); a
  tabela é lida linha por linha, célula por célula; o bloco de código é lido (as conversas de japonês
  vêm em bloco de código); widgets de imagem, vídeo, som e contador ficam de fora. As marcas
  (`**`, `==`, `((`) nunca são lidas: o texto vem do que a tela desenha, não do markdown.
- **Frase por frase.** Cada frase vira uma fala (e frase longa se parte nas vírgulas): contorna o corte
  de 14 s do Chrome, deixa voltar e avançar de frase, e diz qual destacar sem depender do aviso de
  palavra que o Chrome não manda. Pausar é parar e lembrar a frase; continuar começa dela de novo
  (o `pause()` do Android não volta).
- **A frase lida ganha o marca-texto** (`::highlight(voz)`, o mesmo jeito da busca e da folha de
  conflito, sem mexer no HTML). Onde a voz avisa a palavra (Edge, as do Windows), a palavra ganha um
  tom mais forte dentro da frase. A folha rola sozinha para a frase lida, a não ser que a pessoa tenha
  rolado com a mão há pouco.
- **Tocar numa frase, com o leitor aberto, lê dali.**
- **O toca-fitas.** O leitor é uma fita presa ao pé da folha (no celular, ao pé da tela), com as teclas
  de metal do widget de som (as mesmas, num parcial só, sem mudar nada na fita cassete): frase
  anterior, tocar e pausar, próxima. Ao lado: a língua escolhida (troca ali mesmo), a velocidade
  (0,75×, 1×, 1,25×, 1,5×) e parar. "Frase 3 de 24" no contador da fita.
- **A melhor voz sozinha**, na ordem: as três preferidas do dono (decisão 5; o inglês é o britânico
  masculino), depois a neural do Edge ("Natural"/"Online"), outra do Google, e por fim a do aparelho. A
  troca de voz fica no menu da língua ("Voz: Nanami ✓, Keita"). **A velocidade e a voz escolhida ficam
  no aparelho** (`meu-mural:voz`, pelos ajudantes de `core/storage.ts`, e saem no logout: regra do
  CLAUDE.md, com o teste em `browser-reset.spec.ts`). A língua não fica (decisão 3).
- **Sem a voz da língua**, o menu diz isso naquela língua ("Sem voz japonesa neste navegador") e como
  conseguir: no Windows, instalar a fala japonesa nas configurações ou abrir no Edge; no Android, o
  pacote de voz do Google. Sem nenhuma voz (Edge no Android), o botão não aparece.
- **Só um leitor por vez**, e ele para quando a ficha fecha, quando ela troca de vista para "só a
  cartolina", quando outra ficha abre e no logout.
- **Compartilhadas e visita.** O leitor só lê: não grava nada na nota, então não toca na sincronização.
  Se outra pessoa muda a nota enquanto ela é lida, as frases se refazem e a leitura segue da frase
  mais parecida com a de antes (ou da mesma posição). A visita monta a mesma ficha aberta
  (`app-review-reader`), então ganha o botão sem nada à parte (regra "Visita: as mesmas peças").

## Rodadas (uma por vez; cada uma com /code-review mid antes da próxima, commit e push)

1. **As frases** (`ui/voz-frases.ts`, e65e9881, BUILD 929): do texto desenhado na folha (o DOM do `app-rich-text`) às
   frases, cada uma com os `Range`s dela na tela. Funções puras
   sobre nós de texto, com spec: a nota の inteira (título, card USOS, frases e traduções), tabela,
   código, spoiler fechado, tarefas recolhidas, frase longa partida, só japonês, só português.
2. **A voz** (`core/voz.ts`): o serviço sobre `speechSynthesis`: as vozes (com `voiceschanged`), a
   melhor de cada língua, a fila frase a frase, pausar e continuar, voltar e
   avançar, velocidade, aviso de palavra, erros, sem voz, um por vez; a preferência guardada com o
   teste da limpeza. Spec com um `speechSynthesis` de mentira.
3. **O botão e o toca-fitas** (`ui/` + `review-reader.ts`): o botão na faixa (leitura e tela cheia), o
   menu das três línguas (o `ContextMenu` de sempre), a fita com as teclas (parcial tirado do
   `audio-track.ts`, a fita cassete idêntica), o marca-texto, tocar na frase, a rolagem, celular.
   Testes da peça, da visita lendo, e fotos 2x no computador e no celular.
4. **Fim**: crítica do Impeccable (revisão e detector), DESIGN.md, Novidades, /code-review high e o que
   ele achar.
