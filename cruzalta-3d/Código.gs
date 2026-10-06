/**
 * =====================================================================
 * CRUZ ALTA 3D · APS Cruz Alta · Código.gs
 * Maquete voxel de Cruz Alta (RS) com a rede de saúde municipal.
 *
 * O que este arquivo faz:
 *  - Publica o Index.html como app da Web (pode ser embutido no Google Sites).
 *  - Cria e organiza sozinho a planilha "Cruz Alta 3D · Rede de Saúde":
 *    abas Unidades, Configuração, Log e Instruções (cabeçalhos, validações,
 *    filtros, cores, congelamento e destaque de duplicidades).
 *  - Grava posições das unidades, o padrão de ajustes e o mapa no servidor,
 *    sempre com o PIN de edição definido na aba Configuração.
 *  - Guarda no Drive uma cópia compactada do mapa do OpenStreetMap e, se
 *    preciso, baixa o mapa pelo servidor (UrlFetch).
 *  - Geocodifica endereços das unidades com o serviço Maps do Google.
 *
 * Primeiro uso:
 *  1. Cole este Código.gs e o Index.html num projeto do Apps Script.
 *  2. Rode configurarSistema() uma vez e autorize.
 *  3. Na planilha criada, aba Configuração, defina o PIN de edição.
 *  4. Implantar > Nova implantação > App da Web
 *     (Executar como: eu · Quem pode acessar: qualquer pessoa).
 * =====================================================================
 */

const APP = {
  NOME: 'Cruz Alta 3D',
  VERSAO: '1.0.0',
  TITULO: 'Cruz Alta 3D · APS Cruz Alta',
  FUSO: 'America/Sao_Paulo'
};
const REPO_RAW = 'https://raw.githubusercontent.com/receitailustrada/smsca/refs/heads/main/';
const NOME_PLANILHA = 'Cruz Alta 3D · Rede de Saúde (base de dados)';
const NOME_PASTA = 'Cruz Alta 3D · Dados do mapa';
const NOME_ARQUIVO_CACHE = 'cruzalta-3d-osm.json.gz';

const PROP = {
  PLANILHA_ID: 'CA3D_PLANILHA_ID',
  PASTA_ID: 'CA3D_PASTA_ID',
  CACHE_ID: 'CA3D_CACHE_ARQUIVO_ID',
  CACHE_DATA: 'CA3D_CACHE_ATUALIZADO_EM',
  CACHE_BYTES: 'CA3D_CACHE_BYTES',
  ULTIMA_BUSCA: 'CA3D_ULTIMA_BUSCA_OSM'
};
const ABA = { UNIDADES: 'Unidades', CONFIG: 'Configuração', LOG: 'Log', INSTRUCOES: 'Instruções' };

const CAB_UNIDADES = ['ID', 'Sigla', 'Nome', 'Tipo', 'Bairro (IBGE)', 'Endereço', 'Telefone', 'Latitude', 'Longitude',
  'Fonte da posição', 'Imagem (arquivo ou URL)', 'Ativo', 'Observações', 'Atualizado em', 'Atualizado por'];
const COL = { ID: 1, SIGLA: 2, NOME: 3, TIPO: 4, BAIRRO: 5, ENDERECO: 6, TELEFONE: 7, LAT: 8, LON: 9, FONTE: 10,
  IMAGEM: 11, ATIVO: 12, OBS: 13, ATUALIZADO_EM: 14, ATUALIZADO_POR: 15 };
const CAB_LOG = ['Data e hora', 'Nível', 'Ação', 'Detalhe', 'Usuário'];
const CAB_CONFIG = ['Chave', 'Valor', 'Descrição'];
const CHAVE_CFG = {
  PIN: 'PIN de edição',
  AJUSTES: 'Ajustes padrão (JSON)',
  DIAS: 'Mapa no servidor: validade (dias)',
  VERSAO: 'Versão do sistema',
  CRIADO: 'Planilha criada em'
};

const TIPOS = ['ESF', 'EAP', 'UBS', 'UPA', 'Hospital', 'Especialidades', 'Farmácia', 'Programa', 'Outro'];
const FONTES_POSICAO = ['Planilha', 'Ajuste no mapa 3D', 'Geocodificação Google', 'OpenStreetMap', 'Aproximada (bairro)'];
const LIMITES_CRUZ_ALTA = { latMin: -28.80, latMax: -28.50, lonMin: -53.75, lonMax: -53.45 };
const MAX_LINHAS_LOG = 3000;

/* Malha de Bairros do IBGE, Censo 2022 (nomes oficiais) */
const BAIRROS_IBGE = [
  'Abegay I', 'Acelino Flores', 'Aliança', 'Alvorada', 'Amizade', 'Arco Íris', 'Azambuja', 'Bela Vista',
  'Boa Parada', 'Brenner', 'Brum I', 'Brum II', 'Bráz Caino', 'Central', 'Centro', 'Conceição', 'Dirceu',
  'Educacional', 'Emílio Droppa', 'Esperança', 'Farroupilha', 'Garibaldi', 'Gobo', 'Hilda', 'Independência',
  'Jardim América', 'Jardim Primavera', 'Jung', 'Lizabel', 'Ludke', 'Machado', 'Malheiros', 'Marcelo',
  'Melvin Jones', 'Militar', 'Nossa Senhora da Penha', 'Pedro Bonini I', 'Pedro Bonini II', 'Perpétuo Socorro',
  'Petrópolis I', 'Petrópolis II', 'Planalto', 'Prefeito Vila Nova', 'Progresso', 'Rancho do Rio Grande I',
  'Rancho do Rio Grande II', 'Rocha', 'Santa Bárbara', 'Santa Helena', 'Santa Rita', 'Santa Terezinha I',
  'Santa Terezinha II', 'Santo Antão', 'Santo Antônio', 'Schettert', 'São Francisco', 'São Genaro',
  'São Jorge', 'São José', 'São João', 'São Miguel', 'Tamoio', 'Toribio Veríssimo I', 'Toribio Veríssimo II',
  'de Fátima', 'do Sol', 'dos Funcionários'
];

/* Lista inicial da rede (mesmos IDs do Index.html). [id, sigla, nome, tipo, bairro de referência, imagem] */
const UNIDADES_INICIAIS = [
  ['esf-01', 'ESF I', 'ESF I · Toríbio Veríssimo', 'ESF', 'Toribio Veríssimo I', 'esf--I-tv.png'],
  ['esf-02', 'ESF II', 'ESF II · Vila Abegai', 'ESF', 'Abegay I', 'esf--ii--ab.png'],
  ['esf-03', 'ESF III', 'ESF III · Vila Alvorada', 'ESF', 'Alvorada', 'esf--III-alvorada.png'],
  ['esf-04', 'ESF IV', 'ESF IV · DNER', 'ESF', '', 'esf--IV-dner.png'],
  ['esf-05', 'ESF V', 'ESF V · Santa Rita', 'ESF', 'Santa Rita', 'esf--v-sr.png'],
  ['esf-06', 'ESF VI', 'ESF VI · Santa Terezinha II', 'ESF', 'Santa Terezinha II', 'ESF--VI-Santa-Terezinha-II.png'],
  ['esf-07', 'ESF VII', 'ESF VII · Bairro Brum I', 'ESF', 'Brum I', 'ESF-VI-Bairro-Brum-I.png'],
  ['esf-08', 'ESF VIII', 'ESF VIII · São José', 'ESF', 'São José', 'esf--VIII-bsj.png'],
  ['esf-09', 'ESF IX', 'ESF IX · Jardim Primavera', 'ESF', 'Jardim Primavera', 'esf--IX-bjp.png'],
  ['esf-10', 'ESF X', 'ESF X · Vila Nova (Maria Inês Faccin)', 'ESF', '', 'esf---x-vnmif.png'],
  ['esf-11', 'ESF XI', 'ESF XI · Penha', 'ESF', 'Nossa Senhora da Penha', 'ESF---XI-penha.png'],
  ['esf-12', 'ESF XII', 'ESF XII · São Genaro', 'ESF', 'São Genaro', 'esf--xii-sg.png'],
  ['esf-13', 'ESF XIII', 'ESF XIII · Progresso', 'ESF', 'Progresso', 'esf--XIII-bp.png'],
  ['esf-14', 'ESF XIV', 'ESF XIV · Acelino Flores', 'ESF', 'Acelino Flores', 'esf--xiv-af.png'],
  ['esf-15', 'ESF XV', 'ESF XV · Bairro de Fátima', 'ESF', 'de Fátima', 'esf-xv-fatima.png'],
  ['esf-16', 'ESF XVI', 'ESF XVI · Vila Lizabel', 'ESF', 'Lizabel', 'esf--XVI-lz.png'],
  ['esf-18', 'ESF XVIII', 'ESF XVIII · Vila Rocha', 'ESF', 'Rocha', 'esf-vila-rocha.png'],
  ['esf-19', 'ESF XIX', 'ESF XIX · Centro', 'ESF', 'Centro', 'esf--XIX-centro.png'],
  ['esf-20', 'ESF XX', 'ESF XX · Boa Parada', 'ESF', 'Boa Parada', 'esf---boaparada.png'],
  ['esf-21', 'ESF XXI', 'ESF XXI · Bairro Bonini', 'ESF', 'Pedro Bonini I', 'esf--xxi-bonini.png'],
  ['eap-bn', 'EAP', 'EAP Benjamin Nott', 'EAP', '', 'eap-bn.png'],
  ['ubs-vn', 'UBS', 'UBS Vida Nova', 'UBS', '', 'ESF-vida-nova-1280.png'],
  ['upa-24h', 'UPA', 'UPA 24h', 'UPA', '', 'smsca-esf-upa-24h-512.png'],
  ['hsvp', 'HSVP', 'Hospital São Vicente de Paulo', 'Hospital', '', 'smsca-hsvp-512.png'],
  ['cem', 'CEM', 'CEM', 'Especialidades', '', 'smsca-esf-cem-512.png'],
  ['curativos', 'CURATIVOS', 'Central de Curativos', 'Especialidades', '', 'smsca-esf-central-de-curativos-512.png'],
  ['farmacia-mun', 'FARMÁCIA', 'Farmácia Municipal', 'Farmácia', '', 'farmacia-municipal-ca.png'],
  ['s60', '60+', 'Sessenta Mais Cruz Alta (Saúde 60+ RS)', 'Programa', '', 'smsca-esf-saude-60-mais-rs-512.png'],
  ['ser-mulher', 'SER MULHER', 'Ser Mulher RS', 'Programa', '', 'smsca-esf-ser-mulher-rs-512.png']
];

/* OpenStreetMap (mesma consulta e compactação do Index.html; mantenha os dois iguais) */
const CAIXA_OSM = { s: -28.6954, w: -53.6539, n: -28.6031, e: -53.5556 };
const SERVIDORES_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const TAGS_UTEIS = ['highway', 'name', 'building', 'building:levels', 'height', 'roof:levels', 'amenity', 'healthcare', 'leisure', 'landuse',
  'natural', 'waterway', 'railway', 'place', 'tourism', 'historic', 'religion', 'surface', 'area', 'addr:street', 'addr:housenumber',
  'phone', 'contact:phone', 'operator', 'official_name', 'short_name', 'alt_name', 'bridge', 'tunnel', 'layer', 'width', 'lanes', 'healthcare:speciality'];

/* =====================================================================
   WEB APP
   ===================================================================== */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP.TITULO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setFaviconUrl(REPO_RAW + 'rxi-brasao-cruz-alta-512.png');
}

/** Menu quando o script estiver vinculado à planilha (Extensões > Apps Script). */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Cruz Alta 3D')
      .addItem('Organizar a planilha', 'configurarSistema')
      .addItem('Geocodificar endereços sem coordenada', 'geocodificarUnidades')
      .addItem('Baixar o mapa do OpenStreetMap no servidor', 'atualizarMapaNoServidor')
      .addSeparator()
      .addItem('Testar o sistema', 'testarSistema')
      .addToUi();
  } catch (err) {
    console.log('onOpen sem interface: ' + err);
  }
}

/* =====================================================================
   FUNÇÕES CHAMADAS PELO Index.html (google.script.run)
   Sempre devolvem objetos simples (sem Date) com ok: true/false.
   ===================================================================== */
function obterContextoInicial() {
  try {
    const ss = garantirEstrutura_();
    const cfg = lerConfig_(ss);
    return {
      ok: true,
      versao: APP.VERSAO,
      planilhaUrl: ss.getUrl(),
      unidades: lerUnidades_(ss),
      config: cfg.ajustes || null,
      edicao: !!cfg.pin,
      cache: infoCache_(),
      geradoEm: new Date().toISOString()
    };
  } catch (err) {
    registrarLog_('ERRO', 'obterContextoInicial', err);
    return { ok: false, erro: 'Não foi possível ler a planilha da rede: ' + mensagem_(err) };
  }
}

function obterCacheCidade() {
  try {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty(PROP.CACHE_ID);
    if (!id) return { ok: true, existe: false };
    let arquivo;
    try { arquivo = DriveApp.getFileById(id); } catch (e) { return { ok: true, existe: false }; }
    if (arquivo.isTrashed()) return { ok: true, existe: false };
    const bytes = arquivo.getBlob().getBytes();
    return {
      ok: true, existe: true,
      gz: Utilities.base64Encode(bytes),
      bytes: bytes.length,
      atualizadoEm: props.getProperty(PROP.CACHE_DATA) || arquivo.getLastUpdated().toISOString()
    };
  } catch (err) {
    registrarLog_('ERRO', 'obterCacheCidade', err);
    return { ok: false, erro: 'Não foi possível ler o mapa salvo no servidor: ' + mensagem_(err) };
  }
}

/**
 * Baixa o mapa do OpenStreetMap pelo servidor (UrlFetch), compacta, guarda no Drive e devolve em gzip/base64.
 * Sem "forcar", reaproveita a cópia salva enquanto estiver dentro da validade.
 */
function buscarCidadeServidor(forcar) {
  const trava = LockService.getScriptLock();
  try {
    const ss = garantirEstrutura_();
    const cfg = lerConfig_(ss);
    const info = infoCache_();
    const validadeMs = Math.max(1, cfg.dias) * 86400000;
    if (info.existe && !forcar && (Date.now() - new Date(info.atualizadoEm).getTime()) < validadeMs) {
      return obterCacheCidade();
    }
    const props = PropertiesService.getScriptProperties();
    const ultima = Number(props.getProperty(PROP.ULTIMA_BUSCA) || 0);
    if (Date.now() - ultima < 10 * 60000) {
      if (info.existe) return obterCacheCidade();
      throw new Error('O servidor tentou baixar o mapa há menos de 10 minutos. Aguarde um pouco e tente de novo.');
    }
    if (!trava.tryLock(30000)) throw new Error('Outro download do mapa está em andamento. Tente em alguns minutos.');
    props.setProperty(PROP.ULTIMA_BUSCA, String(Date.now()));
    const json = baixarOverpassServidor_();
    const compacto = compactarOSM_(json);
    if (compacto.el.length < 100) throw new Error('O OpenStreetMap devolveu poucos elementos (' + compacto.el.length + ').');
    const texto = JSON.stringify(compacto);
    const arquivo = gravarCacheDrive_(texto);
    registrarLog_('INFO', 'buscarCidadeServidor', 'Mapa baixado no servidor: ' + compacto.el.length + ' elementos, ' + arquivo.getSize() + ' bytes compactados');
    return obterCacheCidade();
  } catch (err) {
    registrarLog_('ERRO', 'buscarCidadeServidor', err);
    return { ok: false, erro: mensagem_(err) };
  } finally {
    try { trava.releaseLock(); } catch (e) { /* trava não adquirida */ }
  }
}

/** Publica no servidor o mapa enviado pelo navegador (exige PIN). */
function salvarCacheCidade(textoJson, pin) {
  const trava = LockService.getScriptLock();
  try {
    validarPin_(pin);
    if (typeof textoJson !== 'string' || textoJson.length < 1000) throw new Error('Conteúdo do mapa vazio ou inválido.');
    if (textoJson.length > 60 * 1024 * 1024) throw new Error('O mapa enviado passa de 60 MB.');
    const dados = JSON.parse(textoJson);
    if (!dados || !Array.isArray(dados.el) || dados.el.length < 100) throw new Error('O arquivo não está no formato do Cruz Alta 3D (lista "el").');
    if (!caixaCompativel_(dados.caixa)) throw new Error('O mapa enviado não corresponde à área de Cruz Alta.');
    if (!trava.tryLock(30000)) throw new Error('Outra gravação do mapa está em andamento.');
    const arquivo = gravarCacheDrive_(JSON.stringify(dados));
    const info = infoCache_();
    registrarLog_('INFO', 'salvarCacheCidade', 'Mapa publicado pelo navegador: ' + dados.el.length + ' elementos, ' + arquivo.getSize() + ' bytes');
    return { ok: true, atualizadoEm: info.atualizadoEm, bytes: info.bytes };
  } catch (err) {
    registrarLog_('ERRO', 'salvarCacheCidade', err);
    return { ok: false, erro: mensagem_(err) };
  } finally {
    try { trava.releaseLock(); } catch (e) { /* trava não adquirida */ }
  }
}

/** Grava latitude e longitude de uma unidade (clique no mapa 3D). Exige PIN. Sem duplicar linhas. */
function salvarPosicaoUnidade(id, lat, lon, pin) {
  const trava = LockService.getScriptLock();
  try {
    validarPin_(pin);
    const idLimpo = String(id || '').trim();
    if (!/^[a-z0-9][a-z0-9\-_.]{0,40}$/i.test(idLimpo)) throw new Error('Identificador de unidade inválido.');
    const la = Number(lat), lo = Number(lon);
    if (!coordenadaValida_(la, lo)) throw new Error('A coordenada está fora de Cruz Alta.');
    if (!trava.tryLock(20000)) throw new Error('A planilha está ocupada. Tente de novo em instantes.');
    const ss = garantirEstrutura_();
    const sh = ss.getSheetByName(ABA.UNIDADES);
    let linha = acharLinhaPorId_(sh, idLimpo);
    const agora = new Date();
    if (!linha) {
      sh.appendRow([idLimpo, '', '', 'Outro', '', '', '', la, lo, 'Ajuste no mapa 3D', '', 'Sim', 'Linha criada pelo mapa 3D: complete os dados.', agora, usuario_()]);
      linha = sh.getLastRow();
    } else {
      sh.getRange(linha, COL.LAT, 1, 3).setValues([[arred_(la, 6), arred_(lo, 6), 'Ajuste no mapa 3D']]);
      sh.getRange(linha, COL.ATUALIZADO_EM, 1, 2).setValues([[agora, usuario_()]]);
    }
    SpreadsheetApp.flush();
    registrarLog_('INFO', 'salvarPosicaoUnidade', idLimpo + ' em ' + la.toFixed(6) + ', ' + lo.toFixed(6) + ' (linha ' + linha + ')');
    return { ok: true, linha: linha, atualizadoEm: agora.toISOString() };
  } catch (err) {
    registrarLog_('ERRO', 'salvarPosicaoUnidade', err);
    return { ok: false, erro: mensagem_(err) };
  } finally {
    try { trava.releaseLock(); } catch (e) { /* trava não adquirida */ }
  }
}

/** Guarda os ajustes atuais como padrão para quem abrir o mapa pela primeira vez. Exige PIN. */
function salvarConfiguracaoPadrao(textoJson, pin) {
  const trava = LockService.getScriptLock();
  try {
    validarPin_(pin);
    if (typeof textoJson !== 'string' || textoJson.length > 20000) throw new Error('Ajustes inválidos ou grandes demais.');
    const obj = JSON.parse(textoJson);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Ajustes em formato inesperado.');
    const limpo = {};
    Object.keys(obj).forEach(function (k) {
      const v = obj[k];
      if (!/^[a-zA-Z]{1,40}$/.test(k)) return;
      if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40)) limpo[k] = v;
    });
    if (!trava.tryLock(20000)) throw new Error('A planilha está ocupada. Tente de novo em instantes.');
    const ss = garantirEstrutura_();
    gravarConfig_(ss, CHAVE_CFG.AJUSTES, JSON.stringify(limpo));
    registrarLog_('INFO', 'salvarConfiguracaoPadrao', Object.keys(limpo).length + ' ajustes salvos como padrão');
    return { ok: true, atualizadoEm: new Date().toISOString() };
  } catch (err) {
    registrarLog_('ERRO', 'salvarConfiguracaoPadrao', err);
    return { ok: false, erro: mensagem_(err) };
  } finally {
    try { trava.releaseLock(); } catch (e) { /* trava não adquirida */ }
  }
}

/** Geocodificação pelo site (exige PIN). Mesma rotina do menu. */
function geocodificarUnidadesPin(pin) {
  try {
    validarPin_(pin);
    return geocodificarUnidades();
  } catch (err) {
    registrarLog_('ERRO', 'geocodificarUnidadesPin', err);
    return { ok: false, erro: mensagem_(err) };
  }
}

/* =====================================================================
   FUNÇÕES PARA RODAR NO EDITOR (ou pelo menu da planilha vinculada)
   ===================================================================== */
/** Cria (ou reorganiza) planilha, abas, validações, formatação e pasta do Drive. */
function configurarSistema() {
  const ss = garantirEstrutura_();
  formatarTudo_(ss);
  obterPasta_(ss);
  let mapa = 'mapa do OpenStreetMap já estava salvo no Drive';
  if (!infoCache_().existe) {
    const r = buscarCidadeServidor(true);
    mapa = r.ok ? 'mapa do OpenStreetMap baixado e salvo no Drive' : 'mapa ainda não baixado (' + r.erro + '); o site tentará de novo';
  }
  const msg = 'Cruz Alta 3D pronto. Planilha: ' + ss.getUrl() + ' · ' + mapa + '.';
  registrarLog_('INFO', 'configurarSistema', msg);
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg + '\n\nDefina o PIN de edição na aba Configuração.'); } catch (e) { /* rodando fora da planilha */ }
  return { ok: true, planilhaUrl: ss.getUrl() };
}

/** Preenche latitude e longitude a partir do endereço (somente linhas com endereço e sem coordenada). */
function geocodificarUnidades() {
  const ss = garantirEstrutura_();
  const sh = ss.getSheetByName(ABA.UNIDADES);
  const n = sh.getLastRow() - 1;
  if (n < 1) return { ok: true, atualizadas: 0, ignoradas: 0, falhas: [] };
  const valores = sh.getRange(2, 1, n, CAB_UNIDADES.length).getValues();
  const geo = Maps.newGeocoder().setRegion('br').setLanguage('pt-BR');
  let atualizadas = 0, ignoradas = 0;
  const falhas = [];
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    const id = String(v[COL.ID - 1] || '').trim();
    const endereco = String(v[COL.ENDERECO - 1] || '').trim();
    const temCoord = v[COL.LAT - 1] !== '' && v[COL.LON - 1] !== '';
    if (!id || !endereco || temCoord) { ignoradas++; continue; }
    try {
      const r = geo.geocode(endereco + ', Cruz Alta - RS, Brasil');
      const res = r && r.status === 'OK' && r.results && r.results[0];
      if (!res) { falhas.push(id + ': endereço não encontrado'); continue; }
      const la = res.geometry.location.lat, lo = res.geometry.location.lng;
      if (!coordenadaValida_(la, lo)) { falhas.push(id + ': resultado fora de Cruz Alta'); continue; }
      sh.getRange(i + 2, COL.LAT, 1, 3).setValues([[arred_(la, 6), arred_(lo, 6), 'Geocodificação Google']]);
      sh.getRange(i + 2, COL.ATUALIZADO_EM, 1, 2).setValues([[new Date(), usuario_()]]);
      atualizadas++;
      Utilities.sleep(150);
    } catch (err) {
      falhas.push(id + ': ' + mensagem_(err));
    }
  }
  SpreadsheetApp.flush();
  const resumo = atualizadas + ' unidade(s) geocodificada(s); ' + falhas.length + ' falha(s).';
  registrarLog_(falhas.length ? 'ALERTA' : 'INFO', 'geocodificarUnidades', resumo + (falhas.length ? ' ' + falhas.join(' | ') : ''));
  try { SpreadsheetApp.getUi().alert(resumo + (falhas.length ? '\n\n' + falhas.join('\n') : '')); } catch (e) { /* fora da planilha */ }
  return { ok: true, atualizadas: atualizadas, ignoradas: ignoradas, falhas: falhas };
}

/** Força o download do mapa no servidor (menu da planilha ou editor). */
function atualizarMapaNoServidor() {
  const r = buscarCidadeServidor(true);
  const msg = r.ok ? 'Mapa salvo no servidor em ' + formatarData_(new Date(r.atualizadoEm)) + ' (' + Math.round((r.bytes || 0) / 1024) + ' KB).' : 'Falha: ' + r.erro;
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* fora da planilha */ }
  return { ok: !!r.ok, mensagem: msg };
}

/** Diagnóstico rápido: planilha, abas, unidades, PIN e cache. */
function testarSistema() {
  const linhas = [];
  try {
    const ss = garantirEstrutura_();
    linhas.push('Planilha: ' + ss.getUrl());
    Object.keys(ABA).forEach(function (k) { linhas.push('Aba ' + ABA[k] + ': ' + (ss.getSheetByName(ABA[k]) ? 'ok' : 'FALTANDO')); });
    const unidades = lerUnidades_(ss);
    const comCoord = unidades.filter(function (u) { return u.lat !== '' && u.lon !== ''; }).length;
    linhas.push('Unidades: ' + unidades.length + ' (' + comCoord + ' com coordenada)');
    const ids = {};
    unidades.forEach(function (u) { ids[u.id] = (ids[u.id] || 0) + 1; });
    const dup = Object.keys(ids).filter(function (k) { return ids[k] > 1; });
    linhas.push('IDs duplicados: ' + (dup.length ? dup.join(', ') : 'nenhum'));
    const cfg = lerConfig_(ss);
    linhas.push('PIN de edição: ' + (cfg.pin ? 'definido' : 'NÃO definido (edições bloqueadas)'));
    const info = infoCache_();
    linhas.push('Mapa no servidor: ' + (info.existe ? formatarData_(new Date(info.atualizadoEm)) + ', ' + Math.round(info.bytes / 1024) + ' KB' : 'ainda não salvo'));
    registrarLog_('INFO', 'testarSistema', linhas.join(' | '));
  } catch (err) {
    linhas.push('ERRO: ' + mensagem_(err));
    registrarLog_('ERRO', 'testarSistema', err);
  }
  const texto = linhas.join('\n');
  console.log(texto);
  try { SpreadsheetApp.getUi().alert(texto); } catch (e) { /* fora da planilha */ }
  return texto;
}

/* =====================================================================
   PLANILHA: criação e formatação automáticas
   ===================================================================== */
function garantirEstrutura_() {
  const props = PropertiesService.getScriptProperties();
  let ss = abrirPlanilhaExistente_(props);
  if (!ss) {
    const trava = LockService.getScriptLock();
    trava.waitLock(30000);
    try {
      ss = abrirPlanilhaExistente_(props);
      if (!ss) {
        ss = SpreadsheetApp.create(NOME_PLANILHA);
        props.setProperty(PROP.PLANILHA_ID, ss.getId());
        try { ss.setSpreadsheetTimeZone(APP.FUSO); } catch (e) { /* mantém o fuso da conta */ }
        criarAbas_(ss);
        formatarTudo_(ss);
        try { DriveApp.getFileById(ss.getId()).moveTo(obterPasta_(ss)); } catch (e) { console.log('Planilha mantida na raiz do Drive: ' + e); }
        registrarLog_('INFO', 'garantirEstrutura', 'Planilha criada: ' + ss.getUrl(), ss);
      }
    } finally {
      trava.releaseLock();
    }
  }
  if (!ss.getSheetByName(ABA.UNIDADES) || !ss.getSheetByName(ABA.CONFIG) || !ss.getSheetByName(ABA.LOG) || !ss.getSheetByName(ABA.INSTRUCOES)) {
    criarAbas_(ss);
    formatarTudo_(ss);
  }
  return ss;
}
function abrirPlanilhaExistente_(props) {
  try {
    const ativa = SpreadsheetApp.getActiveSpreadsheet();
    if (ativa) {
      if (props.getProperty(PROP.PLANILHA_ID) !== ativa.getId()) props.setProperty(PROP.PLANILHA_ID, ativa.getId());
      return ativa;
    }
  } catch (e) { /* script independente */ }
  const id = props.getProperty(PROP.PLANILHA_ID);
  if (!id) return null;
  try {
    const ss = SpreadsheetApp.openById(id);
    if (DriveApp.getFileById(id).isTrashed()) return null;
    return ss;
  } catch (e) {
    console.log('Planilha salva não abriu (' + e + '); uma nova será criada.');
    return null;
  }
}
function criarAbas_(ss) {
  let sh = ss.getSheetByName(ABA.UNIDADES);
  if (!sh) {
    const primeira = ss.getSheets()[0];
    if (ss.getSheets().length === 1 && primeira.getLastRow() === 0 && !ss.getSheetByName(ABA.UNIDADES)) {
      primeira.setName(ABA.UNIDADES);
      sh = primeira;
    } else {
      sh = ss.insertSheet(ABA.UNIDADES, 0);
    }
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CAB_UNIDADES.length).setValues([CAB_UNIDADES]);
    const linhas = UNIDADES_INICIAIS.map(function (u) {
      return [u[0], u[1], u[2], u[3], u[4], '', '', '', '', '', u[5], 'Sim', '', '', ''];
    });
    sh.getRange(2, 1, linhas.length, CAB_UNIDADES.length).setValues(linhas);
  }
  let cfg = ss.getSheetByName(ABA.CONFIG);
  if (!cfg) cfg = ss.insertSheet(ABA.CONFIG);
  if (cfg.getLastRow() === 0) {
    cfg.getRange(1, 1, 1, 3).setValues([CAB_CONFIG]);
    cfg.getRange(2, 1, 5, 3).setValues([
      [CHAVE_CFG.PIN, '', 'Defina um PIN para gravar posições, padrão de ajustes e mapa pelo site. Vazio = edição bloqueada.'],
      [CHAVE_CFG.AJUSTES, '', 'Preenchido pelo botão "Salvar como padrão do sistema". Não editar à mão.'],
      [CHAVE_CFG.DIAS, 30, 'Depois desse prazo o servidor baixa o mapa do OpenStreetMap de novo quando pedido.'],
      [CHAVE_CFG.VERSAO, APP.VERSAO, 'Versão do Código.gs que criou a planilha.'],
      [CHAVE_CFG.CRIADO, new Date(), 'Data de criação automática.']
    ]);
  }
  let log = ss.getSheetByName(ABA.LOG);
  if (!log) log = ss.insertSheet(ABA.LOG);
  if (log.getLastRow() === 0) log.getRange(1, 1, 1, CAB_LOG.length).setValues([CAB_LOG]);
  let ins = ss.getSheetByName(ABA.INSTRUCOES);
  if (!ins) ins = ss.insertSheet(ABA.INSTRUCOES);
  if (ins.getLastRow() === 0) {
    const texto = [
      ['Cruz Alta 3D · Rede de Saúde'],
      ['Esta planilha alimenta a maquete 3D de Cruz Alta (app da Web do Apps Script).'],
      [''],
      ['Aba Unidades'],
      ['Uma linha por serviço. O ID não pode repetir (fica vermelho se repetir) e não deve ser trocado depois de publicado.'],
      ['Latitude e Longitude em graus decimais (ex.: -28.643210 e -53.604321). Linhas sem coordenada ficam em amarelo.'],
      ['Sem coordenada, o mapa usa o centro do Bairro (IBGE) como posição aproximada, com pino tracejado.'],
      ['Para preencher pela tela: no mapa, selecione a unidade, clique em "Definir posição no mapa" e informe o PIN.'],
      ['Para preencher pelo endereço: preencha Endereço e use o menu Cruz Alta 3D > Geocodificar (planilha vinculada) ou rode geocodificarUnidades no editor.'],
      ['Imagem: nome do arquivo no repositório receitailustrada/smsca (ex.: esf--XIX-centro.png) ou URL completa.'],
      ['Ativo = Não esconde a unidade do mapa sem apagar a linha.'],
      [''],
      ['Aba Configuração'],
      ['PIN de edição: obrigatório para gravar pelo site. Não compartilhe e troque sempre que alguém sair da equipe.'],
      ['Ajustes padrão: preenchido pelo site. Mapa no servidor: validade em dias da cópia do OpenStreetMap.'],
      [''],
      ['Aba Log: registro automático de ações e erros (mantém as últimas ' + MAX_LINHAS_LOG + ' linhas).'],
      [''],
      ['Fontes: bairros da Malha de Bairros do IBGE (Censo 2022); ruas e prédios © colaboradores do OpenStreetMap (ODbL).'],
      ['Nenhum dado de paciente é armazenado aqui.']
    ];
    ins.getRange(1, 1, texto.length, 1).setValues(texto);
  }
}
function formatarTudo_(ss) {
  const VERDE = '#2A9A7F', TEXTO = '#13233A';
  const sh = ss.getSheetByName(ABA.UNIDADES);
  const nCol = CAB_UNIDADES.length;
  const maxLinhas = Math.max(sh.getMaxRows(), 200);
  if (sh.getMaxRows() < 200) sh.insertRowsAfter(sh.getMaxRows(), 200 - sh.getMaxRows());
  sh.getRange(1, 1, 1, nCol).setValues([CAB_UNIDADES])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground(VERDE).setFontFamily('Montserrat')
    .setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 34);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  const larguras = [90, 90, 280, 120, 170, 260, 130, 110, 110, 160, 240, 70, 260, 140, 200];
  larguras.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  const corpo = sh.getRange(2, 1, maxLinhas - 1, nCol);
  corpo.setFontFamily('Montserrat').setFontColor(TEXTO).setVerticalAlignment('middle');
  sh.getRange(2, COL.LAT, maxLinhas - 1, 2).setNumberFormat('0.000000');
  sh.getRange(2, COL.ATUALIZADO_EM, maxLinhas - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  const regra = function (lista, ajuda) {
    return SpreadsheetApp.newDataValidation().requireValueInList(lista, true).setAllowInvalid(false).setHelpText(ajuda).build();
  };
  sh.getRange(2, COL.TIPO, maxLinhas - 1, 1).setDataValidation(regra(TIPOS, 'Escolha o tipo de serviço.'));
  sh.getRange(2, COL.BAIRRO, maxLinhas - 1, 1).setDataValidation(regra(BAIRROS_IBGE.concat(['Não informado']), 'Bairro oficial do IBGE (Censo 2022).'));
  sh.getRange(2, COL.ATIVO, maxLinhas - 1, 1).setDataValidation(regra(['Sim', 'Não'], 'Não = oculta a unidade do mapa.'));
  sh.getRange(2, COL.FONTE, maxLinhas - 1, 1).setDataValidation(regra(FONTES_POSICAO, 'De onde veio a coordenada.'));
  sh.getRange(2, COL.LAT, maxLinhas - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(LIMITES_CRUZ_ALTA.latMin, LIMITES_CRUZ_ALTA.latMax).setAllowInvalid(false)
    .setHelpText('Latitude de Cruz Alta, entre ' + LIMITES_CRUZ_ALTA.latMin + ' e ' + LIMITES_CRUZ_ALTA.latMax + ' (negativa).').build());
  sh.getRange(2, COL.LON, maxLinhas - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(LIMITES_CRUZ_ALTA.lonMin, LIMITES_CRUZ_ALTA.lonMax).setAllowInvalid(false)
    .setHelpText('Longitude de Cruz Alta, entre ' + LIMITES_CRUZ_ALTA.lonMin + ' e ' + LIMITES_CRUZ_ALTA.lonMax + ' (negativa).').build());
  const faixaTudo = sh.getRange(2, 1, maxLinhas - 1, nCol);
  const regras = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A2<>"",COUNTIF($A:$A,$A2)>1)')
      .setBackground('#FCE8E8').setFontColor('#B42318').setRanges([sh.getRange(2, COL.ID, maxLinhas - 1, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A2<>"",OR($H2="",$I2=""))')
      .setBackground('#FFF4DA').setRanges([sh.getRange(2, COL.LAT, maxLinhas - 1, 2)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$L2="Não"')
      .setFontColor('#8B9BB0').setRanges([faixaTudo]).build()
  ];
  sh.setConditionalFormatRules(regras);
  if (!sh.getFilter()) sh.getRange(1, 1, maxLinhas, nCol).createFilter();
  if (!sh.getBandings().length) {
    try { sh.getRange(1, 1, maxLinhas, nCol).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false); } catch (e) { /* já havia faixas */ }
    try { sh.getBandings()[0].setHeaderRowColor(VERDE).setFirstRowColor('#ffffff').setSecondRowColor('#F3F8F6'); } catch (e) { /* cores padrão */ }
  }
  try {
    const jaProtegido = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).some(function (p) { return p.getDescription() === 'Cabeçalho do Cruz Alta 3D'; });
    if (!jaProtegido) sh.getRange(1, 1, 1, nCol).protect().setDescription('Cabeçalho do Cruz Alta 3D').setWarningOnly(true);
  } catch (e) { /* proteção opcional */ }

  const cfg = ss.getSheetByName(ABA.CONFIG);
  cfg.getRange(1, 1, 1, 3).setFontWeight('bold').setFontColor('#ffffff').setBackground(VERDE).setFontFamily('Montserrat');
  cfg.setFrozenRows(1);
  cfg.setColumnWidth(1, 260); cfg.setColumnWidth(2, 220); cfg.setColumnWidth(3, 560);
  cfg.getRange(2, 1, Math.max(1, cfg.getLastRow() - 1), 3).setFontFamily('Montserrat').setWrap(true).setVerticalAlignment('middle');
  cfg.getRange(2, 1, Math.max(1, cfg.getLastRow() - 1), 1).setFontWeight('bold');
  const linhaPin = acharLinhaConfig_(cfg, CHAVE_CFG.PIN);
  if (linhaPin) cfg.getRange(linhaPin, 2).setBackground('#FFF4DA').setNote('O PIN é conferido só no servidor e nunca é enviado ao navegador.');
  const linhaCriado = acharLinhaConfig_(cfg, CHAVE_CFG.CRIADO);
  if (linhaCriado) cfg.getRange(linhaCriado, 2).setNumberFormat('dd/MM/yyyy HH:mm');

  const log = ss.getSheetByName(ABA.LOG);
  log.getRange(1, 1, 1, CAB_LOG.length).setFontWeight('bold').setFontColor('#ffffff').setBackground('#0F1D33').setFontFamily('Montserrat');
  log.setFrozenRows(1);
  [160, 80, 200, 620, 220].forEach(function (w, i) { log.setColumnWidth(i + 1, w); });
  log.getRange(2, 1, Math.max(1, log.getMaxRows() - 1), 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  if (!log.getFilter()) log.getRange(1, 1, Math.max(2, log.getMaxRows()), CAB_LOG.length).createFilter();

  const ins = ss.getSheetByName(ABA.INSTRUCOES);
  ins.setColumnWidth(1, 980);
  ins.getRange(1, 1, Math.max(1, ins.getLastRow()), 1).setFontFamily('Montserrat').setWrap(true).setFontColor(TEXTO);
  ins.getRange(1, 1).setFontWeight('bold').setFontSize(14).setFontColor(VERDE);
  ['Aba Unidades', 'Aba Configuração', 'Aba Log: registro automático de ações e erros (mantém as últimas ' + MAX_LINHAS_LOG + ' linhas).'].forEach(function (t) {
    const f = ins.createTextFinder(t).matchEntireCell(true).findNext();
    if (f) f.setFontWeight('bold');
  });
  try { ss.setActiveSheet(sh); } catch (e) { /* sem interface */ }
}

/* =====================================================================
   LEITURA E GRAVAÇÃO
   ===================================================================== */
function lerUnidades_(ss) {
  const sh = ss.getSheetByName(ABA.UNIDADES);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const valores = sh.getRange(2, 1, n, CAB_UNIDADES.length).getValues();
  const vistos = {};
  const lista = [];
  valores.forEach(function (v) {
    const id = String(v[COL.ID - 1] || '').trim();
    if (!id || vistos[id]) return;
    vistos[id] = true;
    const num = function (x) { const f = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.')); return isFinite(f) ? f : ''; };
    lista.push({
      id: id,
      sigla: texto_(v[COL.SIGLA - 1]),
      nome: texto_(v[COL.NOME - 1]),
      tipo: TIPOS.indexOf(texto_(v[COL.TIPO - 1])) >= 0 ? texto_(v[COL.TIPO - 1]) : 'Outro',
      bairro: texto_(v[COL.BAIRRO - 1]),
      endereco: texto_(v[COL.ENDERECO - 1]),
      telefone: texto_(v[COL.TELEFONE - 1]),
      lat: num(v[COL.LAT - 1]),
      lon: num(v[COL.LON - 1]),
      fonte: texto_(v[COL.FONTE - 1]),
      imagem: texto_(v[COL.IMAGEM - 1]),
      ativo: texto_(v[COL.ATIVO - 1]).toLowerCase() !== 'não' && texto_(v[COL.ATIVO - 1]).toLowerCase() !== 'nao',
      obs: texto_(v[COL.OBS - 1])
    });
  });
  return lista;
}
function lerConfig_(ss) {
  const sh = ss.getSheetByName(ABA.CONFIG);
  const out = { pin: '', ajustes: null, dias: 30 };
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (l) {
    const k = String(l[0] || '').trim();
    if (k === CHAVE_CFG.PIN) out.pin = String(l[1] === null || l[1] === undefined ? '' : l[1]).trim();
    else if (k === CHAVE_CFG.AJUSTES && l[1]) { try { out.ajustes = JSON.parse(String(l[1])); } catch (e) { out.ajustes = null; } }
    else if (k === CHAVE_CFG.DIAS) { const d = Number(l[1]); if (isFinite(d) && d > 0) out.dias = d; }
  });
  return out;
}
function gravarConfig_(ss, chave, valor) {
  const sh = ss.getSheetByName(ABA.CONFIG);
  const linha = acharLinhaConfig_(sh, chave);
  if (linha) sh.getRange(linha, 2).setValue(valor);
  else sh.appendRow([chave, valor, '']);
  SpreadsheetApp.flush();
}
function acharLinhaConfig_(sh, chave) {
  if (!sh || sh.getLastRow() < 2) return 0;
  const col = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) if (String(col[i][0]).trim() === chave) return i + 2;
  return 0;
}
function acharLinhaPorId_(sh, id) {
  if (sh.getLastRow() < 2) return 0;
  const achado = sh.getRange(2, COL.ID, sh.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return achado ? achado.getRow() : 0;
}
function validarPin_(pin) {
  const ss = garantirEstrutura_();
  const cfg = lerConfig_(ss);
  if (!cfg.pin) throw new Error('A edição pelo site está desativada: defina o PIN de edição na aba Configuração da planilha.');
  const cache = CacheService.getScriptCache();
  const tentativas = Number(cache.get('ca3d_pin_erros') || 0);
  if (tentativas >= 8) throw new Error('Muitas tentativas com PIN incorreto. Aguarde 10 minutos.');
  if (String(pin === null || pin === undefined ? '' : pin).trim() !== cfg.pin) {
    cache.put('ca3d_pin_erros', String(tentativas + 1), 600);
    Utilities.sleep(700);
    throw new Error('PIN incorreto.');
  }
  cache.remove('ca3d_pin_erros');
}

/* =====================================================================
   DRIVE: pasta e cópia compactada do mapa
   ===================================================================== */
function obterPasta_(ss) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP.PASTA_ID);
  if (id) {
    try {
      const p = DriveApp.getFolderById(id);
      if (!p.isTrashed()) return p;
    } catch (e) { /* recria abaixo */ }
  }
  const pasta = DriveApp.createFolder(NOME_PASTA);
  props.setProperty(PROP.PASTA_ID, pasta.getId());
  return pasta;
}
function gravarCacheDrive_(textoJson) {
  const props = PropertiesService.getScriptProperties();
  const antigo = props.getProperty(PROP.CACHE_ID);
  const gz = Utilities.gzip(Utilities.newBlob(textoJson, 'application/json', 'cruzalta-3d-osm.json'), NOME_ARQUIVO_CACHE);
  const arquivo = obterPasta_().createFile(gz);
  arquivo.setDescription('Cópia compactada do mapa de Cruz Alta (OpenStreetMap, ODbL) usada pelo Cruz Alta 3D.');
  props.setProperties({
    CA3D_CACHE_ARQUIVO_ID: arquivo.getId(),
    CA3D_CACHE_ATUALIZADO_EM: new Date().toISOString(),
    CA3D_CACHE_BYTES: String(arquivo.getSize())
  });
  if (antigo && antigo !== arquivo.getId()) {
    try { DriveApp.getFileById(antigo).setTrashed(true); } catch (e) { /* já removido */ }
  }
  return arquivo;
}
function infoCache_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP.CACHE_ID);
  if (!id) return { existe: false, atualizadoEm: '', bytes: 0 };
  return { existe: true, atualizadoEm: props.getProperty(PROP.CACHE_DATA) || '', bytes: Number(props.getProperty(PROP.CACHE_BYTES) || 0) };
}

/* =====================================================================
   OPENSTREETMAP NO SERVIDOR
   ===================================================================== */
function consultaOverpass_() {
  const b = '(' + CAIXA_OSM.s + ',' + CAIXA_OSM.w + ',' + CAIXA_OSM.n + ',' + CAIXA_OSM.e + ')';
  return '[out:json][timeout:180][maxsize:268435456];\n(\n' +
    '  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|track|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]' + b + ';\n' +
    '  way["building"]' + b + ';\n' +
    '  relation["building"]' + b + ';\n' +
    '  way["leisure"~"^(park|garden|pitch|playground|stadium|sports_centre|track|recreation_ground|nature_reserve)$"]' + b + ';\n' +
    '  way["landuse"~"^(grass|recreation_ground|cemetery|forest|meadow|village_green|farmland|orchard|allotments|religious|residential|commercial|retail|industrial|reservoir|basin)$"]' + b + ';\n' +
    '  way["amenity"="grave_yard"]' + b + ';\n' +
    '  way["natural"~"^(water|wood|scrub|wetland|grassland)$"]' + b + ';\n' +
    '  relation["natural"="water"]' + b + ';\n' +
    '  relation["leisure"="park"]' + b + ';\n' +
    '  way["waterway"~"^(river|stream|canal|drain|ditch)$"]' + b + ';\n' +
    '  way["railway"~"^(rail|abandoned|disused|narrow_gauge|light_rail)$"]' + b + ';\n' +
    '  node["place"]' + b + ';\n' +
    '  nwr["amenity"~"^(clinic|doctors|hospital|pharmacy|dentist|health_post|social_facility|place_of_worship|townhall|school|university|college|kindergarten|police|fire_station|bus_station|marketplace|library|community_centre|courthouse)$"]' + b + ';\n' +
    '  nwr["healthcare"]' + b + ';\n' +
    '  nwr["tourism"~"^(museum|attraction|viewpoint|artwork)$"]' + b + ';\n' +
    '  nwr["historic"]' + b + ';\n' +
    ');\nout geom qt;';
}
function baixarOverpassServidor_() {
  const consulta = consultaOverpass_();
  let ultimoErro = '';
  for (let i = 0; i < SERVIDORES_OVERPASS.length; i++) {
    const url = SERVIDORES_OVERPASS[i];
    try {
      const resp = UrlFetchApp.fetch(url, { method: 'post', payload: { data: consulta }, muteHttpExceptions: true });
      const codigo = resp.getResponseCode();
      if (codigo !== 200) { ultimoErro = url + ' respondeu ' + codigo; continue; }
      const json = JSON.parse(resp.getContentText('UTF-8'));
      if (!json || !Array.isArray(json.elements)) { ultimoErro = url + ': resposta sem elementos'; continue; }
      if (json.remark && /error|timed out|out of memory|runtime/i.test(json.remark)) { ultimoErro = url + ': ' + json.remark; continue; }
      if (json.elements.length < 50) { ultimoErro = url + ': poucos elementos (' + json.elements.length + ')'; continue; }
      return json;
    } catch (err) {
      ultimoErro = url + ': ' + mensagem_(err);
    }
  }
  throw new Error('Nenhum servidor do OpenStreetMap respondeu. ' + ultimoErro);
}
function geomPlana_(geom) {
  if (!Array.isArray(geom) || geom.length < 2) return null;
  const g = [];
  geom.forEach(function (q) { if (q && typeof q.lat === 'number' && typeof q.lon === 'number') g.push(arred_(q.lon, 6), arred_(q.lat, 6)); });
  return g.length >= 4 ? g : null;
}
function compactarOSM_(json) {
  const el = [];
  (json.elements || []).forEach(function (e) {
    const t = e.type === 'node' ? 'n' : (e.type === 'way' ? 'w' : (e.type === 'relation' ? 'r' : null));
    if (!t) return;
    const o = { t: t, id: e.id };
    if (e.tags) {
      const tg = {};
      let tem = false;
      TAGS_UTEIS.forEach(function (k) { if (e.tags[k] !== undefined) { tg[k] = e.tags[k]; tem = true; } });
      if (tem) o.tg = tg;
    }
    if (t === 'n') {
      if (typeof e.lat !== 'number') return;
      o.c = [arred_(e.lon, 6), arred_(e.lat, 6)];
    } else if (t === 'w') {
      const g = geomPlana_(e.geometry);
      if (!g) return;
      o.g = g;
    } else {
      const m = [];
      (e.members || []).forEach(function (mb) {
        if (mb.type !== 'way') return;
        const g = geomPlana_(mb.geometry);
        if (g) m.push({ r: mb.role || '', g: g });
      });
      if (!m.length) return;
      o.m = m;
    }
    el.push(o);
  });
  return { v: 1, fonte: 'overpass', caixa: CAIXA_OSM, geradoEm: new Date().toISOString(), el: el };
}
function caixaCompativel_(c) {
  if (!c) return true;
  return Math.abs(Number(c.s) - CAIXA_OSM.s) < 0.2 && Math.abs(Number(c.w) - CAIXA_OSM.w) < 0.2 &&
    Math.abs(Number(c.n) - CAIXA_OSM.n) < 0.2 && Math.abs(Number(c.e) - CAIXA_OSM.e) < 0.2;
}

/* =====================================================================
   APOIO
   ===================================================================== */
function registrarLog_(nivel, acao, detalhe, ssOpcional) {
  try {
    const msg = mensagem_(detalhe);
    console.log('[' + nivel + '] ' + acao + ': ' + msg);
    let ss = ssOpcional || null;
    if (!ss) {
      const id = PropertiesService.getScriptProperties().getProperty(PROP.PLANILHA_ID);
      if (!id) return;
      ss = SpreadsheetApp.openById(id);
    }
    const sh = ss.getSheetByName(ABA.LOG);
    if (!sh) return;
    sh.appendRow([new Date(), nivel, acao, msg.slice(0, 2000), usuario_()]);
    const excesso = sh.getLastRow() - 1 - MAX_LINHAS_LOG;
    if (excesso > 200) sh.deleteRows(2, excesso);
  } catch (e) {
    console.log('Falha ao registrar log: ' + e);
  }
}
function usuario_() {
  try { return Session.getActiveUser().getEmail() || 'visitante'; } catch (e) { return 'visitante'; }
}
function mensagem_(err) {
  if (err === null || err === undefined) return '';
  if (typeof err === 'string') return err;
  return String(err.message || err);
}
function texto_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, APP.FUSO, 'dd/MM/yyyy');
  return String(v).trim();
}
function arred_(v, casas) {
  const f = Math.pow(10, casas);
  return Math.round(Number(v) * f) / f;
}
function coordenadaValida_(la, lo) {
  return isFinite(la) && isFinite(lo) && la >= LIMITES_CRUZ_ALTA.latMin && la <= LIMITES_CRUZ_ALTA.latMax &&
    lo >= LIMITES_CRUZ_ALTA.lonMin && lo <= LIMITES_CRUZ_ALTA.lonMax;
}
function formatarData_(d) {
  try { return Utilities.formatDate(d, APP.FUSO, 'dd/MM/yyyy HH:mm'); } catch (e) { return String(d); }
}
