# Seja o Algoritmo

Projeto educacional e interativo para estudar o algoritmo do par de pontos mais próximo usando dividir e conquistar. A interface oferece tema claro e escuro, com preferência salva no navegador, além de fontes disponíveis no próprio sistema.

# [Link para o video](https://youtu.be/ETt4WrfwbLM)
[https://youtu.be/ETt4WrfwbLM](https://youtu.be/ETt4WrfwbLM)

## Equipe

<table align="center">
  <tr>
    <td align="center" width="220px">
      <a href="https://github.com/GUGOFO">
        <img src="https://github.com/GUGOFO.png" width="130px" height="130px" style="border-radius: 50%; object-fit: cover; border: 3px solid #2da44e;" alt="Gustavo Gomes Fornaciari"><br><br>
        <b>Gustavo Gomes Fornaciari</b>
      </a><br>
      <sub style="font-size: 12px; color: #57606a;">Matrícula: 241032519</sub><br><br>
      <a href="https://github.com/GUGOFO">
        <img src="https://img.shields.io/badge/GitHub-100000?style=flat-square&logo=github&logoColor=white" alt="GitHub">
      </a>
    </td>
    <td align="center" width="220px">
      <a href="https://github.com/AnnaBeatrizAraujo">
        <img src="https://github.com/AnnaBeatrizAraujo.png" width="130px" height="130px" style="border-radius: 50%; object-fit: cover; border: 3px solid #2da44e;" alt="Ana Beatriz Souza Araujo"><br><br>
        <b>Ana Beatriz Souza Araujo</b>
      </a><br>
      <sub style="font-size: 12px; color: #57606a;">Matrícula: 241025891</sub><br><br>
      <a href="https://github.com/AnnaBeatrizAraujo">
        <img src="https://img.shields.io/badge/GitHub-100000?style=flat-square&logo=github&logoColor=white" alt="GitHub">
      </a>
    </td>
  </tr>
</table>

## Executar

Não é necessário instalar dependências, usar API ou ferramenta de build. Abra `index.html` no navegador. Para começar diretamente pela simulação, abra `laboratorio.html`.

## Páginas

- `index.html`: introdução, explicação resumida das etapas, distância euclidiana e análise de complexidade.
- `laboratorio.html`: plano de pontos, execução passo a passo/automática, trilha de eventos e conferência final com o método que testa todos os pares (força bruta).

## Organização

- `css/styles.css`: estilos gerais e componentes compartilhados.
- `css/lab.css`: estilos do laboratório interativo.
- `js/site.js`: comportamento compartilhado da navegação.
- `js/theme.js`: alternância e persistência dos temas claro e escuro.
- `js/closest-pair.js`: algoritmo e geração dos eventos de execução.
- `js/lab.js`: geração dos pontos, renderização SVG, controles e animação.
- `tests/closest-pair.test.js`: testes matemáticos do algoritmo.
- `tests/lab-ui.test.js`: teste de inicialização e controles do laboratório com DOM simulado.

## Aparência

Use o botão com símbolo de lua/sol no cabeçalho para alternar entre tema claro e escuro. A escolha fica salva neste navegador e é aplicada nas duas páginas.

## Controles do laboratório

- **Animar execução**: inicia ou pausa a execução.
- **Executar até o fim**: anima todos os eventos restantes.
- **Próxima etapa / etapa anterior**: percorre a trilha manualmente.
- **Pular para o resultado**: mostra diretamente a resposta calculada.
- **Voltar ao início**: retorna ao plano inicial.
- **Nova variação**: gera outro conjunto de pontos.
- **Cenário**: altera o número de pontos e a característica do caso.
- **Velocidade**: altera o intervalo entre etapas sem pular eventos.

## Testes

Com Node.js instalado, execute na pasta do projeto:

```bash
node tests/closest-pair.test.js
node tests/lab-ui.test.js
node tests/theme.test.js
```

A primeira bateria compara a resposta do algoritmo com um método de referência que mede todos os pares (força bruta), em entradas aleatórias e casos-limite. A segunda verifica se os pontos são desenhados na inicialização e exercita os controles principais.

## Métrica de comparações

A métrica conta as distâncias efetivamente calculadas nos casos-base e entre pontos de lados diferentes na faixa. O método de força bruta testa todos os pares possíveis e calcula `n(n-1)/2` distâncias. A menor distância final é comparada entre os dois métodos.
