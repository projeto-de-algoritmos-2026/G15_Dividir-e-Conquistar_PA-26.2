# Seja o Algoritmo

Projeto educacional e interativo para estudar o algoritmo do par de pontos mais próximo usando dividir e conquistar. A interface usa uma paleta clara, tons de papel, verde e terracota, e fontes disponíveis no próprio sistema.

## Executar

Não é necessário instalar dependências, usar API ou ferramenta de build. Abra `index.html` no navegador. Para começar diretamente pela simulação, abra `laboratorio.html`.

## Páginas

- `index.html`: introdução, explicação resumida das etapas, distância euclidiana e análise de complexidade.
- `laboratorio.html`: plano de pontos, execução passo a passo/automática, trilha de eventos e conferência final com o método que testa todos os pares (força bruta).

## Organização

- `css/styles.css`: estilos gerais e componentes compartilhados.
- `css/lab.css`: estilos do laboratório interativo.
- `js/site.js`: comportamento compartilhado da navegação.
- `js/closest-pair.js`: algoritmo e geração dos eventos de execução.
- `js/lab.js`: geração dos pontos, renderização SVG, controles e animação.
- `tests/closest-pair.test.js`: testes matemáticos do algoritmo.
- `tests/lab-ui.test.js`: teste de inicialização e controles do laboratório com DOM simulado.

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
```

A primeira bateria compara a resposta do algoritmo com um método de referência que mede todos os pares (força bruta), em entradas aleatórias e casos-limite. A segunda verifica se os pontos são desenhados na inicialização e exercita os controles principais.

## Métrica de comparações

A métrica conta as distâncias efetivamente calculadas nos casos-base e entre pontos de lados diferentes na faixa. O método de força bruta testa todos os pares possíveis e calcula `n(n-1)/2` distâncias. A menor distância final é comparada entre os dois métodos.
