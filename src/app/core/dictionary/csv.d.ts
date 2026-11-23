// O CSV do Dicionário Japonês entra como texto pelo carregador do esbuild (`with { loader: 'text' }`).
declare module '*.csv' {
  const text: string;
  export default text;
}
