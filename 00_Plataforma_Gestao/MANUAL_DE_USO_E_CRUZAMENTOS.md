# 📘 Manual de Uso e Guia de Cruzamentos do Mapa Interativo
### Sistema Estadual de Bibliotecas Públicas e Comunitárias de Minas Gerais (SEBPC/MG)
**Diretoria do Livro, Leitura, Literatura e Bibliotecas (DLLLB)**  
*Edição Oficial — Fechamento 853 Municípios & Censo Demográfico IBGE 2022*  
*(Alimentado pela Plataforma Minas Criativa e Bases do SEBPC/MG)*

---

## 🎯 APRESENTAÇÃO

O **Mapa Interativo das Bibliotecas de Minas Gerais** é um produto de georreferenciamento, gestão orientada a dados e diagnóstico cultural do **SEBPC/DLLLB/SBMEC/SECULT-MG**. Concebido para embasar tomadas de decisão estratégica da Diretoria, subsidiar diálogos com prefeitos e secretários municipais e fornecer informações para o Fomento, a ferramenta unifica:

1. O **fechamento matemático integral dos 853 municípios de Minas Gerais** (ativos + inativos);
2. A população oficial de cada cidade apurada pelo **Censo Demográfico IBGE 2022**;
3. A camada geoespacial de **Bolhas de População (>20k hab.)** nos vazios de atendimento público;
4. A governança descentralizada das **Bibliotecas-Polo Regionais da Rede Integra Geraes**;
5. As políticas de acervo e difusão: **PNLD+ Bibliotecas**, **Noite Mineira (NMMB)** e **SEIL**;
6. A série histórica quadrienal de **Atuação do Sistema Estadual (2023–2026)** para as Ações 4336 e 4337 do PPAG/SIGPLAN.

---

## 📊 INDICADORES ESTRATÉGICOS OFICIAIS DE COBERTURA

A base do mapa cumpre rigorosamente a regra de consistência dos 853 municípios mineiros:

```text
Total de Municípios de Minas Gerais: 853 municípios (100,0%)
├── MUNICÍPIOS COM BP (Biblioteca Pública Ativa): 460 municípios (53,93%)
└── MUNICÍPIOS DESASSISTIDOS (Sem BP Ativa): 393 municípios (46,07%)
    SOMA CONSOLIDADA: 460 + 393 = 853 municípios
```

### Contraste Revelador: Cobertura Territorial vs. Cobertura Populacional

O cruzamento dos dados do **SEBPC/MG** com a população oficial do **Censo IBGE 2022** estabelece um diagnóstico indispensável para o planejamento público:

| Indicador | Cobertura Territorial (Municípios) | Cobertura Populacional (Habitantes - Censo 2022) |
| :--- | :---: | :---: |
| **MUNICÍPIOS COM BP** | **460 mun. (53,93%)** | **17.210.174 hab. (83,8%)** |
| **Municípios Desassistidos** | **393 mun. (46,07%)** | **3.329.815 hab. (16,2%)** |
| **Total do Estado de Minas Gerais** | **853 mun. (100,0%)** | **20.539.989 hab. (100,0%)** |

> [!IMPORTANT]
> **Interpretação para Gestão Pública:**
> Mais de **83,8% de toda a população mineira** reside em cidades atendidas por biblioteca pública ativa. Os 393 municípios desassistidos reúnem apenas **16,2% dos habitantes de MG** (perfil de pequenas cidades e áreas rurais, com média inferior a 8,7 mil hab./município).

---

## 🏛️ TIPOLOGIA DOS EQUIPAMENTOS CULTURAIS CADASTRADOS (569 UNIDADES ATIVAS)

| Tipologia Oficial | Quantidade | Municípios | Padrão de Cor & Ícone | Descrição e Papel Institucional |
| :--- | :---: | :---: | :--- | :--- |
| **Pública Municipal** | **513** | 459 | 🔵 Ponto Azul | Unidades mantidas pelas prefeituras para atendimento público gratuito universal. |
| **Pública Estadual** | **1** | 1 (BH) | 🟣 Ponto Roxo | Biblioteca Pública Estadual de Minas Gerais (Praça da Liberdade), centro do Sistema. |
| **Comunitária Ativa** | **55** | 39 | 🟢 Ponto Verde | Geridas por coletivos e associações civis em bairros periféricos e distritos. |

---

## 📋 ESTRUTURA DOS 393 MUNICÍPIOS DESASSISTIDOS

Para apoiar a tomada de decisão técnica do **SEBPC/MG**, os 393 municípios sem biblioteca pública ativa estão rigorosamente divididos em subcategorias de gestão:

| Situação Cadastral | Mun. | % MG | População '22 | Marcador no Mapa | Diretriz de Política Pública |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Sem Registro Histórico no SEBPC/MG** | 324 | 38,0% | 2.453.069 hab. | ⚠️ Triângulo Amarelo / Cinza | Busca ativa, articulação com prefeituras, criação por lei e implantação inicial. |
| **Sem Dados Recentes (> 4 anos)** | 58 | 6,8% | 636.766 hab. | ⚠️ Triângulo Amarelo / Laranja | Censo de revalidação cadastral junto aos novos secretários municipais. |
| *↳ Subtotal "Sem informação atualizada"* | **382** | **44,8%** | **3.089.835 hab.** | ⚠️ Triângulo Amarelo | *Subfiltro que reúne as cidades para ações de regularização e contato ativo.* |
| **Biblioteca Fechada ou em Reforma** | 4 | 0,5% | 141.310 hab. | 📕 Livro Vermelho Fechado | Apoio técnico à reabertura, mobiliário, recuperação predial e fomento. |
| **Declarado Oficialmente Sem Biblioteca** | 2 | 0,2% | 6.875 hab. | 📕 Livro Vermelho Fechado | Pescador e São Geraldo da Piedade (municípios com registro de baixa/ausência de biblioteca ativa). |
| *↳ Subtotal "Fechada / Em Reforma"* | **6** | **0,7%** | **148.185 hab.** | 📕 Livro Vermelho Fechado | *Cidades com infraestrutura e patrimônio já existente, prioritárias para reativação.* |
| **Apenas Biblioteca Comunitária Ativa** | 5 | 0,6% | 91.795 hab. | 📖 Marcador Lilás suave | Pirapora, Itapecerica, Aiuruoca, Laranjal e Simão Pereira. |
| **Total sem Biblioteca Pública Municipal** | **393** | **46,1%** | **3.329.815 hab.** | - | **Fechamento: 460 com pública ativa + 393 desassistidos = 853 municípios de MG.** |

---

## 🔴 CAMADA CARTOGRÁFICA DE BOLHAS DE POPULAÇÃO (≥ 20k hab.) E JUSTIFICATIVA TÉCNICA

O mapa incorpora uma camada de **círculos graduados translúcidos em vermelho** sobre os municípios desassistidos que possuem **20.000 habitantes ou mais** (total de **28 municípios** no estado):

### 🎯 Racionalidade Técnica e Decisória do Corte em 20.000 Habitantes

* **Critério Oficial do IBGE / Estatuto da Cidade:** 20 mil hab. é o marco federal que separa o Pequeno Porte I do Médio Porte e obriga a elaboração de Plano Diretor municipal.
* **Legibilidade Cartográfica:** Evita poluir o mapa com centenas de bolhas em cidades pequenas (onde a média é inferior a 5 mil moradores), preservando a clareza em reuniões executivas.
* **Vácuo Populacional Crítico:** Destaca onde o dano social é mais grave: cidades como *Coronel Fabriciano (105k)*, *Cataguases (66k)*, *Pirapora (56k)*, *Visconde do Rio Branco (39k)* e *Jaíba (38k)* somam **mais de 900 mil pessoas** sem biblioteca pública cadastrada.
* **Frente de Ataque Estratégica:** Permite ao Governo de Minas atuar cirurgicamente nos 28 maiores gargalos demográficos, elevando a cobertura populacional do estado de 83,8% para mais de 88%.

* **Sincronia Estrita com os Filtros:** A camada responde diretamente ao que o usuário seleciona:
  - No subfiltro `🔥 > 20k hab.`: exibe exatamente os círculos prioritários de MG.
  - No subfiltro `📕 Fechada/Reforma`: exibe a bolha de população apenas quando o município filtrado possui mais de 20 mil habitantes (neste recorte, *Coronel Fabriciano*, com 104,7 mil hab.), ocultando automaticamente as bolhas das demais categorias.
  - No subfiltro `⚠️ Sem dados atualizados`: exibe as cidades desse recorte com mais de 20k hab.
  - Ao selecionar uma **Região Intermediária** (ex.: Uberlândia), exibe apenas os vazios daquela região (ex.: *Santa Vitória e Tupaciguara*).

---

## 🗂️ RASTREABILIDADE COM PROCESSO SEI OFICIAL & COLUNAS N, O, P

Para assegurar que o mapa sirva como ferramenta diária de trabalho da equipe técnica do **SEBPC/MG**, cada ficha de biblioteca exibe diretamente:

* **Número do Processo SEI:** Cada biblioteca possui o seu número de processo SEI cadastrado (ex.: `1410.01.0005141/2024-13`), permitindo localizar o histórico da biblioteca/município no Sistema de Bibliotecas.
* **Responsável Local (Coluna N):** Nome do coordenador ou bibliotecário encarregado da unidade no município.
* **Telefone / WhatsApp (Coluna O):** Contato direto para mobilização rápida e orientações técnicas.
* **E-mail Institucional (Coluna P):** Canal oficial de comunicação entre o SEBPC/MG e o município.
* **Observações da Equipe:** Campo destinado a anotações internas da equipe de atendimento do SEBPC/MG (ex.: *"Responsável: Cleide"*).

---

## 🎓 ATUAÇÃO DO SISTEMA ESTADUAL (2023–2026)

A seção de atuação do Sistema Estadual nas fichas adota:

* **Nomenclatura Oficial Aprovada:** A ferramenta adota formalmente o termo **"capacitações"** (ao invés de capacitados), espelhando o formato de prestação de contas dos relatórios de gestão do SEBPC/MG.
* **Cabeçalho Consolidado:** Exibe o somatório total acumulado no quadriênio: **`X capacitações • Y assessorias`** com o selo verde *Atendida no Quadriênio (2023–2026)*.
* **Linhas Anuais:** Apresenta em uma única linha contínua os 4 exercícios: **`['23]`**, **`['24]`**, **`['25]`** e **`['26 (1ºS)]`**, destacando o volume de capacitações e assessorias recebidas em cada ano.

---

## 🏛️ INTEGRAÇÃO COM PROGRAMAS E CERTIFICAÇÕES SETORIAIS

| Programa / Política | Unidades | Selo / Identificação | Impacto Institucional & Recursos |
| :--- | :---: | :--- | :--- |
| **Programa PNLD+** | **243** | 📦 Lote de Acervo FNDE | Contempladas com remessas do FNDE/MEC (127.110 livros literários federais distribuídos). |
| **Declaração de Acervos Culturais (DAC)** | **246** | 🏛️ DAC Deferida | Acervos de memória reconhecidos pelo IEPHA/SECULT, gerando repasses financeiros aos municípios. |
| **Noite Mineira (NMMB)** | **279** | 🌙 1ª a 18ª Edição | Bibliotecas participantes da programação noturna (filtro exclusivo para cada uma das 18 edições). |
| **Semana da Literatura (SEIL)** | **269** | 📖 1ª a 6ª Edição | Circuito literário estadual (filtro interativo para cada uma das 6 edições). |
| **Status BiblioBR (MinC / SNBP)** | **424 / 569** | 🏛️ Cadastro Nacional | Filtro oficial por status: Cadastradas (424), Aprovado (179), Rascunho (195), Em diligência (17), Aguardando análise (10), Indeferido (20), Gestor MinC (3) e Não iniciou o cadastro (145). |

---

## 🧭 ROTEIRO PRÁTICO: OS 6 CRUZAMENTOS ESTRATÉGICOS & EXPORTAÇÕES

### 1. Priorização dos Grandes Vazios Populacionais (Bolhas > 20k hab.) — *Prioridade para o Fomento*
* **Objetivo:** Identificar as cidades sem biblioteca onde a implantação causará maior impacto humano e social.
* **Passo a passo:**
  1. Marque `[x] Exibir apenas sem biblioteca pública ativa` ➔ Selecione o subfiltro `🔥 > 20k hab. (28)`.
  2. Ordene a lista por `👥 Maior População`. O mapa destacará os 28 círculos vermelhos (de Coronel Fabriciano a Barroso).
  3. Clique no botão `📥 Exportar` para gerar a lista dos municípios prioritários.

### 2. Apoio Emergencial à Reabertura (Fechadas / Reforma — 6) — *Reativação Predial*
* **Objetivo:** Auxiliar municípios que já contam com patrimônio, mas dependem de suporte para reabrir as portas.
* **Passo a passo:**
  1. Marque o subfiltro `📕 Fechada/Reforma (6)`.
  2. O mapa isolará os 6 municípios com ícone de livro fechado 📕 (*Coronel Fabriciano, Resplendor, Igaratinga, Rio Novo, Pescador e São Geraldo da Piedade*), destacando a bolha demográfica de grande porte em *Coronel Fabriciano (105k hab.)*.

### 3. Mutirão Cadastral e Regularização por Lei (Sem informação atualizada — 382) — *Busca Ativa*
* **Objetivo:** Planejar campanhas regionais de busca ativa e orientação para criação formal da biblioteca por lei municipal.
* **Passo a passo:**
  1. Marque o subfiltro `⚠️ Sem informação atualizada (382)`.
  2. No menu suspenso, filtre por **Região Intermediária** (ex.: *Teófilo Otoni* ou *Montes Claros*). O mapa exibirá os triângulos ⚠️ e as bolhas regionais.

### 4. Núcleo Fiel do Sistema: Quadriênio Contínuo (2023–2026) — *Monitoramento PPAG*
* **Objetivo:** Mapear bibliotecas com histórico consolidado e engajamento contínuo nas ações do SEBPC/MG.
* **Passo a passo:**
  1. Marque simultaneamente os filtros `2026`, `2025`, `2024` e `2023 (345)`.
  2. Os cards destacarão a insígnia unificada `🎓 Sistema '23-'26`, exibindo a ficha completa com as linhas anuais de capacitações e assessorias.

### 5. Acompanhamento de Fomento Federal (Programa PNLD+ — 243 Bibliotecas) — *Supervisão de Acervos*
* **Objetivo:** Fiscalizar o recebimento de acervos federais e apoiar o agendamento de visitas técnicas de campo.
* **Passo a passo:**
  1. Marque `[x] Programa PNLD+ (243)`. Os cards exibirão a quantidade exata de livros recebidos. **Autodeclaração.**
  2. Ao clicar na biblioteca, utilize o botão `🚙 Traçar Rota no Google Maps` para planejar roteiros logísticos de viagem.

### 6. Governança Descentralizada: Rede Integra Geraes (24 Polos) — *Articulação Regional*
* **Objetivo:** Acionar as Bibliotecas-Polo para multiplicar ações nas respectivas microrregiões.
* **Passo a passo:**
  1. Marque `[x] Rede Integra Geraes - Polos (24)`. As estrelas douradas indicarão os centros regionais de referência.
