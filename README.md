# Diagnóstico de Segurança Digital — Passo 5

Nesta etapa, o protótipo virou um projeto organizado e executado pelo Node.js.
O funcionamento do Passo 4 foi preservado: questionário, salvamento local, importação CSV,
revisão, resultado, histórico, download JSON e impressão em PDF.

## Executar

1. Abra o terminal dentro desta pasta.
2. Execute:

```powershell
npm run dev
```

3. O terminal mostrará:

```text
Diagnostico stmgo disponivel em http://localhost:5173
```

4. Abra `http://localhost:5173` no Chrome ou Edge.

Não é necessário executar `npm install`, pois esta etapa usa apenas recursos nativos do Node.js.

## Encerrar

No terminal, pressione `Ctrl + C`.

## Estrutura

- `index.html`: estrutura principal.
- `src/main.js`: regras, navegação, cálculos e armazenamento.
- `src/styles.css`: identidade visual e responsividade.
- `server.mjs`: servidor local.
- `.env.example`: reservado para o banco de dados do próximo passo.
- `package.json`: comando para executar o projeto.

## Limitação atual

Os diagnósticos continuam armazenados no navegador. A próxima etapa conectará o Supabase
para criar banco de dados, autenticação e histórico compartilhado.
