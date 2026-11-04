/**
 * Os emojis do "+" das reações, por gaveta, cada um com o nome (o que a reação diz ao lado do desenho,
 * como o "Amei" das sete da fileira) e as palavras que o acham na busca (em português, sem acento). Não é a lista inteira do Unicode: são os que fazem sentido para reagir a
 * uma resenha, num pacote pequeno que vai junto com o site (sem pedir nada à rede).
 */
export interface EmojiEntry {
  e: string;
  /** O nome, com acento: "Olhos de coração". */
  n: string;
  /** Palavras da busca, separadas por espaço. */
  k: string;
}

export interface EmojiDrawer {
  id: string;
  label: string;
  /** O emoji que vai na aba da gaveta. */
  icon: string;
  list: readonly EmojiEntry[];
}

const x = (e: string, n: string, k: string): EmojiEntry => ({ e, n, k });

export const EMOJI_DRAWERS: readonly EmojiDrawer[] = [
  {
    id: 'caras',
    label: 'Caras',
    icon: '😀',
    list: [
      x('😀', 'Feliz', 'feliz sorriso'),
      x('😄', 'Alegre', 'feliz alegre risada'),
      x('😁', 'Sorrisão', 'sorrisao dentes'),
      x('😆', 'Risada', 'risada rindo'),
      x('🤣', 'Chorando de rir', 'chorando de rir rolando'),
      x('🙂', 'Sorriso leve', 'sorriso leve'),
      x('😉', 'Piscadela', 'piscadela'),
      x('😊', 'Fofo', 'fofo corado feliz'),
      x('😇', 'Anjo', 'anjo inocente'),
      x('🥰', 'Apaixonado', 'apaixonado coracoes amor'),
      x('😍', 'Olhos de coração', 'olhos de coracao amei apaixonado'),
      x('🤩', 'Fascinado', 'estrelas fascinado incrivel'),
      x('😘', 'Beijo', 'beijo'),
      x('😋', 'Delícia', 'gostoso delicia'),
      x('😜', 'Brincadeira', 'brincadeira lingua'),
      x('🤪', 'Maluco', 'doido maluco'),
      x('🤓', 'Nerd', 'nerd'),
      x('😎', 'Estiloso', 'oculos escuros estiloso legal'),
      x('🥳', 'Festa', 'festa comemorar'),
      x('😏', 'Malicioso', 'malicioso sorrisinho'),
      x('😌', 'Aliviado', 'aliviado tranquilo'),
      x('🤔', 'Pensando', 'pensando duvida hmm'),
      x('🤨', 'Desconfiado', 'desconfiado sobrancelha'),
      x('😐', 'Neutro', 'neutro sem expressao'),
      x('😑', 'Sem expressão', 'sem expressao tedio'),
      x('🙄', 'Revirando os olhos', 'revirar olhos'),
      x('😬', 'Careta', 'constrangido careta'),
      x('🤐', 'Boca fechada', 'boca fechada segredo'),
      x('🤫', 'Silêncio', 'silencio segredo spoiler'),
      x('🫢', 'Mão na boca', 'surpresa mao na boca'),
      x('😮', 'Surpresa', 'surpresa uau'),
      x('😯', 'Espanto', 'espanto'),
      x('😲', 'Chocado', 'chocado espantado'),
      x('🤯', 'Cabeça explodindo', 'cabeca explodindo mente explodiu'),
      x('😳', 'Envergonhado', 'envergonhado corado'),
      x('🥺', 'Pidão', 'pidao olhos brilhando'),
      x('🥹', 'Emocionado', 'emocionado segurando lagrimas'),
      x('😢', 'Triste', 'triste chorando lagrima'),
      x('😭', 'Chorando muito', 'chorando muito'),
      x('😱', 'Grito', 'grito medo susto'),
      x('😨', 'Medo', 'medo assustado'),
      x('😰', 'Nervoso', 'nervoso ansioso'),
      x('😤', 'Bufando', 'bufando bravo'),
      x('😠', 'Bravo', 'bravo irritado'),
      x('😡', 'Furioso', 'furioso raiva'),
      x('🤬', 'Xingando', 'xingando palavrao'),
      x('😴', 'Dormindo', 'sono dormindo tedio'),
      x('🥱', 'Bocejo', 'bocejo tedio sono'),
      x('🤤', 'Babando', 'babando'),
      x('🤢', 'Enjoado', 'enjoado nojo'),
      x('🤮', 'Vomitando', 'vomitando nojo'),
      x('🥴', 'Zonzo', 'zonzo tonto'),
      x('😵', 'Tonto', 'tonto morto'),
      x('😵‍💫', 'Confuso', 'tonto confuso espiral'),
      x('🤠', 'Caubói', 'cowboy'),
      x('🥸', 'Disfarce', 'disfarce'),
      x('🫠', 'Derretendo', 'derretendo'),
      x('🫡', 'Continência', 'continencia respeito'),
      x('🤡', 'Palhaço', 'palhaco'),
      x('👻', 'Fantasma', 'fantasma terror'),
      x('💀', 'Caveira', 'caveira morri'),
      x('☠️', 'Caveira e ossos', 'caveira perigo'),
      x('👽', 'Alienígena', 'alien et'),
      x('🤖', 'Robô', 'robo'),
      x('💩', 'Cocô', 'coco ruim'),
      x('😈', 'Diabinho', 'diabinho malvado'),
    ],
  },
  {
    id: 'gestos',
    label: 'Gestos',
    icon: '👍',
    list: [
      x('👍', 'Joinha', 'joinha positivo curti'),
      x('👎', 'Negativo', 'negativo nao curti'),
      x('👏', 'Palmas', 'palmas aplausos'),
      x('🙌', 'Viva', 'maos para cima viva'),
      x('🙏', 'Por favor', 'por favor obrigado reza'),
      x('🤝', 'Aperto de mão', 'aperto de mao acordo'),
      x('👌', 'Ok', 'ok perfeito'),
      x('🤌', 'Perfeito', 'italiano perfeito chef'),
      x('✌️', 'Paz', 'paz vitoria'),
      x('🤞', 'Dedos cruzados', 'dedos cruzados sorte'),
      x('🤘', 'Rock', 'rock metal'),
      x('🤙', 'Liga pra mim', 'liga pra mim'),
      x('👋', 'Tchau', 'tchau oi aceno'),
      x('💪', 'Força', 'forca musculo'),
      x('🫶', 'Coração com as mãos', 'coracao com as maos amor'),
      x('👀', 'De olho', 'olhos olhando de olho'),
      x('🧠', 'Cérebro', 'cerebro inteligente'),
      x('🫵', 'Você', 'voce apontando'),
      x('☝️', 'Atenção', 'atencao um'),
      x('🤷', 'Sei lá', 'sei la tanto faz'),
      x('🤦', 'Mão na cara', 'facepalm vergonha'),
      x('🙈', 'Não vi', 'macaco nao vi'),
      x('🙉', 'Não ouvi', 'macaco nao ouvi'),
      x('🙊', 'Não falo', 'macaco nao falo'),
    ],
  },
  {
    id: 'coracoes',
    label: 'Corações',
    icon: '❤️',
    list: [
      x('❤️', 'Coração vermelho', 'coracao vermelho amor amei'),
      x('🧡', 'Coração laranja', 'coracao laranja'),
      x('💛', 'Coração amarelo', 'coracao amarelo'),
      x('💚', 'Coração verde', 'coracao verde'),
      x('💙', 'Coração azul', 'coracao azul'),
      x('💜', 'Coração roxo', 'coracao roxo'),
      x('🖤', 'Coração preto', 'coracao preto'),
      x('🤍', 'Coração branco', 'coracao branco'),
      x('🤎', 'Coração marrom', 'coracao marrom'),
      x('🩷', 'Coração rosa', 'coracao rosa'),
      x('💔', 'Coração partido', 'coracao partido triste'),
      x('❤️‍🔥', 'Coração em chamas', 'coracao em chamas paixao'),
      x('❤️‍🩹', 'Coração curado', 'coracao curado'),
      x('💕', 'Dois corações', 'dois coracoes'),
      x('💖', 'Coração brilhando', 'coracao brilhando'),
      x('💘', 'Flechada do cupido', 'flechada cupido'),
      x('💯', 'Cem', 'cem perfeito'),
      x('✨', 'Brilhos', 'brilhos magico'),
      x('⭐', 'Estrela', 'estrela'),
      x('🌟', 'Estrela brilhante', 'estrela brilhante'),
      x('💥', 'Explosão', 'explosao boom'),
      x('🔥', 'Fogo', 'fogo incrivel'),
    ],
  },
  {
    id: 'bichos',
    label: 'Bichos',
    icon: '🐱',
    list: [
      x('🐱', 'Gato', 'gato'),
      x('🐶', 'Cachorro', 'cachorro'),
      x('🦊', 'Raposa', 'raposa'),
      x('🐻', 'Urso', 'urso'),
      x('🐼', 'Panda', 'panda'),
      x('🐸', 'Sapo', 'sapo'),
      x('🐵', 'Macaco', 'macaco'),
      x('🐧', 'Pinguim', 'pinguim'),
      x('🦉', 'Coruja', 'coruja'),
      x('🦄', 'Unicórnio', 'unicornio'),
      x('🐉', 'Dragão', 'dragao'),
      x('🦖', 'Dinossauro', 'dinossauro'),
      x('🐢', 'Tartaruga', 'tartaruga devagar'),
      x('🐌', 'Lesma', 'lesma devagar arrastado'),
      x('🐍', 'Cobra', 'cobra'),
      x('🦋', 'Borboleta', 'borboleta'),
      x('🐝', 'Abelha', 'abelha'),
      x('🕷️', 'Aranha', 'aranha'),
      x('🐙', 'Polvo', 'polvo'),
      x('🦈', 'Tubarão', 'tubarao'),
      x('🌸', 'Flor de cerejeira', 'flor cerejeira'),
      x('🌹', 'Rosa', 'rosa flor'),
      x('🌻', 'Girassol', 'girassol'),
      x('🍀', 'Trevo', 'trevo sorte'),
      x('🌈', 'Arco-íris', 'arco iris'),
      x('🌙', 'Lua', 'lua'),
      x('☀️', 'Sol', 'sol'),
      x('⛈️', 'Tempestade', 'tempestade'),
      x('❄️', 'Neve', 'neve frio'),
    ],
  },
  {
    id: 'comida',
    label: 'Comida',
    icon: '🍿',
    list: [
      x('🍿', 'Pipoca', 'pipoca filme'),
      x('🍕', 'Pizza', 'pizza'),
      x('🍔', 'Hambúrguer', 'hamburguer'),
      x('🍟', 'Batata frita', 'batata frita'),
      x('🌮', 'Taco', 'taco'),
      x('🍣', 'Sushi', 'sushi'),
      x('🍜', 'Lámen', 'lamen'),
      x('🍩', 'Rosquinha', 'rosquinha'),
      x('🍰', 'Bolo', 'bolo'),
      x('🎂', 'Bolo de aniversário', 'aniversario bolo'),
      x('🍫', 'Chocolate', 'chocolate'),
      x('🍪', 'Biscoito', 'biscoito'),
      x('🍓', 'Morango', 'morango'),
      x('🍉', 'Melancia', 'melancia'),
      x('🥑', 'Abacate', 'abacate'),
      x('🌶️', 'Pimenta', 'pimenta picante'),
      x('🧀', 'Queijo', 'queijo'),
      x('☕', 'Café', 'cafe'),
      x('🍵', 'Chá', 'cha'),
      x('🍺', 'Cerveja', 'cerveja'),
      x('🍷', 'Vinho', 'vinho'),
      x('🥂', 'Brinde', 'brinde'),
      x('🧋', 'Bubble tea', 'bubble tea'),
    ],
  },
  {
    id: 'coisas',
    label: 'Coisas',
    icon: '🎮',
    list: [
      x('🎮', 'Videogame', 'videogame controle jogo'),
      x('🕹️', 'Fliperama', 'fliperama'),
      x('👾', 'Invasor', 'invasor jogo'),
      x('🎲', 'Dado', 'dado sorte'),
      x('♟️', 'Xadrez', 'xadrez estrategia'),
      x('🧩', 'Quebra-cabeça', 'quebra cabeca'),
      x('📚', 'Livros', 'livros leitura'),
      x('📖', 'Livro aberto', 'livro aberto'),
      x('✍️', 'Escrevendo', 'escrevendo'),
      x('🎬', 'Claquete', 'cinema filme claquete'),
      x('🎥', 'Câmera', 'camera filme'),
      x('📺', 'TV', 'tv serie'),
      x('🎧', 'Fone', 'fone musica'),
      x('🎵', 'Música', 'musica nota'),
      x('🎸', 'Guitarra', 'guitarra rock'),
      x('🎨', 'Arte', 'arte pintura'),
      x('🏆', 'Troféu', 'trofeu vitoria campeao'),
      x('🥇', 'Medalha de ouro', 'medalha ouro primeiro'),
      x('👑', 'Coroa', 'coroa rei'),
      x('💎', 'Diamante', 'diamante joia'),
      x('🎁', 'Presente', 'presente'),
      x('🎉', 'Confete', 'festa confete'),
      x('🎈', 'Balão', 'balao'),
      x('🚀', 'Foguete', 'foguete'),
      x('⚔️', 'Espadas', 'espadas luta'),
      x('🛡️', 'Escudo', 'escudo'),
      x('🔮', 'Bola de cristal', 'bola de cristal magia'),
      x('🪄', 'Varinha mágica', 'varinha magica'),
      x('💡', 'Ideia', 'ideia lampada'),
      x('⏳', 'Ampulheta', 'ampulheta tempo demorado'),
      x('💤', 'Zzz', 'sono zzz'),
      x('💸', 'Dinheiro voando', 'dinheiro voando caro'),
      x('🗿', 'Moai', 'moai serio'),
    ],
  },
  {
    id: 'sinais',
    label: 'Sinais',
    icon: '✅',
    list: [
      x('✅', 'Certo', 'certo feito check'),
      x('❌', 'Errado', 'errado nao x'),
      x('⭕', 'Círculo', 'circulo'),
      x('❗', 'Exclamação', 'exclamacao importante'),
      x('❓', 'Pergunta', 'pergunta duvida'),
      x('⁉️', 'O quê?!', 'o que interrobang'),
      x('‼️', 'Exclamação dupla', 'exclamacao dupla'),
      x('💢', 'Raiva', 'raiva bravo'),
      x('💬', 'Comentário', 'balao fala comentario'),
      x('🗯️', 'Balão bravo', 'balao bravo'),
      x('💭', 'Pensamento', 'pensamento'),
      x('🆗', 'OK', 'ok'),
      x('🆒', 'Cool', 'cool legal'),
      x('🆕', 'Novo', 'novo'),
      x('🔝', 'Top', 'top'),
      x('🔁', 'Repetir', 'repetir de novo'),
      x('⚠️', 'Aviso', 'aviso cuidado'),
      x('🚫', 'Proibido', 'proibido'),
      x('♻️', 'Reciclar', 'reciclar'),
      x('🎯', 'Alvo', 'alvo acertou'),
      x('📌', 'Tachinha', 'tachinha alfinete'),
      x('🇧🇷', 'Brasil', 'brasil bandeira'),
      x('🏳️‍🌈', 'Bandeira arco-íris', 'arco iris orgulho bandeira'),
    ],
  },
];

/** O emoji sem o seletor de variação (U+FE0F): "❤" e "❤️" são o mesmo desenho. */
const bare = (e: string) => e.replace(/\uFE0F/g, '');

let NAMES: Map<string, string> | null = null;

/** O nome de um emoji do catálogo ("Olhos de coração"); null se ele não está aqui. */
export function emojiName(e: string): string | null {
  NAMES ??= new Map(EMOJI_DRAWERS.flatMap((d) => d.list.map((i) => [bare(i.e), i.n] as const)));
  return NAMES.get(bare(e)) ?? null;
}

/** Busca pelas palavras (e pelo nome), sem acento e sem ligar para maiúsculas; vazia, nada. */
export function searchEmoji(query: string, fold: (s: string) => string): EmojiEntry[] {
  const words = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const seen = new Set<string>();
  const out: EmojiEntry[] = [];
  for (const d of EMOJI_DRAWERS) {
    for (const item of d.list) {
      if (seen.has(item.e)) continue;
      const keys = `${item.k} ${fold(item.n)}`.split(/[\s-]+/);
      if (words.every((w) => keys.some((k) => k.startsWith(w)))) {
        seen.add(item.e);
        out.push(item);
      }
    }
  }
  return out;
}
