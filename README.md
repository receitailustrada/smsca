# smsca
Secretaria Municipal de Saúde - CA
# RXI • Cruz Alta – Especialidades e Exames (Live)

## 📌 Sobre o Projeto

Este painel web foi desenvolvido para unificar a busca de **Especialidades** e **Exames** da SMS de Cruz Alta – RS. Ele consome dados diretamente de uma **planilha pública no Google Sheets**, permitindo que as informações sejam atualizadas em tempo real sem necessidade de edição manual no código.

## 🚀 Funcionalidades

* 🔄 Atualização automática a cada 60 segundos.
* 🔍 Busca por nome, local, prestador ou palavra-chave.
* 🎛️ Filtros dinâmicos por **Fluxo**, **Regulação**, **Agendamento** e **Prestador**.
* 🧪 Testes automatizados integrados (smoke, unit e E2E).
* 🌐 Integração via **Google Apps Script Web App** ou **GViz API** como fallback.

## 🗂 Estrutura do Código

* **HTML/CSS**: Interface responsiva, com abas para Especialidades e Exames.
* **JavaScript**:

  * `loadData()`: Carrega dados da planilha.
  * `applyFilters()`: Aplica filtros ativos.
  * `switchCat()`: Alterna entre abas de Especialidades/Exames.
  * `runTestsHandler()`: Executa a suíte de testes automatizados.

## 🔗 Dependências

* Nenhuma biblioteca externa além de **Google Fonts**.
* Requer apenas navegador moderno com **fetch API** habilitado.

## ⚙️ Como Configurar

1. Crie uma planilha no Google Sheets com as abas **Especialidades** e **Exames**.
2. Publique a planilha como **Qualquer pessoa com o link**.
3. (Opcional) Crie um **Apps Script Web App** para servir os dados em JSON:

   * Vá em **Extensões > Apps Script**.
   * Adicione um código que leia a planilha e retorne JSON.
   * Publique em **Implantar > Novo deploy > Aplicativo da Web > Qualquer pessoa**.
4. Substitua a URL em `SHEETS_JSON_URL` pelo link do seu Web App.

## 🧪 Testes Automatizados

O painel possui uma suíte de testes integrada:

* **Smoke**: Verifica se funções e `fetch` estão disponíveis.
* **Unit**: Testa normalização de texto e parsing do GViz.
* **E2E**: Garante que filtros e troca de abas funcionem.
* **Live**: Testa conexão com o Apps Script (quando disponível).

## 👨‍💻 Autor

Desenvolvido por **Dr. Daniel F. Audino** no contexto do projeto **RXI – Receita Ilustrada**, integrando fluxos de atendimento do SUS ao prontuário médico digital.

## 📜 Licença

Uso interno e educacional na rede de saúde de Cruz Alta – RS.
